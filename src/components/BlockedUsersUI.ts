import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from './NotificationManager';
import { BlockListDropdown } from './BlockListDropdown';
import blockedUserItemTemplate from '@public/templates/blockedUserItem.hbs';
import { LABELS, MESSAGES, ERRORS, STORAGE_KEYS, ARIA_LABELS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';
import { StorageHelper } from '@src/utils/StorageHelper';

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

    constructor(
        blockedUsersSectionId: string,
        blockedUsersService: BlockedUsersService,
        notificationManager: NotificationManager,
        blockListDropdown: BlockListDropdown
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
        EventListenerHelper.addEventListener(this.blockedUsersPrev, 'click', () => this.changeBlockedUsersPage(-1));
        EventListenerHelper.addEventListener(this.blockedUsersNext, 'click', () => this.changeBlockedUsersPage(1));
        EventListenerHelper.addEventListener(this.blockedUsersSearchInput, 'input', () => this.handleBlockedUsersSearch(this.blockedUsersSearchInput.value));
        EventListenerHelper.addEventListener(this.blockedUsersToggleButton, 'click', () => this.toggleBlockedUsersSection());
        EventListenerHelper.addEventListener(this.refreshBlockedUsersButton, 'click', () => this.refreshBlockedUsers());
    }

    private subscribeToServiceEvents(): void {
        this.blockedUsersService.on('blockedUsersLoaded', () => {
            this.syncBlockedUsersData();
            this.blockedUsersPage = 1;
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
            this.updateBlockedUsersSectionTitle();
            this.showBlockedUsersSection();
            this.setBlockedUsersLoadingState(false);
        });

        this.blockedUsersService.on('blockedUsersRefreshed', () => {
            this.syncBlockedUsersData();
            this.blockedUsersPage = 1;
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
            this.notificationManager.displayNotification(MESSAGES.BLOCKED_USERS_LIST_REFRESHED, 'success');
            this.setBlockedUsersLoadingState(false);
        });

        // No direct array modifications here - always re-sync after add/remove
        this.blockedUsersService.on('blockedUserAdded', () => {
            this.syncBlockedUsersData();
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
        });

        this.blockedUsersService.on('blockedUserRemoved', () => {
            this.syncBlockedUsersData();
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
        });

        this.blockedUsersService.on('error', (message: string) => {
            this.notificationManager.displayNotification(message, 'error');
            this.setBlockedUsersLoadingState(false);
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
            // With caching in BlueskyService, this won't re-fetch unnecessarily
            userHandle = await this.blockedUsersService.resolveHandleFromDid(userDid);
        }

        const htmlString = blockedUserItemTemplate({ labels: LABELS, ariaLabels: ARIA_LABELS, userHandle });
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString.trim();
        const listItem = tempDiv.firstElementChild as HTMLDivElement;

        const unblockButton = listItem.querySelector('.unblock-button') as HTMLButtonElement;
        const reportButton = listItem.querySelector('.report-button') as HTMLButtonElement;

        EventListenerHelper.addEventListener(unblockButton, 'click', async () => {
            const selectedUri = this.blockListDropdown.getSelectedValue();
            if (!selectedUri) {
                this.notificationManager.displayNotification(MESSAGES.PLEASE_SELECT_BLOCK_LIST, 'error');
                return;
            }
            try {
                await this.blockedUsersService.unblockUser(userHandle!, selectedUri);
                // Removal handled by service event, no direct manipulation needed here
                this.notificationManager.displayNotification(MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle!), 'success');
            } catch (error) {
                console.error(ERRORS.FAILED_TO_UNBLOCK_USER, error);
                this.notificationManager.displayNotification(MESSAGES.FAILED_TO_UNBLOCK_USER, 'error');
            }
        });

        // Report logic remains unchanged
        EventListenerHelper.addEventListener(reportButton, 'click', () => {
            // Reporting logic (unchanged)
        });

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
}
