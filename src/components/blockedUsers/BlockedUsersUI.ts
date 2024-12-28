// src\components\blockedUsers\BlockedUsersUI.ts

import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlockListDropdown } from '@src/components/blockedUsers/BlockListDropdown';
import { MESSAGES } from '@src/constants/Constants';
import { debounce } from '@src/utils/helpers/debounce';
import { BlockedUsersView } from './views/BlockedUsersView';
import { BlockedUserItemFactory } from './views/BlockedUserItemFactory';

export class BlockedUsersUI {
    private blockedUsersService: BlockedUsersService;
    private notificationManager: NotificationManager;
    private blockListDropdown: BlockListDropdown;
    private isLoggedIn: () => boolean;
    private view: BlockedUsersView;
    private itemFactory: BlockedUserItemFactory;

    private blockedUsersPage: number = 1;
    private readonly blockedUsersPageSize: number = 10;
    private currentBlockedUsersData: any[] = [];

    private domEventHandlers: { [key: string]: EventListener } = {};
    private serviceEventHandlers: { [key: string]: (...args: any[]) => void } = {};

    private processedElements: WeakSet<HTMLElement> = new WeakSet();

    // NEW: Caching the last rendered data and page to skip unnecessary re-renders
    private lastRenderedData: any[] = [];
    private lastRenderedPage: number = -1;

    constructor(
        blockedUsersSectionId: string,
        blockedUsersService: BlockedUsersService,
        notificationManager: NotificationManager,
        blockListDropdown: BlockListDropdown,
        isLoggedIn: () => boolean
    ) {
        this.blockedUsersService = blockedUsersService;
        this.notificationManager = notificationManager;
        this.blockListDropdown = blockListDropdown;
        this.isLoggedIn = isLoggedIn;

        this.view = new BlockedUsersView(blockedUsersSectionId);
        this.itemFactory = new BlockedUserItemFactory(
            this.blockedUsersService,
            this.notificationManager,
            this.handleUnblockUser.bind(this),
            this.handleReportUser.bind(this)
        );

        this.addDomEventListeners();
        this.view.applySavedToggleState();
        this.subscribeToServiceEvents();
    }

    public async loadBlockedUsersUI(selectedUri: string): Promise<void> {
        this.view.setLoadingState(true);
        await this.blockedUsersService.loadBlockedUsers(selectedUri);
    }

    public showBlockedUsersSection(): void {
        this.view.showSection();
    }

    public hideBlockedUsersSection(): void {
        this.view.hideSection();
    }

    public destroy(): void {
        for (const [event, handler] of Object.entries(this.serviceEventHandlers)) {
            this.blockedUsersService.off(event, handler);
        }
        this.serviceEventHandlers = {};

        for (const [eventKey, handler] of Object.entries(this.domEventHandlers)) {
            this.view.removeEventListener(eventKey, handler);
        }
        this.domEventHandlers = {};

        this.processedElements = new WeakSet();
        this.view.destroy();
    }

    private addDomEventListeners(): void {
        const toggleHandler = (event: Event) => {
            event.preventDefault();
            this.toggleBlockedUsersSection();
        };
        this.domEventHandlers['toggle'] = toggleHandler;
        this.view.onToggleClick(toggleHandler);

        const prevPageHandler = (event: Event) => {
            event.preventDefault();
            this.changeBlockedUsersPage(-1);
        };
        this.domEventHandlers['prevPage'] = prevPageHandler;
        this.view.onPrevPageClick(prevPageHandler);

        const nextPageHandler = (event: Event) => {
            event.preventDefault();
            this.changeBlockedUsersPage(1);
        };
        this.domEventHandlers['nextPage'] = nextPageHandler;
        this.view.onNextPageClick(nextPageHandler);

        const searchHandler = debounce((event: Event) => {
            const input = event.target as HTMLInputElement;
            const value = input.value;
            this.handleBlockedUsersSearch(value);
        }, 300);
        this.domEventHandlers['search'] = searchHandler;
        this.view.onSearchInput(searchHandler);

        const refreshHandler = (event: Event) => {
            event.preventDefault();
            this.refreshBlockedUsers();
        };
        this.domEventHandlers['refresh'] = refreshHandler;
        this.view.onRefreshClick(refreshHandler);
    }

    private subscribeToServiceEvents(): void {
        const handlers = {
            blockedUsersLoaded: () => {
                // Full reload only when first loaded or manually refreshed.
                this.reloadBlockedUsersUI();
            },
            blockedUsersRefreshed: () => {
                this.reloadBlockedUsersUI(MESSAGES.BLOCKED_USERS_LIST_REFRESHED);
            },
            // Instead of reloading the entire list on each new block/unblock,
            // we do partial updates:
            blockedUserAdded: (newItem: any) => {
                this.addUserToUI(newItem);
            },
            blockedUserRemoved: (userHandle: string) => {
                this.removeUserFromUI(userHandle);
            },
            error: (message: string) => {
                this.notificationManager.displayNotification(message, 'error');
                this.view.setLoadingState(false);
            },
        };

        for (const [event, handler] of Object.entries(handlers)) {
            this.serviceEventHandlers[event] = handler;
            this.blockedUsersService.on(event, handler);
        }
    }

    private reloadBlockedUsersUI(successMessage?: string): void {
        this.syncBlockedUsersData();
        this.blockedUsersPage = 1;
        this.populateBlockedUsersList();
        this.updateBlockedUsersCount();
        this.showBlockedUsersSection();
        if (successMessage) {
            this.notificationManager.displayNotification(successMessage, 'success');
        }
        this.view.setLoadingState(false);
    }

