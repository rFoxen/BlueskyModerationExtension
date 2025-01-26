// File: BlockedUsersUI.ts
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { BlueskyService } from '@src/services/BlueskyService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlockListDropdown } from '@src/components/blockedUsers/BlockListDropdown';
import { MESSAGES, ERRORS, LABELS } from '@src/constants/Constants';
import { debounce } from '@src/utils/helpers/debounce';
import { getFormattedDateTime } from '@src/utils/helpers/date';
import { BlockedUsersView } from './views/BlockedUsersView';
import { BlockedUserItemFactory } from './views/BlockedUserItemFactory';
import { stringToColor } from '@src/utils/colorUtils';
import { IndexedDbBlockedUser } from 'types/IndexedDbBlockedUser';
import Logger from '@src/utils/logger/Logger';
import { EventEmitter } from '@src/utils/events/EventEmitter';

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

        // 1) Possibly fetch from network if local DB is empty
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

        // Visit
        const visitHandler = (event: Event) => {
            event.preventDefault();
            this.visitBlockList();
        };
        this.domEventHandlers['visit'] = visitHandler;
        this.view.onVisitClick(visitHandler);
        
        // --- Download Entire DB ---
        const downloadDbHandler = (event: Event) => {
            event.preventDefault();
            this.handleDownloadEntireDb();
        };
        this.domEventHandlers['downloadDb'] = downloadDbHandler;
        this.view.onDownloadDbClick(downloadDbHandler);

        // --- Restore Entire DB Button (opens file dialog) ---
        const restoreDbHandler = (event: Event) => {
            event.preventDefault();
            
            // 1) Confirm right away, while we’re still in a direct user click
            if (!confirm('Restoring will overwrite all local DB data. Continue?')) {
                console.log('User canceled restore at confirm()');
                return;
            }
            
            this.view.showSection(); // ensure UI is visible if needed
            const fileInput = document.getElementById('restore-db-file') as HTMLInputElement;
            if (fileInput) fileInput.click(); // open file dialog
        };
        this.domEventHandlers['restoreDb'] = restoreDbHandler;
        this.view.onRestoreDbClick(restoreDbHandler);

        // --- Restore Entire DB File Input (on change) ---
        const restoreDbFileChangeHandler = (event: Event) => {
            const fileInput = event.target as HTMLInputElement;
            if (!fileInput.files || fileInput.files.length === 0) return;
            const file = fileInput.files[0];
            this.handleRestoreEntireDb(file);
            // Clear selection so we can trigger "change" again if needed
            fileInput.value = '';
        };
        this.domEventHandlers['restoreDbFile'] = restoreDbFileChangeHandler;
        this.view.onRestoreDbFileChange(restoreDbFileChangeHandler);


        const blockListChangedHandler = (event: Event) => {
            const customEvent = event as CustomEvent<{ listName: string }>;
            const listName = customEvent.detail.listName;
            this.handleBlockListChanged(listName);
        };
        this.domEventHandlers['blockListChanged'] = blockListChangedHandler;
        document.addEventListener('blockListChanged', blockListChangedHandler);

        // Manual Block Button Click
        const manualBlockHandler = (event: Event) => {
            event.preventDefault();
            this.handleManualBlock();
        };
        this.domEventHandlers['manualBlock'] = manualBlockHandler;
        this.view.onManualBlockButtonClick(manualBlockHandler);

        // Manual Block Input Enter Key
        const manualBlockEnterHandler = (event: Event) => {
            const keyEvent = event as KeyboardEvent;
            if (keyEvent.key === 'Enter') {
                keyEvent.preventDefault();
                this.handleManualBlock();
            }
        };
        this.domEventHandlers['manualBlockEnter'] = manualBlockEnterHandler;
        this.view.onManualBlockInputEnter(manualBlockEnterHandler);
    }

    private async handleManualBlock(): Promise<void> {
        const userHandle = this.view.getManualBlockInputValue();
        if (!userHandle) {
            this.view.showManualBlockFeedback(ERRORS.ENTER_USER_HANDLE_ERROR);
            return;
        }

        // Basic validation: ensure handle starts with '@'
        const normalizedHandle = userHandle.startsWith('@') ? userHandle.slice(1) : userHandle;

        // Clear previous feedback
        this.view.clearManualBlockFeedback();

        const selectedUri = this.blockListDropdown.getSelectedValue();
        const selectedList = this.blockListDropdown.getSelectedText();
        if (!selectedUri || !selectedList) {
            this.view.showManualBlockFeedback(MESSAGES.PLEASE_SELECT_BLOCK_LIST, true);
            return;
        }

        try {
            // Optimistically add to UI
            await this.blockedUsersService.addBlockedUser(normalizedHandle, selectedUri);
            this.view.showManualBlockFeedback(MESSAGES.USER_BLOCKED_SUCCESS(normalizedHandle, selectedList), false);
            this.view.clearManualBlockInput();
        } catch (error) {
            Logger.error('Manual block failed:', error);
            this.view.showManualBlockFeedback(ERRORS.FAILED_TO_BLOCK_USER, true);
        }
    }
    
    /**
     * Handler for when the block list changes.
     * @param listName The name of the selected block list.
     */
    private handleBlockListChanged(listName: string): void {
        Logger.debug(`Block list changed to: ${listName}`);
        const newColor = stringToColor(listName);
        this.view.updateToggleSlideoutColor(newColor);
    }
    
    private subscribeToServiceEvents(): void {
        // Register events specifically to each service
        this.registerServiceEvent(this.blockedUsersService, 'blockedUsersLoaded', this.handleBlockedUsersLoaded);
        this.registerServiceEvent(this.blockedUsersService, 'blockedUsersRefreshed', this.handleBlockedUsersRefreshed);
        this.registerServiceEvent(this.blockedUsersService, 'blockedUserAdded', this.handleBlockedUserAdded);
        this.registerServiceEvent(this.blockedUsersService, 'blockedUserUpdated', this.handleBlockedUserUpdated);
        this.registerServiceEvent(this.blockedUsersService, 'blockedUserRemoved', this.handleBlockedUserRemoved);
        this.registerServiceEvent(this.blockedUsersService, 'blockedUsersProgress', this.handleBlockedUsersProgress);
        this.registerServiceEvent(this.blockedUsersService, 'dbInitProgress', this.handleDbInitProgress);

        // Error events can come from both services
        this.registerServiceEvent(this.blockedUsersService, 'error', this.handleServiceError);
        this.registerServiceEvent(this.blueskyService, 'error', this.handleServiceError);

        this.registerServiceEvent(this.blockedUsersService.blockedUsersRepo, 'dbRestoreProgress', this.handleDbRestoreProgress);
        this.registerServiceEvent(this.blockedUsersService.blockedUsersRepo, 'dbRestoreProgressUpdate', this.handleDbRestoreProgressUpdate);
    }

    private registerServiceEvent(service: EventEmitter, event: string, handler: (...args: any[]) => void): void {
        const boundHandler = handler.bind(this);
        this.serviceEventHandlers[event] = boundHandler;
        service.on(event, boundHandler);
    }

    // ---------------------------
    // Download entire DB => JSON
    // ---------------------------

    // Callback that appends a line to the overlay logs
    private handleDbRestoreProgress(message: string): void {
        this.view.appendDbRestoreLog(message);
    }

    private handleDbRestoreProgressUpdate(payload: { lineKey: string; text: string }): void {
        this.view.updateRestoreLogLine(payload.lineKey, payload.text);
    }
    
    private async handleDownloadEntireDb(): Promise<void> {
        if (!confirm('Are you sure you want to download the entire database?')) {
            return;
        }

        try {
            const allData = await this.blockedUsersService.exportEntireDatabase();
            const jsonString = JSON.stringify(allData, null, 2);

            // Create a Blob and download
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            const dateTime = getFormattedDateTime().replace(/[:]/g, '-');
            link.download = `Bluesky-Moderation-Database-Export ${dateTime}.json`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();

            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            this.notificationManager.displayNotification(
                'Database export completed successfully.',
                'success'
            );
        } catch (error) {
            console.error('Failed to export entire DB:', error);
            this.notificationManager.displayNotification('Failed to export database.', 'error');
        }
    }

    // ---------------------------
    // Restore entire DB from JSON
    // ---------------------------
    private async handleRestoreEntireDb(file: File): Promise<void> {
        console.log('Handle restore triggered. File:', file.name);

        // Show the overlay to block interaction
        this.view.showDbRestoreOverlay();
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const content = e.target?.result as string;
                if (!content) throw new Error('Empty file');

                const data = JSON.parse(content);
                await this.blockedUsersService.importEntireDatabase(data);

                this.notificationManager.displayNotification(
                    'Database restored successfully.',
                    'success'
                );

                // Optionally reload the UI
                // e.g., if you want to show the newly imported block lists
                // this.reloadBlockedUsersUI();
            } catch (error) {
                console.error('Failed to restore entire DB:', error);
                this.notificationManager.displayNotification('Failed to restore database.', 'error');
                this.view.appendDbRestoreLog('Restore process failed. Check console or logs.');
            } finally {
                // Hide the overlay after success or failure
                this.view.hideDbRestoreOverlay();
            }
        };

        reader.onerror = () => {
            this.view.hideDbRestoreOverlay();
            this.notificationManager.displayNotification('Error reading file.', 'error');
        };

        reader.readAsText(file);
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

    private handleBlockedUsersProgress(currentCount: number, listItemCount: number): void {
        this.view.updateLoadingCount(currentCount, listItemCount);
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
        const selectedText = this.blockListDropdown.getSelectedText();
        if (!selectedUri) {
            this.notificationManager.displayNotification(
                MESSAGES.PLEASE_SELECT_BLOCK_LIST_TO_REFRESH,
                'error'
            );
            return;
        }

        const confirmMessage = `Are you sure you want to refresh @${selectedText}?`;
        if (!confirm(confirmMessage)) {
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
            const dateTime = getFormattedDateTime().replace(/[:]/g, '-');
            link.setAttribute('href', url);
            link.setAttribute('download', `${selectedText}_list ${dateTime}.csv`);
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

    private visitBlockList(): void {
        const selectedUri = this.blockListDropdown.getSelectedValue();

        if (!selectedUri) {
            this.notificationManager.displayNotification('Please select a block list to visit.', 'error');
            return;
        }

        const uriPattern = /^at:\/\/(did:[^\/]+)\/app\.bsky\.graph\.list\/(.+)$/;
        const match = selectedUri.match(uriPattern);

        if (!match) {
            this.notificationManager.displayNotification('Invalid block list URI format.', 'error');
            return;
        }

        const did = match[1];
        const listId = match[2];
        const url = `https://bsky.app/profile/${did}/lists/${listId}`;

        try {
            const newTab = window.open(url, '_blank');
            if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
                throw new Error('Popup blocked');
            }
        } catch (error) {
            this.notificationManager.displayNotification('Failed to open the block list. Please allow popups for this site.', 'error');
            console.error('Error opening new tab:', error);
        }
    }

    
    private convertToCSV(blockedUsers: IndexedDbBlockedUser[]): string {
        const headers = ['User Handle'];
        const rows = blockedUsers.map(user => [user.userHandle]);
        const csv = [
            headers.join(','), // Header row
            // Data rows with quotes
            ...rows.map(row => row.map(field => `"${field}"`).join(','))
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

            // Optionally update IDB if your flow requires it here or it might be done elsewhere
            // e.g., this.blockedUsersService.blockedUsersRepo.addOrUpdate(...)
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
