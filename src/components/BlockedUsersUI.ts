// src/components/BlockedUsersUI.ts

import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from './NotificationManager';
import { BlockListDropdown } from './BlockListDropdown';
import blockedUserItemTemplate from '@public/templates/blockedUserItem.hbs';
import {
    LABELS,
    MESSAGES,
    ERRORS,
    STORAGE_KEYS, ARIA_LABELS,
} from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';

export class BlockedUsersUI {
    private blockedUsersSection: HTMLElement;
    private blockedUsersList: HTMLElement;
    private blockedUsersLoadingIndicator: HTMLElement;
    private blockedUsersPage: number = 1;
    private blockedUsersPageSize: number = 10;
    private currentBlockedUsersData: any[] = [];
    private blockedUsersService: BlockedUsersService;
    private notificationManager: NotificationManager;
    private blockListDropdown: BlockListDropdown;
    private blockedUsersToggleButton: HTMLElement;
    private blockedUsersContent: HTMLElement;
    private blockedUsersCount: HTMLElement;

    constructor(
        blockedUsersSectionId: string,
        blockedUsersService: BlockedUsersService,
        notificationManager: NotificationManager,
        blockListDropdown: BlockListDropdown
    ) {
        this.blockedUsersSection = document.getElementById(
            blockedUsersSectionId
        )!;
        this.blockedUsersList = this.blockedUsersSection.querySelector(
            '#blocked-users-list'
        )!;
        this.blockedUsersLoadingIndicator = this.blockedUsersSection.querySelector(
            '#blocked-users-loading'
        )!;
        this.blockedUsersToggleButton = this.blockedUsersSection.querySelector(
            '#blocked-users-toggle'
        )!;
        this.blockedUsersContent = this.blockedUsersSection.querySelector(
            '.content'
        )!;
        this.blockedUsersCount = this.blockedUsersSection.querySelector(
            '#blocked-users-count'
        )!;
        this.blockedUsersService = blockedUsersService;
        this.notificationManager = notificationManager;
        this.blockListDropdown = blockListDropdown;

        this.addEventListeners();
        this.applySavedToggleState();
        this.subscribeToServiceEvents();
    }

    private addEventListeners(): void {
        const blockedUsersPrev = this.blockedUsersSection.querySelector(
            '#blocked-users-prev'
        ) as HTMLElement;
        const blockedUsersNext = this.blockedUsersSection.querySelector(
            '#blocked-users-next'
        ) as HTMLElement;
        const blockedUsersSearchInput = this.blockedUsersSection.querySelector(
            '#blocked-users-search'
        ) as HTMLInputElement;

        EventListenerHelper.addEventListener(
            blockedUsersPrev,
            'click',
            () => this.changeBlockedUsersPage(-1)
        );
        EventListenerHelper.addEventListener(
            blockedUsersNext,
            'click',
            () => this.changeBlockedUsersPage(1)
        );
        EventListenerHelper.addEventListener(
            blockedUsersSearchInput,
            'input',
            () => this.handleBlockedUsersSearch(blockedUsersSearchInput.value)
        );

        // Toggle button event
        EventListenerHelper.addEventListener(
            this.blockedUsersToggleButton,
            'click',
            () => this.toggleBlockedUsersSection()
        );

        const refreshBlockedUsersButton = this.blockedUsersSection.querySelector(
            '#refresh-blocked-users'
        ) as HTMLElement;
        EventListenerHelper.addEventListener(
            refreshBlockedUsersButton,
            'click',
            () => this.refreshBlockedUsers()
        );
    }

