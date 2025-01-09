import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { BlueskyService } from '@src/services/BlueskyService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlockListDropdown } from '@src/components/blockedUsers/BlockListDropdown';
import { MESSAGES } from '@src/constants/Constants';
import { debounce } from '@src/utils/helpers/debounce';
import { BlockedUsersView } from './views/BlockedUsersView';
import { BlockedUserItemFactory } from './views/BlockedUserItemFactory';
import Logger from '@src/utils/logger/Logger';

export class BlockedUsersUI {
    private blockedUsersService!: BlockedUsersService;
    private blueskyService!: BlueskyService;
    private notificationManager!: NotificationManager;
    private blockListDropdown!: BlockListDropdown;
    private isLoggedIn!: () => boolean;
    private view!: BlockedUsersView;
    private itemFactory!: BlockedUserItemFactory;

    private blockedUsersPage: number = 1;
    private readonly blockedUsersPageSize: number = 10;
    private currentBlockedUsersData: any[] = [];

    private domEventHandlers: { [key: string]: EventListener } = {};
    private serviceEventHandlers: { [key: string]: (...args: any[]) => void } = {};
    private processedElements: WeakSet<HTMLElement> = new WeakSet();

    private lastRenderedData: any[] = [];
    private lastRenderedPage: number = -1;

    constructor(
        blockedUsersSectionId: string,
        blockedUsersService: BlockedUsersService,
        blueskyService: BlueskyService,
        notificationManager: NotificationManager,
        blockListDropdown: BlockListDropdown,
        isLoggedIn: () => boolean
    ) {
        this.initializeServices(
            blockedUsersService,
            blueskyService,
            notificationManager,
            blockListDropdown,
            isLoggedIn
        );

        this.initializeView(blockedUsersSectionId);
        this.initializeItemFactory();

        this.initializeEventListeners();
        this.view.applySavedToggleState();
        this.subscribeToServiceEvents();
    }

    private initializeServices(
        blockedUsersService: BlockedUsersService,
        blueskyService: BlueskyService,
        notificationManager: NotificationManager,
        blockListDropdown: BlockListDropdown,
        isLoggedIn: () => boolean
    ): void {
        this.blockedUsersService = blockedUsersService;
        this.blueskyService = blueskyService;
        this.notificationManager = notificationManager;
        this.blockListDropdown = blockListDropdown;
        this.isLoggedIn = isLoggedIn;
    }

    private initializeView(blockedUsersSectionId: string): void {
        this.view = new BlockedUsersView(blockedUsersSectionId);
    }

    private initializeItemFactory(): void {
        this.itemFactory = new BlockedUserItemFactory(
            this.blockedUsersService,
            this.notificationManager,
            this.handleUnblockUser.bind(this),
            this.handleReportUser.bind(this)
        );
    }

    private initializeEventListeners(): void {
        this.addDomEventListeners();
    }


    public async loadBlockedUsersUI(selectedUri: string): Promise<void> {
        Logger.time(`loadBlockedUsersUI => ${selectedUri}`);
        this.view.showLoading();
        await this.blockedUsersService.loadBlockedUsers(selectedUri);
        Logger.timeEnd(`loadBlockedUsersUI => ${selectedUri}`);
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
        this.setupToggleSectionListener();
        this.setupPaginationListeners();
        this.setupSearchListener();
        this.setupRefreshListener();
    }

    private setupToggleSectionListener(): void {
        const toggleHandler = (event: Event) => {
            event.preventDefault();
            this.toggleBlockedUsersSection();
        };
        this.domEventHandlers['toggle'] = toggleHandler;
        this.view.onToggleClick(toggleHandler);
    }

    private setupPaginationListeners(): void {
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
    }

    private setupSearchListener(): void {
        const searchHandler = debounce((event: Event) => {
            const input = event.target as HTMLInputElement;
            const value = input.value;
            this.handleBlockedUsersSearch(value);
        }, 300);
        this.domEventHandlers['search'] = searchHandler;
        this.view.onSearchInput(searchHandler);
    }

    private setupRefreshListener(): void {
        const refreshHandler = (event: Event) => {
            event.preventDefault();
            this.refreshBlockedUsers();
        };
        this.domEventHandlers['refresh'] = refreshHandler;
        this.view.onRefreshClick(refreshHandler);
    }

