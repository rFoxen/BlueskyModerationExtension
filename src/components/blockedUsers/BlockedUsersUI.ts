import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { BlueskyService } from '@src/services/BlueskyService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlockListDropdown } from '@src/components/blockedUsers/BlockListDropdown';
import { MESSAGES, ERRORS } from '@src/constants/Constants';
import { debounce } from '@src/utils/helpers/debounce';
import { BlockedUsersView } from './views/BlockedUsersView';
import { BlockedUserItemFactory } from './views/BlockedUserItemFactory';
import { IndexedDbBlockedUser } from 'types/IndexedDbBlockedUser';
import Logger from '@src/utils/logger/Logger';

export class BlockedUsersUI {
    private blockedUsersService: BlockedUsersService;
    private blueskyService: BlueskyService;
    private notificationManager: NotificationManager;
    private blockListDropdown: BlockListDropdown;
    private isLoggedIn: () => boolean;
    private view: BlockedUsersView;
    private itemFactory: BlockedUserItemFactory;

    // Pagination
    private blockedUsersPage: number = 1;
    private readonly blockedUsersPageSize: number = 10;
    private totalBlockedUsers: number = 0;

    // Current search query
    private currentSearchQuery: string | null = null;

    // Store event handlers for cleanup
    private domEventHandlers: { [key: string]: EventListener } = {};
    private serviceEventHandlers: { [key: string]: (...args: any[]) => void } = {};

    constructor(
        blockedUsersSectionId: string,
        blockedUsersService: BlockedUsersService,
        blueskyService: BlueskyService,
        notificationManager: NotificationManager,
        blockListDropdown: BlockListDropdown,
        isLoggedIn: () => boolean
    ) {
        this.blockedUsersService = blockedUsersService;
        this.blueskyService = blueskyService;
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
        Logger.time(`loadBlockedUsersUI => ${selectedUri}`);
        this.view.showLoading();

        // 1) Possibly fetch from network if local DB is empty:
        await this.blockedUsersService.loadBlockedUsers(selectedUri);

        // 2) Clear search input & reset pagination
        this.view.clearSearchInput();
        this.blockedUsersPage = 1;

        // 3) Render current page from DB
        await this.renderCurrentPage();

        Logger.timeEnd(`loadBlockedUsersUI => ${selectedUri}`);
    }

    public showBlockedUsersSection(): void {
        this.view.showSection();
    }

    public hideBlockedUsersSection(): void {
        this.view.hideSection();
    }

    public destroy(): void {
        // Unsubscribe from service events
        for (const [event, handler] of Object.entries(this.serviceEventHandlers)) {
            this.blockedUsersService.off(event, handler);
            this.blueskyService.off(event, handler);
        }
        this.serviceEventHandlers = {};

        // Remove DOM handlers
        for (const [eventKey, handler] of Object.entries(this.domEventHandlers)) {
            this.view.removeEventListener(eventKey, handler);
        }
        this.domEventHandlers = {};

        // Cleanup view
        this.view.destroy();
    }

    // ----------------------------------------------------------------
    // DOM & Service event listeners
    // ----------------------------------------------------------------
    private addDomEventListeners(): void {
        // Toggle button
        const toggleHandler = (event: Event) => {
            event.preventDefault();
            this.toggleBlockedUsersSection();
        };
        this.domEventHandlers['toggle'] = toggleHandler;
        this.view.onToggleClick(toggleHandler);

        // Pagination
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

        // Search
        const searchHandler = debounce((event: Event) => {
            const input = event.target as HTMLInputElement;
            const value = input.value;
            this.handleBlockedUsersSearch(value);
        }, 300);
        this.domEventHandlers['search'] = searchHandler;
        this.view.onSearchInput(searchHandler);

        // Refresh
        const refreshHandler = (event: Event) => {
            event.preventDefault();
            this.refreshBlockedUsers();
        };
        this.domEventHandlers['refresh'] = refreshHandler;
        this.view.onRefreshClick(refreshHandler);

        // Download
        const downloadHandler = (event: Event) => {
            event.preventDefault();
            this.downloadBlockedUsers();
        };
        this.domEventHandlers['download'] = downloadHandler;
        this.view.onDownloadClick(downloadHandler);
    }