    private async refreshBlockedUsers(): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) {
            this.notificationManager.displayNotification(
                MESSAGES.PLEASE_SELECT_BLOCK_LIST_TO_REFRESH,
                'error'
            );
            return;
        }
        this.view.setLoadingState(true);
        await this.blockedUsersService.refreshBlockedUsers(selectedUri);
    }

    private toggleBlockedUsersSection(): void {
        const isExpanded = this.view.isSectionExpanded();
        if (isExpanded) {
            this.view.collapseSection();
        } else {
            this.view.expandSection();
        }
    }

    private syncBlockedUsersData(): void {
        this.currentBlockedUsersData = this.blockedUsersService.getBlockedUsersData();
    }

    private async populateBlockedUsersList(): Promise<void> {
        const data = this.currentBlockedUsersData;

        // PERFORMANCE OPTIMIZATION:
        // If data and page are unchanged, skip re-rendering the list.
        if (
            this.lastRenderedPage === this.blockedUsersPage &&
            this.arraysEqual(this.lastRenderedData, data)
        ) {
            return; // no changes, no need to reflow DOM
        }

        const startIndex = (this.blockedUsersPage - 1) * this.blockedUsersPageSize;
        const endIndex = startIndex + this.blockedUsersPageSize;
        const currentPageData = data.slice(startIndex, endIndex);

        if (currentPageData.length === 0) {
            this.view.showEmptyState();
        } else {
            const items: HTMLDivElement[] = [];
            for (const item of currentPageData) {
                const listItem = await this.itemFactory.create(item);
                // Optionally store a data attribute to identify the user:
                listItem.setAttribute(
                    'data-user-handle',
                    item.subject.handle || item.subject.did
                );
                items.push(listItem);
            }
            this.view.renderBlockedUsersList(items);
        }

        this.updatePaginationControls(data.length);

        // Update caches after rendering
        this.lastRenderedData = data.slice();
        this.lastRenderedPage = this.blockedUsersPage;
    }

    private arraysEqual(arr1: any[], arr2: any[]): boolean {
        if (arr1.length !== arr2.length) return false;
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }
        return true;
    }

    private async handleUnblockUser(userHandle: string): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) {
            this.notificationManager.displayNotification(
                MESSAGES.PLEASE_SELECT_BLOCK_LIST,
                'error'
            );
            return;
        }
        const confirmMessage = `Are you sure you want to unblock @${userHandle}?`;
        if (!confirm(confirmMessage)) {
            return;
        }
        try {
            await this.blockedUsersService.removeBlockedUser(userHandle, selectedUri);
            this.notificationManager.displayNotification(
                MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle),
                'success'
            );
        } catch (error) {
            console.error(error);
            this.notificationManager.displayNotification('An unknown error occurred.', 'error');
        }
    }

    private handleReportUser(userHandle: string): void {
        // Reporting logic can be handled via an event or callback
    }

    private changeBlockedUsersPage(delta: number): void {
        const totalPages = Math.max(
            1,
            Math.ceil(this.currentBlockedUsersData.length / this.blockedUsersPageSize)
        );
        const newPage = this.blockedUsersPage + delta;
        if (newPage < 1 || newPage > totalPages) return;

        this.blockedUsersPage = newPage;
        this.populateBlockedUsersList();
    }

    private updatePaginationControls(totalItems: number): void {
        const totalPages = Math.max(
            1,
            Math.ceil(totalItems / this.blockedUsersPageSize)
        );
        this.view.updatePagination(this.blockedUsersPage, totalPages);
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

    private updateBlockedUsersCount(): void {
        const count = this.currentBlockedUsersData.length;
        this.view.updateCount(count);
    }

    /**
     * PARTIAL UI UPDATE: Add newly blocked user to the top of the list (optimistic approach).
     */
    private async addUserToUI(newItem: any): Promise<void> {
        // 1. Insert into our current array in memory
        this.currentBlockedUsersData.unshift(newItem);

        // 2. Insert the new DOM element at the top, if it's on the current page
        const listContainer = this.view.getListContainerElement();
        if (!listContainer) return;

        // If the newly added user is on page 1, we can insert it at the top.
        // But if we're not on page 1, the user won't be visible anyway.
        if (this.blockedUsersPage === 1) {
            try {
                const listItem = await this.itemFactory.create(newItem);
                listItem.setAttribute(
                    'data-user-handle',
                    newItem.subject.handle || newItem.subject.did
                );
                listContainer.insertAdjacentElement('afterbegin', listItem);
            } catch (error) {
                console.error('Error creating new blocked user item:', error);
            }
        }

        // 3. Update the count and possibly other UI pieces
        this.updateBlockedUsersCount();
    }

    /**
     * PARTIAL UI UPDATE: Remove the user from the local data and DOM
     */
    private removeUserFromUI(userHandle: string): void {
        // 1. Remove from local array
        this.currentBlockedUsersData = this.currentBlockedUsersData.filter((item) => {
            const handle = item.subject.handle || item.subject.did;
            return handle !== userHandle;
        });

        // 2. Remove DOM element if present on the current page
        const listContainer = this.view.getListContainerElement();
        if (listContainer) {
            const elementToRemove = listContainer.querySelector(
                `[data-user-handle="${userHandle}"]`
            );
            if (elementToRemove) {
                listContainer.removeChild(elementToRemove);
            }
        }

        // 3. Update count and possibly re-check if we need to show empty state
        this.updateBlockedUsersCount();

        // If the current page is now empty, optionally repopulate or show empty state
        const startIndex = (this.blockedUsersPage - 1) * this.blockedUsersPageSize;
        const endIndex = startIndex + this.blockedUsersPageSize;
        const currentPageData = this.currentBlockedUsersData.slice(startIndex, endIndex);
        if (currentPageData.length === 0) {
            this.view.showEmptyState();
        }
    }
}