    private subscribeToServiceEvents(): void {
        this.registerServiceEvent('blockedUsersLoaded', this.handleBlockedUsersLoaded);
        this.registerServiceEvent('blockedUsersRefreshed', this.handleBlockedUsersRefreshed);
        this.registerServiceEvent('blockedUserAdded', this.handleBlockedUserAdded);
        this.registerServiceEvent('blockedUserRemoved', this.handleBlockedUserRemoved);
        this.registerServiceEvent('blockedUsersProgress', this.handleBlockedUsersProgress);
        this.registerServiceEvent('error', this.handleServiceError);
    }

    private registerServiceEvent(event: string, handler: (...args: any[]) => void): void {
        this.serviceEventHandlers[event] = handler.bind(this);
        this.blockedUsersService.on(event, this.serviceEventHandlers[event]);
        this.blueskyService.on(event, this.serviceEventHandlers[event]);
    }

    private handleBlockedUsersLoaded = (): void => {
        Logger.debug('event: blockedUsersLoaded -> reloadBlockedUsersUI');
        this.reloadBlockedUsersUI();
    };

    private handleBlockedUsersRefreshed = (): void => {
        Logger.debug('event: blockedUsersRefreshed -> reloadBlockedUsersUI');
        this.reloadBlockedUsersUI(MESSAGES.BLOCKED_USERS_LIST_REFRESHED);
    };

    private handleBlockedUserAdded = (newItem: any): void => {
        Logger.debug('event: blockedUserAdded -> addUserToUI');
        this.addUserToUI(newItem);
    };

    private handleBlockedUserRemoved = (userHandle: string): void => {
        Logger.debug('event: blockedUserRemoved -> removeUserFromUI');
        this.removeUserFromUI(userHandle);
    };

    private handleBlockedUsersProgress = (currentCount: number): void => {
        this.view.updateLoadingCount(currentCount);
    };

    private handleServiceError = (message: string): void => {
        Logger.debug('event: error ->', message);
        this.notificationManager.displayNotification(message, 'error');
        this.view.hideLoading();
    };

    private reloadBlockedUsersUI(successMessage?: string): void {
        Logger.time('reloadBlockedUsersUI');
        this.resetPagination();
        this.syncBlockedUsersData();
        this.populateBlockedUsersList();
        this.updateBlockedUsersCount();
        this.displaySuccessMessage(successMessage);
        this.showBlockedUsersSection();
        this.view.hideLoading();
        Logger.timeEnd('reloadBlockedUsersUI');
    }

    private resetPagination(): void {
        this.blockedUsersPage = 1;
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
        if (this.shouldSkipRendering()) {
            return;
        }

        const currentPageData = this.getCurrentPageData();
        await this.renderCurrentPage(currentPageData);
        this.updatePaginationControls(this.currentBlockedUsersData.length);
        this.cacheRenderedState();
    }

    private shouldSkipRendering(): boolean {
        return (
            this.lastRenderedPage === this.blockedUsersPage &&
            this.arraysEqual(this.lastRenderedData, this.currentBlockedUsersData)
        );
    }

    private getCurrentPageData(): any[] {
        const startIndex = (this.blockedUsersPage - 1) * this.blockedUsersPageSize;
        const endIndex = startIndex + this.blockedUsersPageSize;
        return this.currentBlockedUsersData.slice(startIndex, endIndex);
    }

    private async renderCurrentPage(currentPageData: any[]): Promise<void> {
        if (currentPageData.length === 0) {
            this.view.showEmptyState();
        } else {
            const items = await this.createListItems(currentPageData);
            this.view.renderBlockedUsersList(items as HTMLDivElement[]);
        }
    }

    private async createListItems(data: any[]): Promise<HTMLElement[]> {
        const itemsPromises = data.map(item => this.itemFactory.create(item));
        return await Promise.all(itemsPromises);
    }