    private subscribeToServiceEvents(): void {
        this.registerServiceEvent('blockedUsersLoaded', this.handleBlockedUsersLoaded);
        this.registerServiceEvent('blockedUsersRefreshed', this.handleBlockedUsersRefreshed);
        this.registerServiceEvent('blockedUserAdded', this.handleBlockedUserAdded);
        this.registerServiceEvent('blockedUserUpdated', this.handleBlockedUserUpdated);
        this.registerServiceEvent('blockedUserRemoved', this.handleBlockedUserRemoved);
        this.registerServiceEvent('blockedUsersProgress', this.handleBlockedUsersProgress);
        this.registerServiceEvent('dbInitProgress', this.handleDbInitProgress);
        this.registerServiceEvent('error', this.handleServiceError);
    }

    private registerServiceEvent(event: string, handler: (...args: any[]) => void): void {
        const boundHandler = handler.bind(this);
        this.serviceEventHandlers[event] = boundHandler;
        // Attach to both services for convenience
        this.blockedUsersService.on(event, boundHandler);
        this.blueskyService.on(event, boundHandler);
    }

    // ----------------------------------------------------------------
    // Service events => UI
    // ----------------------------------------------------------------
    private handleBlockedUsersLoaded(): void {
        Logger.debug('event: blockedUsersLoaded -> reloadBlockedUsersUI');
        this.reloadBlockedUsersUI();
    }

    private handleBlockedUsersRefreshed(): void {
        Logger.debug('event: blockedUsersRefreshed -> reloadBlockedUsersUI');
        this.reloadBlockedUsersUI(MESSAGES.BLOCKED_USERS_LIST_REFRESHED);
    }

    private handleBlockedUserAdded(newItem: any): void {
        // If it's just the optimistic placeholder, ignore
        if (newItem.uri === 'pending') return;

        Logger.debug('event: blockedUserAdded -> addUserToUI');
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) return;

        if (!newItem || !newItem.subject || !this.isCurrentListSelected(newItem)) return;

        // Remove existing DOM element (avoid duplicates)
        const userHandle = newItem.subject.handle || newItem.subject.did;
        const listContainer = this.view.getListContainerElement();
        const existingElement = listContainer.querySelector(`[data-user-handle="${userHandle}"]`) as HTMLElement | null;
        if (existingElement) {
            listContainer.removeChild(existingElement);
        }

