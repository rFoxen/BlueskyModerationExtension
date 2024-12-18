import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlockListDropdown } from '@src/components/blockedUsers/BlockListDropdown';
import { LABELS, MESSAGES, ERRORS, STORAGE_KEYS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';
import { BlockedUsersView } from './views/BlockedUsersView';
import { BlockedUserItemFactory } from './views/BlockedUserItemFactory';

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
    let timeout: number | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = window.setTimeout(() => fn(...args), delay);
    };
}

/**
 * BlockedUsersUI orchestrates loading, refreshing, searching, pagination, and
 * event handling related to blocked users. It delegates all DOM manipulation to
 * BlockedUsersView and item creation to BlockedUserItemFactory. It communicates
 * with BlockedUsersService for data operations.
 */
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

    // Event handler maps
    private domEventHandlers: { [key: string]: EventListener } = {};
    private serviceEventHandlers: { [key: string]: (...args: any[]) => void } = {};

    // Track processed elements if needed (currently for future expansion)
    private processedElements: WeakSet<HTMLElement> = new WeakSet();

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

    // ------------------ Public API ------------------

    public async loadBlockedUsersUI(selectedUri: string): Promise<void> {
        await this.loadBlockedUsers(selectedUri);
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
        }
        this.serviceEventHandlers = {};

        // Remove DOM event listeners
        for (const [eventKey, handler] of Object.entries(this.domEventHandlers)) {
            this.view.removeEventListener(eventKey, handler);
        }
        this.domEventHandlers = {};

        // Clear processed elements
        this.processedElements = new WeakSet();

        this.view.destroy();
    }

    // ------------------ Private Methods ------------------

    private addDomEventListeners(): void {
        // Toggle section
        const toggleHandler = (event: Event) => {
            event.preventDefault();
            this.toggleBlockedUsersSection();
        };
        this.domEventHandlers['toggle'] = toggleHandler;
        this.view.onToggleClick(toggleHandler);

        // Previous Page
        const prevPageHandler = (event: Event) => {
            event.preventDefault();
            this.changeBlockedUsersPage(-1);
        };
        this.domEventHandlers['prevPage'] = prevPageHandler;
        this.view.onPrevPageClick(prevPageHandler);

        // Next Page
        const nextPageHandler = (event: Event) => {
            event.preventDefault();
            this.changeBlockedUsersPage(1);
        };
        this.domEventHandlers['nextPage'] = nextPageHandler;
        this.view.onNextPageClick(nextPageHandler);

        // Search Input
        const searchHandler = debounce((event: Event) => {
            const input = event.target as HTMLInputElement;
            const value = input.value;
            this.handleBlockedUsersSearch(value);
        }, 300);
        this.domEventHandlers['search'] = searchHandler;
        this.view.onSearchInput(searchHandler);

        // Refresh Blocked Users
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
                this.syncBlockedUsersData();
                this.blockedUsersPage = 1;
                this.populateBlockedUsersList();
                this.updateBlockedUsersCount();
                this.showBlockedUsersSection();
                this.view.setLoadingState(false);
            },
            blockedUsersRefreshed: () => {
                this.syncBlockedUsersData();
                this.blockedUsersPage = 1;
                this.populateBlockedUsersList();
                this.updateBlockedUsersCount();
                this.notificationManager.displayNotification(MESSAGES.BLOCKED_USERS_LIST_REFRESHED, 'success');
                this.view.setLoadingState(false);
            },
            blockedUserAdded: () => {
                this.syncBlockedUsersData();
                this.populateBlockedUsersList();
                this.updateBlockedUsersCount();
            },
            blockedUserRemoved: () => {
                this.syncBlockedUsersData();
                this.populateBlockedUsersList();
                this.updateBlockedUsersCount();
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

    private async loadBlockedUsers(selectedUri: string): Promise<void> {
        this.view.setLoadingState(true);
        await this.blockedUsersService.loadBlockedUsers(selectedUri);
    }

    private async refreshBlockedUsers(): Promise<void> {
        const selectedUri = this.blockListDropdown.getSelectedValue();
        if (!selectedUri) {
            this.notificationManager.displayNotification(MESSAGES.PLEASE_SELECT_BLOCK_LIST_TO_REFRESH, 'error');
            return;
        }
        this.view.setLoadingState(true);
        await this.blockedUsersService.refreshBlockedUsers(selectedUri);
    }

    private toggleBlockedUsersSection(): void {
        const isExpanded = this.view.isSectionExpanded();
        if (isExpanded) {
            this.view.collapseSection();
            StorageHelper.setBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, false);
        } else {
            this.view.expandSection();
            StorageHelper.setBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, true);
        }
    }

    private syncBlockedUsersData(): void {
        this.currentBlockedUsersData = this.blockedUsersService.getBlockedUsersData();
    }

    private async populateBlockedUsersList(): Promise<void> {
        const data = this.currentBlockedUsersData;
        const startIndex = (this.blockedUsersPage - 1) * this.blockedUsersPageSize;
        const endIndex = startIndex + this.blockedUsersPageSize;
        const currentPageData = data.slice(startIndex, endIndex);

        if (currentPageData.length === 0) {
            this.view.showEmptyState();
        } else {
            const items = [];
            for (const item of currentPageData) {
                const listItem = await this.itemFactory.create(item);
                items.push(listItem);
            }
            this.view.renderBlockedUsersList(items);
        }

        this.updatePaginationControls(data.length);
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
            this.notificationManager.displayNotification(ERRORS.FAILED_TO_UNBLOCK_USER, 'error');
        }
    }

    private handleReportUser(userHandle: string): void {
        // Reporting logic can be handled via an event or callback
        // For simplicity, we rely on the existing code that might emit an event or handle reporting externally.
        // Implementation depends on application requirements.
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
}