    private cacheRenderedState(): void {
        this.lastRenderedData = [...this.currentBlockedUsersData];
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
        Logger.debug('handleUnblockUser =>', userHandle);
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
            this.notificationManager.displayNotification(
                MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle),
                'success'
            );
        } catch (error) {
            Logger.error('handleUnblockUser => error:', error);
            this.notificationManager.displayNotification('An unknown error occurred.', 'error');
        }
    }

    private handleReportUser(userHandle: string): void {
        Logger.debug('handleReportUser =>', userHandle);
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
        Logger.debug('handleBlockedUsersSearch =>', query);
        const normalizedQuery = this.normalizeSearchQuery(query);
        this.filterBlockedUsersData(normalizedQuery);
        this.resetPagination();
        this.populateBlockedUsersList();
        this.updateBlockedUsersCount();
    }

    private normalizeSearchQuery(query: string): string {
        return query.toLowerCase().trim();
    }

    private filterBlockedUsersData(query: string): void {
        const allData = this.blockedUsersService.getBlockedUsersData();
        if (query) {
            this.currentBlockedUsersData = this.filterDataByQuery(allData, query);
        } else {
            this.currentBlockedUsersData = allData;
        }
    }

    private filterDataByQuery(data: any[], query: string): any[] {
        return data.filter((item) => {
            const uHandle = (item.subject.handle || item.subject.did).toLowerCase();
            return uHandle.includes(query);
        });
    }

    private updateBlockedUsersCount(): void {
        const count = this.currentBlockedUsersData.length;
        this.view.updateCount(count);
    }

    private async addUserToUI(newItem: any): Promise<void> {
        Logger.time(`addUserToUI => ${this.getUserHandle(newItem)}`);
        this.removeDuplicateUser(newItem);
        this.insertNewUserInMemory(newItem);
        await this.insertNewUserInDOM(newItem);
        this.updateBlockedUsersCount();
        Logger.timeEnd(`addUserToUI => ${this.getUserHandle(newItem)}`);
    }

    private getUserHandle(item: any): string {
        return item.subject.handle || item.subject.did;
    }

    private removeDuplicateUser(newItem: any): void {
        const newHandle = this.getUserHandle(newItem);
        this.currentBlockedUsersData = this.currentBlockedUsersData.filter((existing) => {
            const handle = this.getUserHandle(existing);
            return handle !== newHandle;
        });
    }

    private insertNewUserInMemory(newItem: any): void {
        this.currentBlockedUsersData.unshift(newItem);
    }

    private async insertNewUserInDOM(newItem: any): Promise<void> {
        if (this.shouldInsertUserInDOM()) {
            try {
                const listItem = await this.createListItem(newItem);
                this.replaceExistingDOMItem(listItem);
                this.prependItemToList(listItem);
            } catch (error) {
                Logger.error('addUserToUI => error creating new blocked user item:', error);
            }
        }
    }

    private shouldInsertUserInDOM(): boolean {
        const listContainer = this.view.getListContainerElement();
        return !!listContainer && this.blockedUsersPage === 1;
    }

    private async createListItem(newItem: any): Promise<HTMLElement> {
        const listItem = await this.itemFactory.create(newItem);
        listItem.setAttribute('data-user-handle', this.getUserHandle(newItem));
        return listItem;
    }

    private replaceExistingDOMItem(listItem: HTMLElement): void {
        const listContainer = this.view.getListContainerElement();
        const newHandle = this.getUserHandle(listItem);
        const existingDom = listContainer.querySelector(`[data-user-handle="${newHandle}"]`);
        if (existingDom) {
            listContainer.removeChild(existingDom);
        }
    }

    private prependItemToList(listItem: HTMLElement): void {
        const listContainer = this.view.getListContainerElement();
        listContainer.insertAdjacentElement('afterbegin', listItem);
    }


    private removeUserFromUI(userHandle: string): void {
        Logger.time(`removeUserFromUI => ${userHandle}`);
        this.removeUserFromData(userHandle);
        this.removeUserFromDOM(userHandle);
        this.updateUIAfterRemoval();
        Logger.timeEnd(`removeUserFromUI => ${userHandle}`);
    }

    private removeUserFromData(userHandle: string): void {
        this.currentBlockedUsersData = this.currentBlockedUsersData.filter((item) => {
            const handle = this.getUserHandle(item);
            return handle !== userHandle;
        });
    }

    private removeUserFromDOM(userHandle: string): void {
        const listContainer = this.view.getListContainerElement();
        if (listContainer) {
            const elementToRemove = listContainer.querySelector(
                `[data-user-handle="${userHandle}"]`
            );
            if (elementToRemove) {
                listContainer.removeChild(elementToRemove);
            }
        }
    }

    private updateUIAfterRemoval(): void {
        this.updateBlockedUsersCount();
        if (this.isCurrentPageEmpty()) {
            this.view.showEmptyState();
        }
    }

    private isCurrentPageEmpty(): boolean {
        const startIndex = (this.blockedUsersPage - 1) * this.blockedUsersPageSize;
        const endIndex = startIndex + this.blockedUsersPageSize;
        const currentPageData = this.currentBlockedUsersData.slice(startIndex, endIndex);
        return currentPageData.length === 0;
    }

}