        this.addUserToUI(newItem);
    }

    private handleBlockedUserUpdated(updatedItem: any): void {
        Logger.debug('event: blockedUserUpdated -> updateUI');
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) return;

        if (updatedItem && updatedItem.subject && this.isCurrentListSelected(updatedItem)) {
            // Just re-render the current page to show the updated user
            this.reloadBlockedUsersUI();
        }
    }

    private handleBlockedUserRemoved(userHandle: string): void {
        Logger.debug('event: blockedUserRemoved -> removeUserFromUI');
        this.removeUserFromUI(userHandle);
    }

    private handleBlockedUsersProgress(currentCount: number): void {
        this.view.updateLoadingCount(currentCount);
    }

    private handleDbInitProgress(message: string): void {
        // Reuse the existing "loadingIndicator" => update the text with the new message
        // We'll call a new method on the view, e.g. updateDbLoadingContext()
        this.view.updateDbLoadingContext(message);
    }

    private handleServiceError(message: string): void {
        Logger.debug('event: error ->', message);
        this.notificationManager.displayNotification(message, 'error');
        this.view.hideLoading();
    }

    // ----------------------------------------------------------------
    // UI rendering logic
    // ----------------------------------------------------------------
    private async reloadBlockedUsersUI(successMessage?: string): Promise<void> {
        Logger.time('reloadBlockedUsersUI');
        await this.renderCurrentPage();
        this.displaySuccessMessage(successMessage);
        this.showBlockedUsersSection();
        Logger.timeEnd('reloadBlockedUsersUI');
    }

    private displaySuccessMessage(message?: string): void {
        if (message) {
            this.notificationManager.displayNotification(message, 'success');
        }
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

        Logger.time(`refreshBlockedUsers => ${selectedUri}`);
        this.view.showLoading();
        await this.blockedUsersService.refreshBlockedUsers(selectedUri);
        Logger.timeEnd(`refreshBlockedUsers => ${selectedUri}`);
    }

    private async downloadBlockedUsers(): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        const selectedText = this.blockListDropdown.getSelectedText();
        if (!selectedUri) {
            this.notificationManager.displayNotification('Please select a block list to download.', 'error');
            return;
        }

        try {
            // 1. Check if all blocked users are fully downloaded (no 'pending' recordUris)
            const blockedUsers = await this.blockedUsersService.blockedUsersRepo.getAllByListUri(selectedUri);
            const hasPending = blockedUsers.some(user => user.recordUri === 'pending');

            if (hasPending) {
                this.notificationManager.displayNotification(
                    'Blocked users are still being downloaded. Please wait until all users are fully loaded before downloading.',
                    'error'
                );
                return;
            }

            if (blockedUsers.length === 0) {
                this.notificationManager.displayNotification('No blocked users to download.', 'info');
                return;
            }

            // 2. Convert blocked users to CSV
            const csvContent = this.convertToCSV(blockedUsers);

            // 3. Create a Blob from the CSV content
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

            // 4. Create a temporary link to trigger the download
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `${selectedText}_list.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // 5. Notify the user of successful download
            this.notificationManager.displayNotification('Blocked users list has been downloaded.', 'success');
        } catch (error) {
            Logger.error('Failed to download blocked users:', error);
            this.notificationManager.displayNotification('Failed to download blocked users.', 'error');
        }
    }

    /**
     * Converts an array of blocked users to CSV format.
     * @param blockedUsers Array of blocked users.
     * @returns CSV string.
     */
    private convertToCSV(blockedUsers: IndexedDbBlockedUser[]): string {
        const headers = ['User Handle'];
        const rows = blockedUsers.map(user => [
            user.userHandle
        ]);

        const csv = [
            headers.join(','), // Header row
            ...rows.map(row => row.map(field => `"${field}"`).join(',')) // Data rows with quotes
        ].join('\n');

        return csv;
    }

    private toggleBlockedUsersSection(): void {
        const isExpanded = this.view.isSectionExpanded();
        if (isExpanded) {
            this.view.collapseSection();
        } else {
            this.view.expandSection();
        }
    }

    // ----------------------------------------------------------------
    // Searching
    // ----------------------------------------------------------------
    private async handleBlockedUsersSearch(query: string): Promise<void> {
        Logger.debug('handleBlockedUsersSearch =>', query);
        const normalizedQuery = query.toLowerCase().trim();
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) return;

        if (!normalizedQuery) {
            // Empty query => reset search
            this.currentSearchQuery = null;
            this.blockedUsersPage = 1;
            await this.reloadBlockedUsersUI();
            return;
        }

        // Set the current search query and reset to first page
        this.currentSearchQuery = normalizedQuery;
        this.blockedUsersPage = 1;

        // Perform the search
        const { users, total } = await this.blockedUsersService.searchBlockedUsers(
            selectedUri,
            normalizedQuery,
            this.blockedUsersPage,
            this.blockedUsersPageSize
        );

        await this.renderBlockedUsers(users, total);
    }

    // ----------------------------------------------------------------
    // Add/Remove single user from the UI (optimistic updates)
    // ----------------------------------------------------------------
    private async addUserToUI(newItem: any): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) return;

        try {
            // Create the record with an updated "order" => highest is newest
            const maxOrder = await this.blockedUsersService.blockedUsersRepo.getMaxOrder(selectedUri);
            const newOrder = maxOrder + 1;

            const item: IndexedDbBlockedUser = {
                id: `${selectedUri}#${newItem.subject.handle || newItem.subject.did}`,
                listUri: selectedUri,
                userHandle: newItem.subject.handle || newItem.subject.did,
                did: newItem.subject.did,
                recordUri: newItem.uri,
                order: newOrder
            };

            // If the user belongs on the current page (which might be page 1),
            // then insert DOM element.
            if (this.shouldInsertUserOnCurrentPage()) {
                const listItem = await this.itemFactory.create(item);
                listItem.setAttribute('data-user-handle', newItem.subject.handle || newItem.subject.did);
                const listContainer = this.view.getListContainerElement();
                listContainer.insertAdjacentElement('afterbegin', listItem);
                this.totalBlockedUsers += 1;
                this.view.updateCount(this.totalBlockedUsers);
                this.updatePaginationControls(this.totalBlockedUsers);
            }

            // (Optionally update IDB if your flow requires it here or it might be done elsewhere)
            // e.g. this.blockedUsersService.blockedUsersRepo.addOrUpdate(...)
        } catch (error) {
            Logger.error('Failed to add user to UI with correct order:', error);
            this.notificationManager.displayNotification(
                'Failed to add user to the UI.',
                'error'
            );
        }
    }

    private shouldInsertUserOnCurrentPage(): boolean {
        return this.blockedUsersPage === 1;
    }

    private async removeUserFromUI(userHandle: string): Promise<void> {
        Logger.time(`removeUserFromUI => ${userHandle}`);
        const listContainer = this.view.getListContainerElement();
        if (listContainer) {
            const elementToRemove = listContainer.querySelector(
                `[data-user-handle="${userHandle}"]`
            ) as HTMLElement;
            if (elementToRemove) {
                listContainer.removeChild(elementToRemove);
                this.totalBlockedUsers -= 1;
                this.view.updateCount(this.totalBlockedUsers);
                this.updatePaginationControls(this.totalBlockedUsers);
            }
        }

        if (this.totalBlockedUsers === 0) {
            this.view.showEmptyState();
        }
        Logger.timeEnd(`removeUserFromUI => ${userHandle}`);
    }

    private isCurrentListSelected(item: any): boolean {
        // If item has “listUri” property, compare it to the currently selected list.
        // For now, we just return true (assuming we only deal with the active list).
        return true;
    }

    // ----------------------------------------------------------------
    // Unblock
    // ----------------------------------------------------------------
    private async handleUnblockUser(userHandle: string): Promise<void> {
        Logger.debug('handleUnblockUser =>', userHandle);
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
            this.renderCurrentPage();
        } catch (error) {
            Logger.error('handleUnblockUser => error:', error);
            this.notificationManager.displayNotification('An unknown error occurred.', 'error');
        }
    }

    private handleReportUser(userHandle: string): void {
        Logger.debug('handleReportUser =>', userHandle);
        // Your reporting logic
    }

    // ----------------------------------------------------------------
    // Pagination
    // ----------------------------------------------------------------
    private async renderCurrentPage(): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) {
            this.view.hideLoading();
            return;
        }

        // Determine whether to perform a search or load all users
        if (this.currentSearchQuery) {
            // Perform search-based pagination
            try {
                const { users, total } = await this.blockedUsersService.searchBlockedUsers(
                    selectedUri,
                    this.currentSearchQuery,
                    this.blockedUsersPage,
                    this.blockedUsersPageSize
                );
                await this.renderBlockedUsers(users, total);
            } catch (error) {
                Logger.error('Error during search pagination:', error);
                this.view.hideLoading();
                this.notificationManager.displayNotification(
                    ERRORS.FAILED_TO_LOAD_BLOCKED_USERS,
                    'error'
                );
            }
        } else {
            // Perform regular pagination
            try {
                const currentPageData = await this.blockedUsersService.blockedUsersRepo
                    .getPageByListUri(selectedUri, this.blockedUsersPage, this.blockedUsersPageSize);

                const itemsPromises = currentPageData.map(item => this.itemFactory.create(item));
                const items = await Promise.all(itemsPromises);
                this.view.renderBlockedUsersList(items as HTMLDivElement[]);

                // Update pagination
                const totalCount = await this.blockedUsersService.blockedUsersRepo
                    .getCountByListUri(selectedUri);
                this.totalBlockedUsers = totalCount;
                const totalPages = Math.max(
                    1,
                    Math.ceil(this.totalBlockedUsers / this.blockedUsersPageSize)
                );
                this.view.updatePagination(this.blockedUsersPage, totalPages);
                this.view.updateCount(this.totalBlockedUsers);
                this.view.hideLoading();

                if (items.length === 0) {
                    this.view.showEmptyState();
                }
            } catch (error) {
                Logger.error('Error during regular pagination:', error);
                this.view.hideLoading();
                this.notificationManager.displayNotification(
                    ERRORS.FAILED_TO_LOAD_BLOCKED_USERS,
                    'error'
                );
            }
        }
    }

    private async changeBlockedUsersPage(delta: number): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) return;

        // Determine total pages based on current context (search or all)
        const totalCount = this.currentSearchQuery
            ? await this.blockedUsersService.blockedUsersRepo.searchByHandle(
                selectedUri,
                this.currentSearchQuery,
                this.blockedUsersPage,
                this.blockedUsersPageSize
            ).then(result => result.total)
            : await this.blockedUsersService.blockedUsersRepo.getCountByListUri(selectedUri);

        const totalPages = Math.max(1, Math.ceil(totalCount / this.blockedUsersPageSize));

        let newPage = this.blockedUsersPage + delta;
        if (newPage < 1) newPage = 1;
        if (newPage > totalPages) newPage = totalPages;
        if (newPage === this.blockedUsersPage) {
            return;
        }

        this.blockedUsersPage = newPage;

        // Re-render the current page based on the active search query
        await this.renderCurrentPage();
    }

    private async renderBlockedUsers(blockedUsers: IndexedDbBlockedUser[], totalBlockedUsers?: number): Promise<void> {
        if (!blockedUsers || blockedUsers.length === 0) {
            this.view.showEmptyState();
            this.view.updatePagination(1, 1);
            this.view.updateCount(0);
            return;
        }

        this.totalBlockedUsers = totalBlockedUsers ?? blockedUsers.length;

        // Calculate total pages
        const totalPages = Math.ceil(this.totalBlockedUsers / this.blockedUsersPageSize);

        // Ensure current page is within bounds
        if (this.blockedUsersPage > totalPages) {
            this.blockedUsersPage = totalPages;
        } else if (this.blockedUsersPage < 1) {
            this.blockedUsersPage = 1;
        }

        // Convert each to DOM elements
        const itemsPromises = blockedUsers.map(item => this.itemFactory.create(item));
        const items = await Promise.all(itemsPromises);
        this.view.renderBlockedUsersList(items as HTMLDivElement[]);

        // Update pagination controls
        this.view.updatePagination(this.blockedUsersPage, totalPages);
        this.view.updateCount(this.totalBlockedUsers);

        this.view.hideLoading();

        if (items.length === 0) {
            this.view.showEmptyState();
        }
    }

    private updatePaginationControls(totalItems: number): void {
        const totalPages = Math.max(
            1,
            Math.ceil(totalItems / this.blockedUsersPageSize)
        );
        this.view.updatePagination(this.blockedUsersPage, totalPages);
    }
}
