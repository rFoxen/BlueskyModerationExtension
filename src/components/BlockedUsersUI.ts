// src/components/BlockedUsersUI.ts

import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from './NotificationManager';
import { BlockListDropdown } from './BlockListDropdown';
import blockedUserItemTemplate from '@public/templates/blockedUserItem.hbs';
import { LABELS, MESSAGES, ERRORS, STORAGE_KEYS, ARIA_LABELS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';
import { StorageHelper } from '@src/utils/StorageHelper';

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
    let timeout: number | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = window.setTimeout(() => fn(...args), delay);
    };
}

export class BlockedUsersUI {
    private blockedUsersSection: HTMLElement;
    private blockedUsersList: HTMLElement;
    private blockedUsersLoadingIndicator: HTMLElement;
    private blockedUsersPage: number = 1;
    private readonly blockedUsersPageSize: number = 10;
    private currentBlockedUsersData: any[] = [];
    private blockedUsersService: BlockedUsersService;
    private notificationManager: NotificationManager;
    private blockListDropdown: BlockListDropdown;
    private blockedUsersToggleButton: HTMLElement;
    private blockedUsersContent: HTMLElement;
    private blockedUsersCount: HTMLElement;
    private blockedUsersSearchInput: HTMLInputElement;
    private blockedUsersPrev: HTMLButtonElement;
    private blockedUsersNext: HTMLButtonElement;
    private pageInfo: HTMLElement;
    private refreshBlockedUsersButton: HTMLElement;

    // For lazy loading:
    private isLoadingNextPage = false;

    // Store event handler references for cleanup
    private eventHandlers: { [key: string]: (...args: any[]) => void } = {};

    // Function to check if user is logged in
    private isLoggedIn: () => boolean;

    // Declare processedElements to track processed elements
    private processedElements: WeakSet<HTMLElement> = new WeakSet();

    constructor(
        blockedUsersSectionId: string,
        blockedUsersService: BlockedUsersService,
        notificationManager: NotificationManager,
        blockListDropdown: BlockListDropdown,
        isLoggedIn: () => boolean
    ) {
        this.blockedUsersSection = document.getElementById(blockedUsersSectionId)!;
        this.blockedUsersList = this.blockedUsersSection.querySelector('#blocked-users-list')!;
        this.blockedUsersLoadingIndicator = this.blockedUsersSection.querySelector('#blocked-users-loading')!;
        this.blockedUsersToggleButton = this.blockedUsersSection.querySelector('#blocked-users-toggle')!;
        this.blockedUsersContent = this.blockedUsersSection.querySelector('.content')!;
        this.blockedUsersCount = this.blockedUsersSection.querySelector('#blocked-users-count')!;
        this.blockedUsersService = blockedUsersService;
        this.notificationManager = notificationManager;
        this.blockListDropdown = blockListDropdown;
        this.isLoggedIn = isLoggedIn;

        this.blockedUsersPrev = this.blockedUsersSection.querySelector('#blocked-users-prev') as HTMLButtonElement;
        this.blockedUsersNext = this.blockedUsersSection.querySelector('#blocked-users-next') as HTMLButtonElement;
        this.blockedUsersSearchInput = this.blockedUsersSection.querySelector('#blocked-users-search') as HTMLInputElement;
        this.refreshBlockedUsersButton = this.blockedUsersSection.querySelector('#refresh-blocked-users') as HTMLElement;
        this.pageInfo = this.blockedUsersSection.querySelector('#blocked-users-page-info') as HTMLElement;

        this.addEventListeners();
        this.applySavedToggleState();
        this.subscribeToServiceEvents();
    }