    private subscribeToServiceEvents(): void {
        this.blockedUsersService.on('blockedUsersLoaded', (data: any[]) => {
            this.currentBlockedUsersData = data;
            this.blockedUsersPage = 1;
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
            this.updateBlockedUsersSectionTitle();
            this.showBlockedUsersSection();
            this.setBlockedUsersLoadingState(false);
        });

        this.blockedUsersService.on('blockedUsersRefreshed', (data: any[]) => {
            this.currentBlockedUsersData = data;
            this.blockedUsersPage = 1;
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
            this.notificationManager.displayNotification(
                MESSAGES.BLOCKED_USERS_LIST_REFRESHED,
                'success'
            );
            this.setBlockedUsersLoadingState(false);
        });

        this.blockedUsersService.on('blockedUserAdded', (newItem: any) => {
            this.currentBlockedUsersData.unshift(newItem);
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
        });

        this.blockedUsersService.on('blockedUserRemoved', (userHandle: string) => {
            this.currentBlockedUsersData = this.currentBlockedUsersData.filter(
                (item) => (item.subject.handle || item.subject.did) !== userHandle
            );
            this.populateBlockedUsersList();
            this.updateBlockedUsersCount();
        });

        this.blockedUsersService.on('error', (message: string) => {
            this.notificationManager.displayNotification(message, 'error');
            this.setBlockedUsersLoadingState(false);
        });
    }

    public async loadBlockedUsers(selectedUri: string): Promise<void> {
        this.setBlockedUsersLoadingState(true);
        await this.blockedUsersService.loadBlockedUsers(selectedUri);
    }

