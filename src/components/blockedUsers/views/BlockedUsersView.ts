import { LABELS, STORAGE_KEYS } from '@src/constants/Constants';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';

export class BlockedUsersView {
    private section: HTMLElement;
    private blockedUsersList: HTMLElement;
    private loadingIndicator: HTMLElement;
    private toggleButton: HTMLElement;
    private content: HTMLElement;
    private countElement: HTMLElement;
    private prevButton: HTMLButtonElement;
    private nextButton: HTMLButtonElement;
    private pageInfo: HTMLElement;
    private searchInput: HTMLInputElement;
    private refreshButton: HTMLElement;

    constructor(blockedUsersSectionId: string) {
        this.section = document.getElementById(blockedUsersSectionId)!;
        this.blockedUsersList = this.section.querySelector('#blocked-users-list')!;
        this.loadingIndicator = document.querySelector('#blocked-users-loading')!;
        this.toggleButton = this.section.querySelector('#blocked-users-toggle')!;
        this.content = this.section.querySelector('#blocked-users-content')!;
        this.countElement = this.section.querySelector('#blocked-users-count')!;
        this.prevButton = this.section.querySelector('#blocked-users-prev') as HTMLButtonElement;
        this.nextButton = this.section.querySelector('#blocked-users-next') as HTMLButtonElement;
        this.pageInfo = this.section.querySelector('#blocked-users-page-info') as HTMLElement;
        this.searchInput = this.section.querySelector('#blocked-users-search') as HTMLInputElement;
        this.refreshButton = this.section.querySelector('#refresh-blocked-users') as HTMLElement;
    }

    public showSection(): void {
        this.section.classList.remove('d-none');
    }

    public hideSection(): void {
        this.section.classList.add('d-none');
    }

    public setLoadingState(isLoading: boolean): void {
        this.loadingIndicator.classList.toggle('d-none', !isLoading);
        this.content.classList.toggle('d-none', isLoading);
    }

    public isSectionExpanded(): boolean {
        return this.toggleButton.getAttribute('aria-expanded') === 'true';
    }

    public expandSection(): void {
        this.toggleButton.setAttribute('aria-expanded', 'true');
        this.content.classList.remove('d-none');
        this.toggleButton.classList.add('active');
    }

    public collapseSection(): void {
        this.toggleButton.setAttribute('aria-expanded', 'false');
        this.content.classList.add('d-none');
        this.toggleButton.classList.remove('active');
    }

    public applySavedToggleState(): void {
        const savedState = StorageHelper.getBoolean(STORAGE_KEYS.BLOCKED_USERS_TOGGLE_STATE, false);
        if (savedState) {
            this.expandSection();
        } else {
            this.collapseSection();
        }
    }

    public showEmptyState(): void {
        this.blockedUsersList.innerHTML = '';
        const noUsersItem = document.createElement('div');
        noUsersItem.className = 'list-group-item empty-state';
        noUsersItem.textContent = LABELS.NO_USERS_FOUND;
        this.blockedUsersList.appendChild(noUsersItem);
    }

    public renderBlockedUsersList(items: HTMLDivElement[]): void {
        this.blockedUsersList.innerHTML = '';
        const fragment = document.createDocumentFragment();
        items.forEach(item => fragment.appendChild(item));
        this.blockedUsersList.appendChild(fragment);
    }

    public updatePagination(currentPage: number, totalPages: number): void {
        this.prevButton.disabled = currentPage <= 1;
        this.nextButton.disabled = currentPage >= totalPages;
        this.pageInfo.textContent = LABELS.PAGE_INFO(currentPage, totalPages);
    }

    public updateCount(count: number): void {
        this.countElement.textContent = String(count);
    }

    // Event hookup methods
    public onToggleClick(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.toggleButton, 'click', handler);
    }

    public onPrevPageClick(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.prevButton, 'click', handler);
    }

    public onNextPageClick(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.nextButton, 'click', handler);
    }

    public onSearchInput(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.searchInput, 'input', handler);
    }

    public onRefreshClick(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.refreshButton, 'click', handler);
    }

    public removeEventListener(eventKey: string, handler: EventListener): void {
        // Remove specific event listeners based on event key
        switch (eventKey) {
            case 'toggle':
                EventListenerHelper.removeEventListener(this.toggleButton, 'click', handler);
                break;
            case 'prevPage':
                EventListenerHelper.removeEventListener(this.prevButton, 'click', handler);
                break;
            case 'nextPage':
                EventListenerHelper.removeEventListener(this.nextButton, 'click', handler);
                break;
            case 'search':
                EventListenerHelper.removeEventListener(this.searchInput, 'input', handler);
                break;
            case 'refresh':
                EventListenerHelper.removeEventListener(this.refreshButton, 'click', handler);
                break;
            default:
                break;
        }
    }

    public destroy(): void {
        // Cleanup if needed
    }
}