    private addEventListeners(): void {
        // Corrected: All handlers now accept correct parameters
        const prevHandler = (data: any[]) => {
            this.changeBlockedUsersPage(-1);
        };
        const nextHandler = (data: any[]) => {
            this.changeBlockedUsersPage(1);
        };
        const searchHandler = debounce((data: any[]) => {
            const input = this.blockedUsersSearchInput;
            const value = input.value;
            this.handleBlockedUsersSearch(value);
        }, 300);
        const toggleSectionHandler = (data: any[]) => {
            this.toggleBlockedUsersSection();
        };
        const refreshHandler = (data: any[]) => {
            this.refreshBlockedUsers();
        };
        const scrollHandler = (data: any[]) => {
            this.checkLazyLoadCondition();
        };

        this.eventHandlers['blockedUsersLoaded'] = prevHandler;
        this.eventHandlers['blockedUsersRefreshed'] = nextHandler;
        this.eventHandlers['blockedUserAdded'] = searchHandler;
        this.eventHandlers['blockedUserRemoved'] = toggleSectionHandler;
        this.eventHandlers['error'] = refreshHandler;
        // Note: 'scroll' handler is not stored in eventHandlers as it's not a custom event

        // Add DOM event listeners
        EventListenerHelper.addEventListener(this.blockedUsersPrev, 'click', (event: Event) => {
            event.preventDefault();
            this.changeBlockedUsersPage(-1);
        });
        EventListenerHelper.addEventListener(this.blockedUsersNext, 'click', (event: Event) => {
            event.preventDefault();
            this.changeBlockedUsersPage(1);
        });
        EventListenerHelper.addEventListener(this.blockedUsersSearchInput, 'input', (event: Event) => {
            const input = event.target as HTMLInputElement;
            const value = input.value;
            this.handleBlockedUsersSearch(value);
        });
        EventListenerHelper.addEventListener(this.blockedUsersToggleButton, 'click', (event: Event) => {
            event.preventDefault();
            this.toggleBlockedUsersSection();
        });
        EventListenerHelper.addEventListener(this.refreshBlockedUsersButton, 'click', (event: Event) => {
            event.preventDefault();
            this.refreshBlockedUsers();
        });
        EventListenerHelper.addEventListener(this.blockedUsersList, 'scroll', (event: Event) => {
            this.checkLazyLoadCondition();
        });
    }

    private subscribeToServiceEvents(): void {
        const blockedUsersLoadedHandler = (data: any[]) => {
            this.syncBlockedUsersData();
            this.blockedUsersPage = 1;
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
            this.updateBlockedUsersSectionTitle();
            this.showBlockedUsersSection();
            this.setBlockedUsersLoadingState(false);
        };

        const blockedUsersRefreshedHandler = (data: any[]) => {
            this.syncBlockedUsersData();
            this.blockedUsersPage = 1;
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
            this.notificationManager.displayNotification(MESSAGES.BLOCKED_USERS_LIST_REFRESHED, 'success');
            this.setBlockedUsersLoadingState(false);
        };

        const blockedUserAddedHandler = (newItem: any) => {
            this.syncBlockedUsersData();
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
        };

        const blockedUserRemovedHandler = (userHandle: string) => {
            this.syncBlockedUsersData();
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
        };

        const errorHandler = (message: string) => {
            this.notificationManager.displayNotification(message, 'error');
            this.setBlockedUsersLoadingState(false);
        };

        // Store references for cleanup
        this.eventHandlers['blockedUsersLoaded'] = blockedUsersLoadedHandler;
        this.eventHandlers['blockedUsersRefreshed'] = blockedUsersRefreshedHandler;
        this.eventHandlers['blockedUserAdded'] = blockedUserAddedHandler;
        this.eventHandlers['blockedUserRemoved'] = blockedUserRemovedHandler;
        this.eventHandlers['error'] = errorHandler;

        // Use .on() from EventEmitter for custom events
        this.blockedUsersService.on('blockedUsersLoaded', blockedUsersLoadedHandler);
        this.blockedUsersService.on('blockedUsersRefreshed', blockedUsersRefreshedHandler);
        this.blockedUsersService.on('blockedUserAdded', blockedUserAddedHandler);
        this.blockedUsersService.on('blockedUserRemoved', blockedUserRemovedHandler);
        this.blockedUsersService.on('error', errorHandler);
    }

    private syncBlockedUsersData(): void {
        this.currentBlockedUsersData = this.blockedUsersService.getBlockedUsersData();
    }

