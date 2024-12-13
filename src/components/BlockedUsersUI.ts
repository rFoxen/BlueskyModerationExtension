import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from './NotificationManager';
import { BlockListDropdown } from './BlockListDropdown';
import blockedUserItemTemplate from '@public/templates/blockedUserItem.hbs';
import { LABELS, MESSAGES, ERRORS, STORAGE_KEYS, ARIA_LABELS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';
import { StorageHelper } from '@src/utils/StorageHelper';
import { Button } from './Button';

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
        this.blockedUsersLoadingIndicator = document.querySelector('#blocked-users-loading')!;
        this.blockedUsersToggleButton = this.blockedUsersSection.querySelector('#blocked-users-toggle')!;
        this.blockedUsersContent = this.blockedUsersSection.querySelector('#blocked-users-content')!;
        this.blockedUsersCount = this.blockedUsersSection.querySelector('#blocked-users-count')!;
        this.blockedUsersPrev = this.blockedUsersSection.querySelector('#blocked-users-prev') as HTMLButtonElement;
        this.blockedUsersNext = this.blockedUsersSection.querySelector('#blocked-users-next') as HTMLButtonElement;
        this.pageInfo = this.blockedUsersSection.querySelector('#blocked-users-page-info') as HTMLElement;
        this.blockedUsersSearchInput = this.blockedUsersSection.querySelector('#blocked-users-search') as HTMLInputElement;
        this.refreshBlockedUsersButton = this.blockedUsersSection.querySelector('#refresh-blocked-users') as HTMLElement;

        this.blockedUsersService = blockedUsersService;
        this.notificationManager = notificationManager;
        this.blockListDropdown = blockListDropdown;
        this.isLoggedIn = isLoggedIn;

        this.addEventListeners();
        this.applySavedToggleState();
        this.subscribeToServiceEvents();
    }

    private addEventListeners(): void {
        // Toggle Blocked Users Section
        const toggleHandler = (event: Event) => {
            event.preventDefault();
            this.toggleBlockedUsersSection();
        };
        this.eventHandlers['toggle'] = toggleHandler;
        EventListenerHelper.addEventListener(this.blockedUsersToggleButton, 'click', toggleHandler);

        // Previous Page
        const prevPageHandler = (event: Event) => {
            event.preventDefault();
            this.changeBlockedUsersPage(-1);
        };
        this.eventHandlers['prevPage'] = prevPageHandler;
        EventListenerHelper.addEventListener(this.blockedUsersPrev, 'click', prevPageHandler);

        // Next Page
        const nextPageHandler = (event: Event) => {
            event.preventDefault();
            this.changeBlockedUsersPage(1);
        };
        this.eventHandlers['nextPage'] = nextPageHandler;
        EventListenerHelper.addEventListener(this.blockedUsersNext, 'click', nextPageHandler);

        // Search Input
        const searchHandler = debounce((event: Event) => {
            const input = event.target as HTMLInputElement;
            const value = input.value;
            this.handleBlockedUsersSearch(value);
        }, 300);
        this.eventHandlers['search'] = searchHandler;
        EventListenerHelper.addEventListener(this.blockedUsersSearchInput, 'input', searchHandler);

        // Refresh Blocked Users
        const refreshHandler = (event: Event) => {
            event.preventDefault();
            this.refreshBlockedUsers();
        };
        this.eventHandlers['refresh'] = refreshHandler;
        EventListenerHelper.addEventListener(this.refreshBlockedUsersButton, 'click', refreshHandler);
    }

    private subscribeToServiceEvents(): void {
        const handlers = {
            blockedUsersLoaded: () => {
                this.syncBlockedUsersData();
                this.blockedUsersPage = 1;
                this.populateBlockedUsersList();
                this.updateBlockedUsersCount();
                this.showBlockedUsersSection();
                this.setBlockedUsersLoadingState(false);
            },
            blockedUsersRefreshed: () => {
                this.syncBlockedUsersData();
                this.blockedUsersPage = 1;
                this.populateBlockedUsersList();
                this.updateBlockedUsersCount();
                this.notificationManager.displayNotification(MESSAGES.BLOCKED_USERS_LIST_REFRESHED, 'success');
                this.setBlockedUsersLoadingState(false);
            },
            blockedUserAdded: (newItem: any) => {
                this.syncBlockedUsersData();
                this.populateBlockedUsersList();
                this.updateBlockedUsersCount();
            },
            blockedUserRemoved: (userHandle: string) => {
                this.syncBlockedUsersData();
                this.populateBlockedUsersList();
                this.updateBlockedUsersCount();
            },
            error: (message: string) => {
                this.notificationManager.displayNotification(message, 'error');
                this.setBlockedUsersLoadingState(false);
            },
        };

        Object.entries(handlers).forEach(([event, handler]) => {
            this.eventHandlers[event] = handler;
            (this.blockedUsersService as any).on(event, handler);
        });
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
        const isExpanded = this.blockedUsersToggleButton.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'false');
            this.blockedUsersContent.classList.add('d-none');
            this.blockedUsersToggleButton.classList.remove('active');
            StorageHelper.setBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, false);
        } else {
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'true');
            this.blockedUsersContent.classList.remove('d-none');
            this.blockedUsersToggleButton.classList.add('active');
            StorageHelper.setBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, true);
        }
    }

    private applySavedToggleState(): void {
        const savedState = StorageHelper.getBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, false);
        if (savedState) {
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'true');
            this.blockedUsersContent.classList.remove('d-none');
            this.blockedUsersToggleButton.classList.add('active');
        } else {
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'false');
            this.blockedUsersContent.classList.add('d-none');
            this.blockedUsersToggleButton.classList.remove('active');
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
                userHandle = LABELS.UNKNOWN_USER;
            }
        }

        // Precompute ariaLabels
        const ariaLabels = {
            unblockUserLabel: ARIA_LABELS.UNBLOCK_USER(userHandle),
            reportUserLabel: ARIA_LABELS.REPORT_USER(userHandle),
        };

        const htmlString = blockedUserItemTemplate({
            labels: LABELS,
            ariaLabels,
            userHandle,
        });

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString.trim();
        const listItem = tempDiv.firstElementChild as HTMLDivElement;

        // Replace buttons with Button components
        const unblockButton = listItem.querySelector('.unblock-button') as HTMLButtonElement;
        const reportButton = listItem.querySelector('.report-button') as HTMLButtonElement;

        const unblockBtn = new Button({
            id: `unblock-${userHandle}`,
            classNames: 'btn btn-outline-secondary btn-sm unblock-button',
            text: LABELS.UNBLOCK,
            ariaLabel: ariaLabels.unblockUserLabel,
        });

        const reportBtn = new Button({
            id: `report-${userHandle}`,
            classNames: 'btn btn-outline-danger btn-sm report-button',
            text: LABELS.REPORT,
            ariaLabel: ariaLabels.reportUserLabel,
        });

        // Replace existing buttons with new Button instances
        unblockButton.replaceWith(unblockBtn.element);
        reportButton.replaceWith(reportBtn.element);

        // Add event listeners using Button class methods
        unblockBtn.addEventListener('click', async (event: Event) => {
            event.preventDefault();
            await this.handleUnblockUser(userHandle);
        });

        reportBtn.addEventListener('click', (event: Event) => {
            event.preventDefault();
            this.handleReportUser(userHandle);
        });

        return listItem;
    }

    private async handleUnblockUser(userHandle: string): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) {
            this.notificationManager.displayNotification(MESSAGES.PLEASE_SELECT_BLOCK_LIST, 'error');
            return;
        }

        const confirmMessage = `Are you sure you want to unblock @${userHandle}?`;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            await this.blockedUsersService.removeBlockedUser(userHandle, selectedUri);
            this.notificationManager.displayNotification(MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle), 'success');
        } catch (error) {
            console.error(ERRORS.FAILED_TO_UNBLOCK_USER, error);
            this.notificationManager.displayNotification(MESSAGES.FAILED_TO_UNBLOCK_USER, 'error');
        }
    }

    private handleReportUser(userHandle: string): void {
        // Reporting logic can be handled via an event or callback
        // For simplicity, emit an event here
        // Alternatively, integrate with NotificationManager to prompt for report
        // Implementation depends on application requirements
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
        this.blockedUsersLoadingIndicator.classList.toggle('d-none', !isLoading);
        this.blockedUsersContent.classList.toggle('d-none', isLoading);
    }

    private updateBlockedUsersCount(): void {
        const count = this.currentBlockedUsersData.length;
        this.blockedUsersCount.textContent = String(count);
    }

    public async loadBlockedUsersUI(selectedUri: string): Promise<void> {
        await this.loadBlockedUsers(selectedUri);
    }

    public destroy(): void {
        // Remove all event listeners
        Object.entries(this.eventHandlers).forEach(([event, handler]) => {
            switch (event) {
                case 'toggle':
                    EventListenerHelper.removeEventListener(this.blockedUsersToggleButton, 'click', handler);
                    break;
                case 'prevPage':
                    EventListenerHelper.removeEventListener(this.blockedUsersPrev, 'click', handler);
                    break;
                case 'nextPage':
                    EventListenerHelper.removeEventListener(this.blockedUsersNext, 'click', handler);
                    break;
                case 'search':
                    EventListenerHelper.removeEventListener(this.blockedUsersSearchInput, 'input', handler);
                    break;
                case 'refresh':
                    EventListenerHelper.removeEventListener(this.refreshBlockedUsersButton, 'click', handler);
                    break;
                default:
                    // Handle other events if any
                    break;
            }
        });
        this.eventHandlers = {};

        // Unsubscribe from service events
        this.blockedUsersService.off('blockedUsersLoaded', this.eventHandlers['blockedUsersLoaded']);
        this.blockedUsersService.off('blockedUsersRefreshed', this.eventHandlers['blockedUsersRefreshed']);
        this.blockedUsersService.off('blockedUserAdded', this.eventHandlers['blockedUserAdded']);
        this.blockedUsersService.off('blockedUserRemoved', this.eventHandlers['blockedUserRemoved']);
        this.blockedUsersService.off('error', this.eventHandlers['error']);

        // Clear processed elements
        this.processedElements = new WeakSet();
    }
}