    public async refreshBlockedUsers(): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) {
            this.notificationManager.displayNotification(
                MESSAGES.PLEASE_SELECT_BLOCK_LIST_TO_REFRESH,
                'error'
            );
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
        const toggleButton = this.blockedUsersToggleButton;
        const content = this.blockedUsersContent;

        toggleButton.classList.toggle('active');
        const isActive = toggleButton.classList.contains('active');
        toggleButton.setAttribute('aria-expanded', isActive.toString());

        if (isActive) {
            content.classList.remove('d-none');
            this.saveToggleState(true);
        } else {
            content.classList.add('d-none');
            this.saveToggleState(false);
        }
    }

    private saveToggleState(isExpanded: boolean): void {
        try {
            localStorage.setItem(
                STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE,
                JSON.stringify(isExpanded)
            );
        } catch (error) {
            console.error(
                ERRORS.FAILED_TO_SAVE_BLOCKED_USERS_TOGGLE_STATE,
                error
            );
        }
    }

    private applySavedToggleState(): void {
        const savedState = this.getSavedToggleState();
        if (savedState === null || savedState === undefined) {
            // Default behavior: collapsed
            this.blockedUsersContent.classList.add('d-none');
            this.blockedUsersToggleButton.classList.remove('active');
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'false');
        } else if (savedState) {
            this.blockedUsersContent.classList.remove('d-none');
            this.blockedUsersToggleButton.classList.add('active');
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'true');
        } else {
            this.blockedUsersContent.classList.add('d-none');
            this.blockedUsersToggleButton.classList.remove('active');
            this.blockedUsersToggleButton.setAttribute('aria-expanded', 'false');
        }
    }

    private getSavedToggleState(): boolean | null {
        try {
            const state = localStorage.getItem(
                STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE
            );
            return state ? JSON.parse(state) : null;
        } catch (error) {
            console.error(
                ERRORS.FAILED_TO_RETRIEVE_BLOCKED_USERS_TOGGLE_STATE,
                error
            );
            return null;
        }
    }

    private async populateBlockedUsersList(): Promise<void> {
        this.blockedUsersList.innerHTML = '';
        const data = this.currentBlockedUsersData;
        const startIndex = (this.blockedUsersPage - 1) * this.blockedUsersPageSize;
        const endIndex = startIndex + this.blockedUsersPageSize;
        const currentPageData = data.slice(startIndex, endIndex);

        if (currentPageData.length === 0) {
            const noUsersItem = document.createElement('div');
            noUsersItem.className = 'list-group-item empty-state';
            noUsersItem.textContent = LABELS.NO_USERS_FOUND;
            this.blockedUsersList.appendChild(noUsersItem);
        } else {
            for (const item of currentPageData) {
                const listItem = await this.createBlockedUserListItem(item);
                this.blockedUsersList.appendChild(listItem);
            }
        }

        this.updatePaginationControls(data.length);
    }

    private async createBlockedUserListItem(item: any): Promise<HTMLDivElement> {
        const userDid = item.subject.did;
        let userHandle = item.subject.handle;

        if (!userHandle) {
            userHandle = await this.blockedUsersService.resolveHandleFromDid(userDid);
        }

        const htmlString = blockedUserItemTemplate({
            labels: LABELS,
            ariaLabels: ARIA_LABELS,
            userHandle
        });
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString.trim();
        const listItem = tempDiv.firstElementChild as HTMLDivElement;

        const unblockButton = listItem.querySelector(
            '.unblock-button'
        ) as HTMLButtonElement;
        const reportButton = listItem.querySelector(
            '.report-button'
        ) as HTMLButtonElement;

        EventListenerHelper.addEventListener(unblockButton, 'click', async () => {
            const selectedUri = this.blockListDropdown.getSelectedValue();
            if (!selectedUri) {
                this.notificationManager.displayNotification(
                    MESSAGES.PLEASE_SELECT_BLOCK_LIST,
                    'error'
                );
                return;
            }
            try {
                await this.blockedUsersService.unblockUser(userHandle, selectedUri);
                await this.blockedUsersService.removeBlockedUser(
                    userHandle,
                    selectedUri
                );
                this.notificationManager.displayNotification(
                    MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle),
                    'success'
                );
            } catch (error) {
                console.error(ERRORS.FAILED_TO_UNBLOCK_USER, error);
                this.notificationManager.displayNotification(
                    MESSAGES.FAILED_TO_UNBLOCK_USER,
                    'error'
                );
            }
        });

        EventListenerHelper.addEventListener(reportButton, 'click', () => {
            // Implement reporting logic if needed
        });

        return listItem;
    }

    private changeBlockedUsersPage(delta: number): void {
        const newPage = this.blockedUsersPage + delta;
        const totalPages = Math.max(
            1,
            Math.ceil(this.currentBlockedUsersData.length / this.blockedUsersPageSize)
        );

        if (newPage < 1 || newPage > totalPages) return;

        this.blockedUsersPage = newPage;
        this.populateBlockedUsersList();
    }

    private updatePaginationControls(totalItems: number): void {
        const blockedUsersPrev = this.blockedUsersSection.querySelector(
            '#blocked-users-prev'
        ) as HTMLButtonElement;
        const blockedUsersNext = this.blockedUsersSection.querySelector(
            '#blocked-users-next'
        ) as HTMLButtonElement;
        const pageInfo = this.blockedUsersSection.querySelector(
            '#blocked-users-page-info'
        ) as HTMLElement;

        const totalPages = Math.max(
            1,
            Math.ceil(totalItems / this.blockedUsersPageSize)
        );

        blockedUsersPrev.disabled = this.blockedUsersPage <= 1;
        blockedUsersNext.disabled = this.blockedUsersPage >= totalPages;

        pageInfo.textContent = LABELS.PAGE_INFO(this.blockedUsersPage, totalPages);
    }

    private handleBlockedUsersSearch(query: string): void {
        query = query.toLowerCase().trim();
        if (query) {
            this.currentBlockedUsersData = this.blockedUsersService
                .getBlockedUsersData()
                .filter((item) => {
                    const userHandle = (
                        item.subject.handle || item.subject.did
                    ).toLowerCase();
                    return userHandle.includes(query);
                });
        } else {
            this.currentBlockedUsersData = this.blockedUsersService.getBlockedUsersData();
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
        const blockedUsersToggle = this.blockedUsersSection.querySelector(
            '#blocked-users-toggle'
        ) as HTMLElement;
        if (blockedUsersToggle && selectedBlockListName) {
            blockedUsersToggle.textContent = LABELS.BLOCKED_USERS_IN_LIST(
                selectedBlockListName
            );
        }
    }

    private updateBlockedUsersCount(): void {
        const count = this.currentBlockedUsersData.length;
        this.blockedUsersCount.textContent = count.toString();
    }
}