    public async loadBlockedUsers(selectedUri: string): Promise<void> {
        this.setBlockedUsersLoadingState(true);
        await this.blockedUsersService.loadBlockedUsers(selectedUri);
    }

    public async refreshBlockedUsers(): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) {
            this.notificationManager.displayNotification(MESSAGES.PLEASE_SELECT_BLOCK_LIST_TO_REFRESH, 'error');
            return;
        }
        this.setBlockedUsersLoadingState(true);
        await this.blockedUsersService.refreshBlockedUsers(selectedUri);
    }

    public showBlockedUsersSection(): void {
        this.blockedUsersSection.classList.remove('d-none');
    }

    public hideBlockedUsersSection(): void {
        this.blockedUsersSection.classList.add('d-none');
    }

    private toggleBlockedUsersSection(): void {
        this.blockedUsersToggleButton.classList.toggle('active');
        const isActive = this.blockedUsersToggleButton.classList.contains('active');
        this.blockedUsersToggleButton.setAttribute('aria-expanded', String(isActive));

        if (isActive) {
            this.blockedUsersContent.classList.remove('d-none');
            StorageHelper.setBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, true);
        } else {
            this.blockedUsersContent.classList.add('d-none');
            StorageHelper.setBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, false);
        }
    }

    private applySavedToggleState(): void {
        const savedState = StorageHelper.getBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, false);
        if (savedState) {
            this.blockedUsersContent.classList.remove('d-none');
            this.blockedUsersToggleButton.classList.add('active');
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'true');
        } else {
            this.blockedUsersContent.classList.add('d-none');
            this.blockedUsersToggleButton.classList.remove('active');
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'false');
        }
    }

    private async populateBlockedUsersList(): Promise<void> {
        this.blockedUsersList.innerHTML = '';
        const data = this.currentBlockedUsersData;
        const startIndex = (this.blockedUsersPage - 1) * this.blockedUsersPageSize;
        const endIndex = startIndex + this.blockedUsersPageSize;
        const currentPageData = data.slice(startIndex, endIndex);

        const fragment = document.createDocumentFragment();

        if (currentPageData.length === 0) {
            const noUsersItem = document.createElement('div');
            noUsersItem.className = 'list-group-item empty-state';
            noUsersItem.textContent = LABELS.NO_USERS_FOUND;
            fragment.appendChild(noUsersItem);
        } else {
            for (const item of currentPageData) {
                const listItem = await this.createBlockedUserListItem(item);
                fragment.appendChild(listItem);
            }
        }

        this.blockedUsersList.appendChild(fragment);
        this.updatePaginationControls(data.length);
    }

    private async createBlockedUserListItem(item: any): Promise<HTMLDivElement> {
        const userDid = item.subject.did;
        let userHandle = item.subject.handle;
        if (!userHandle) {
            try {
                userHandle = await this.blockedUsersService.resolveHandleFromDid(userDid);
            } catch (error) {
                console.error('Failed to resolve user handle from DID:', error);
                userHandle = 'Unknown User';
            }
        }

        const htmlString = blockedUserItemTemplate({ labels: LABELS, ariaLabels: ARIA_LABELS, userHandle });
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString.trim();
        const listItem = tempDiv.firstElementChild as HTMLDivElement;

        const unblockButton = listItem.querySelector('.unblock-button') as HTMLButtonElement;
        const reportButton = listItem.querySelector('.report-button') as HTMLButtonElement;

        // Define handlers
        const unblockHandler = async (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            const selectedUri = this.blockListDropdown.getSelectedValue();
            if (!selectedUri) {
                this.notificationManager.displayNotification(MESSAGES.PLEASE_SELECT_BLOCK_LIST, 'error');
                return;
            }
            try {
                await this.blockedUsersService.removeBlockedUser(userHandle, selectedUri);
                this.notificationManager.displayNotification(MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle), 'success');
            } catch (error) {
                console.error(ERRORS.FAILED_TO_UNBLOCK_USER, error);
                this.notificationManager.displayNotification(MESSAGES.FAILED_TO_UNBLOCK_USER, 'error');
            }
        };

        const reportHandler = (event: Event) => {
            // Reporting logic remains unchanged
            this.handleReportUser(event, userHandle!);
        };

        // Add event listeners
        EventListenerHelper.addMultipleEventListeners(
            unblockButton,
            ['click', 'touchend'],
            unblockHandler
        );

        EventListenerHelper.addMultipleEventListeners(
            reportButton,
            ['click', 'touchend'],
            reportHandler
        );

        // Store handlers for cleanup
        (unblockButton as any)._handler = unblockHandler;
        (reportButton as any)._handler = reportHandler;

        return listItem;
    }

    private changeBlockedUsersPage(delta: number): void {
        const totalPages = Math.max(1, Math.ceil(this.currentBlockedUsersData.length / this.blockedUsersPageSize));
        const newPage = this.blockedUsersPage + delta;
        if (newPage < 1 || newPage > totalPages) return;
        this.blockedUsersPage = newPage;
        this.populateBlockedUsersList();
    }

    private updatePaginationControls(totalItems: number): void {
        const totalPages = Math.max(1, Math.ceil(totalItems / this.blockedUsersPageSize));
        this.blockedUsersPrev.disabled = this.blockedUsersPage <= 1;
        this.blockedUsersNext.disabled = this.blockedUsersPage >= totalPages;
        this.pageInfo.textContent = LABELS.PAGE_INFO(this.blockedUsersPage, totalPages);
    }

    private handleBlockedUsersSearch(query: string): void {
        query = query.toLowerCase().trim();
        const allData = this.blockedUsersService.getBlockedUsersData();
        if (query) {
            this.currentBlockedUsersData = allData.filter((item) => {
                const uHandle = (item.subject.handle || item.subject.did).toLowerCase();
                return uHandle.includes(query);
            });
        } else {
            this.currentBlockedUsersData = allData;
        }

        this.blockedUsersPage = 1;
        this.populateBlockedUsersList();
        this.updateBlockedUsersCount();
    }

    private setBlockedUsersLoadingState(isLoading: boolean): void {
        this.blockedUsersLoadingIndicator.classList.toggle('visible', isLoading);
        this.blockedUsersLoadingIndicator.classList.toggle('hidden', !isLoading);
        this.blockedUsersContent.classList.toggle('hidden', isLoading);
        this.blockedUsersContent.classList.toggle('visible', !isLoading);
    }

    private updateBlockedUsersSectionTitle(): void {
        const selectedBlockListName = this.blockListDropdown.getSelectedText();
        if (selectedBlockListName) {
            this.blockedUsersToggleButton.textContent = LABELS.BLOCKED_USERS_IN_LIST(selectedBlockListName);
        }
    }

    private updateBlockedUsersCount(): void {
        const count = this.currentBlockedUsersData.length;
        this.blockedUsersCount.textContent = String(count);
    }

    // Lazy loading implementation
    private checkLazyLoadCondition(): void {
        if (this.isLoadingNextPage) return;

        const scrollContainer = this.blockedUsersList;
        const scrollPosition = scrollContainer.scrollTop + scrollContainer.clientHeight;
        const threshold = scrollContainer.scrollHeight - 100; // Load next page when close to bottom

        // Check if there's a next page
        const totalItems = this.currentBlockedUsersData.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / this.blockedUsersPageSize));
        if (this.blockedUsersPage < totalPages && scrollPosition >= threshold) {
            this.isLoadingNextPage = true;
            this.blockedUsersPage++;
            // Simulate delay or actual loading
            setTimeout(() => {
                this.populateBlockedUsersList();
                this.isLoadingNextPage = false;
            }, 200);
        }
    }

    // Reporting logic extracted to a separate method
    private async handleReportUser(event: Event, profileHandle: string): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        if (!this.isLoggedIn()) {
            this.notificationManager.displayNotification(MESSAGES.LOGIN_REQUIRED_TO_REPORT_USERS, 'error');
            return;
        }

        try {
            const reasonTypes = [
                { code: 'com.atproto.moderation.defs#reasonSpam', label: 'Spam' },
                { code: 'com.atproto.moderation.defs#reasonViolation', label: 'Violation' },
                { code: 'com.atproto.moderation.defs#reasonMisleading', label: 'Misleading' },
                { code: 'com.atproto.moderation.defs#reasonSexual', label: 'Sexual Content' },
                { code: 'com.atproto.moderation.defs#reasonRude', label: 'Rude Behavior' },
            ];

            const reasonOptions = reasonTypes.map((r, index) => `${index + 1}. ${r.label}`).join('\n');
            const promptMessage = `${MESSAGES.PROMPT_REPORT_REASON}\n${reasonOptions}`;
            const reasonInput = prompt(promptMessage);

            if (reasonInput !== null) {
                const reasonIndex = parseInt(reasonInput.trim(), 10) - 1;
                if (reasonIndex >= 0 && reasonIndex < reasonTypes.length) {
                    const selectedReasonType = reasonTypes[reasonIndex];
                    const userDid = await this.blockedUsersService.resolveHandleFromDid(profileHandle);

                    // Ask for additional comments
                    const comments = prompt("Please enter additional comments (optional):") || "";

                    await this.blockedUsersService.reportAccount(userDid, selectedReasonType.code, comments);

                    this.notificationManager.displayNotification(MESSAGES.USER_REPORTED_SUCCESS(profileHandle), 'success');
                } else {
                    this.notificationManager.displayNotification(MESSAGES.INVALID_REPORT_SELECTION, 'error');
                }
            } else {
                this.notificationManager.displayNotification(MESSAGES.REPORT_CANCELLED, 'info');
            }
        } catch (error) {
            console.error('Error reporting user:', error);
            this.notificationManager.displayNotification(MESSAGES.FAILED_TO_REPORT_USER, 'error');
        }
    }

    // Update posts by user when blocked/unblocked
    private updatePostsByUser(profileHandle: string, isBlocked: boolean): void {
        const wrappers = document.querySelectorAll<HTMLElement>(`.block-button-wrapper[data-profile-handle="${profileHandle}"]`);
        wrappers.forEach((wrapper) => {
            const blockButtonElement = wrapper.querySelector('.toggle-block-button') as HTMLButtonElement;
            if (!blockButtonElement) return;

            if (isBlocked) {
                blockButtonElement.textContent = LABELS.UNBLOCK;
                blockButtonElement.classList.remove('block-user-button', 'btn-outline-secondary');
                blockButtonElement.classList.add('unblock-user-button', 'btn-danger');
                wrapper.classList.remove('unblocked-post');
                wrapper.classList.add('blocked-post');
            } else {
                blockButtonElement.textContent = LABELS.BLOCK;
                blockButtonElement.classList.remove('unblock-user-button', 'btn-danger');
                blockButtonElement.classList.add('block-user-button', 'btn-outline-secondary');
                wrapper.classList.remove('blocked-post');
                wrapper.classList.add('unblocked-post');
            }
        });
    }

    // New method to clean up event listeners and subscriptions
    public destroy(): void {
        // Remove all event listeners
        Object.keys(this.eventHandlers).forEach((key) => {
            const handler = this.eventHandlers[key];
            switch (key) {
                case 'blockedUsersLoaded':
                    this.blockedUsersService.off('blockedUsersLoaded', handler as any);
                    break;
                case 'blockedUsersRefreshed':
                    this.blockedUsersService.off('blockedUsersRefreshed', handler as any);
                    break;
                case 'blockedUserAdded':
                    this.blockedUsersService.off('blockedUserAdded', handler as any);
                    break;
                case 'blockedUserRemoved':
                    this.blockedUsersService.off('blockedUserRemoved', handler as any);
                    break;
                case 'error':
                    this.blockedUsersService.off('error', handler as any);
                    break;
                // No need to remove DOM event listeners here as they are anonymous functions
            }
        });

        // Clear eventHandlers object
        this.eventHandlers = {};

        // Remove all processed elements references (optional)
        this.processedElements = new WeakSet();
    }
}
