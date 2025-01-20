import { LABELS, STORAGE_KEYS } from '@src/constants/Constants';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';
import { getContrastYIQ } from '@src/utils/colorUtils';

export class BlockedUsersView {
    private toggleSlideoutButton: HTMLElement;
    
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
    private downloadButton: HTMLElement;
    private visitButton: HTMLElement;

    private dbRestoreOverlay: HTMLElement;
    private dbRestoreLogs: HTMLElement;
    private downloadDbButton: HTMLElement;
    private restoreDbButton: HTMLElement;
    private restoreDbFileInput: HTMLInputElement;

    constructor(blockedUsersSectionId: string) {
        this.toggleSlideoutButton = document.getElementById('toggle-slideout')!;
        
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
        this.downloadButton = this.section.querySelector('#download-blocked-users') as HTMLElement;
        this.visitButton = this.section.querySelector('#visit-block-list') as HTMLElement;

        this.dbRestoreOverlay = document.getElementById('db-restore-overlay')!;
        this.dbRestoreLogs = document.getElementById('db-restore-logs')!;
        this.downloadDbButton = document.getElementById('download-db')!;
        this.restoreDbButton = document.getElementById('restore-db')!;
        this.restoreDbFileInput = document.getElementById('restore-db-file')! as HTMLInputElement;
    }

    public clearBlockedUsersList(): void {
        this.blockedUsersList.innerHTML = '';
        this.updateCount(0);
        this.section.classList.add('d-none');
    }
    
    public getListContainerElement(): HTMLElement {
        return this.blockedUsersList;
    }
    
    public showSection(): void {
        this.section.classList.remove('d-none');
    }

    public hideSection(): void {
        this.section.classList.add('d-none');
    }

    
    /**
     * Updates the color of the toggle-slideout button.
     * @param color The hexadecimal color code to apply.
     */
    public updateToggleSlideoutColor(color: string): void {
        this.toggleSlideoutButton.style.backgroundColor = color;
        this.toggleSlideoutButton.style.borderColor = color;

        // Optional: Adjust text color for better contrast
        const textColor = getContrastYIQ(color);
        this.toggleSlideoutButton.style.color = textColor;
    }
    
    /**
     * Shows the loading indicator and hides the content.
     */
    public showLoading(): void {
        this.clearBlockedUsersList(); // Clear the list immediately
        this.updateLoadingCount(0);
        this.loadingIndicator.classList.remove('d-none'); // Show the loading spinner
    }

    /**
     * Hides the loading indicator and shows the content.
     */
    public hideLoading(): void {
        this.loadingIndicator.classList.add('d-none'); // Hide the loading spinner
        this.section.classList.remove('d-none');
        this.expandSection();
    }

    /**
     * Updates the loading indicator with the current count of loaded blocked users.
     * @param count The number of blocked users loaded so far.
     */
    public updateLoadingCount(count: number): void {
        let loadingText = this.loadingIndicator.querySelector('.loading-text') as HTMLElement | null;

        if (!loadingText) {
            // Create a span to hold the dynamic loading text if it doesn't exist
            loadingText = document.createElement('span');
            loadingText.classList.add('loading-text');
            this.loadingIndicator.appendChild(loadingText);
        }

        // Update the text content with the current count
        loadingText.textContent = `Loaded ${count} blocked user${count !== 1 ? 's' : ''}...`;
    }

    public updateDbLoadingContext(message: string): void {
        // Reuse the same "loadingIndicator" element
        this.loadingIndicator.classList.remove('d-none'); // ensure it’s visible if not already
        let loadingText = this.loadingIndicator.querySelector('.initializing-db-text') as HTMLElement | null;

        if (!loadingText) {
            // If for some reason it's missing, create it
            loadingText = document.createElement('span');
            loadingText.classList.add('loading-text');
            this.loadingIndicator.appendChild(loadingText);
        }

        // Option 1: Show the latest message
        // loadingText.textContent = message;

        // Option 2: Append lines if you want a "log" style
        const newLine = document.createElement('div');
        newLine.textContent = message;
        loadingText.appendChild(newLine);
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
    /**
     * Clears the search input field and triggers the search handler.
     */
    public clearSearchInput(): void {
        const hasQuery = this.searchInput.value.trim() !== '';

        if (hasQuery) {
            this.searchInput.value = '';
            const event = new Event('input');
            this.searchInput.dispatchEvent(event);

            // Highlight the search input to indicate it has been cleared
            this.highlightSearchInput();
        }
    }

    /**
     * Briefly highlights the search input field.
     */
    private highlightSearchInput(): void {
        this.searchInput.classList.add('highlight');
        setTimeout(() => {
            this.searchInput.classList.remove('highlight');
        }, 500); // Highlight for 500ms
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

    public onDownloadClick(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.downloadButton, 'click', handler);
    }

    public onVisitClick(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.visitButton, 'click', handler);
    }
    
    public onDownloadDbClick(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.downloadDbButton, 'click', handler);
    }

    public onRestoreDbClick(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.restoreDbButton, 'click', handler);
    }

    public onRestoreDbFileChange(handler: EventListener): void {
        EventListenerHelper.addEventListener(this.restoreDbFileInput, 'change', handler);
    }

    /**
     * Show the full-screen overlay while DB is being restored
     */
    public showDbRestoreOverlay(): void {
        this.dbRestoreOverlay.classList.remove('d-none');
        this.dbRestoreOverlay.setAttribute('aria-hidden', 'false');
        // Clear any old logs each time we show the overlay
        this.dbRestoreLogs.innerHTML = '';
    }

    /**
     * Hide the full-screen overlay once DB restore completes or fails
     */
    public hideDbRestoreOverlay(): void {
        this.dbRestoreOverlay.classList.add('d-none');
        this.dbRestoreOverlay.setAttribute('aria-hidden', 'true');
    }

    /**
     * Appends a new line of text to the restoration logs in the overlay.
     */
    public appendDbRestoreLog(message: string): void {
        // For multi-line logs, create a new <div> or <p> for each step
        const line = document.createElement('div');
        line.textContent = message;
        this.dbRestoreLogs.appendChild(line);

        // Optionally auto-scroll to bottom
        this.dbRestoreLogs.scrollTop = this.dbRestoreLogs.scrollHeight;
    }

    public removeEventListener(eventKey: string, handler: EventListener): void {
        // Remove specific event listeners based on event key
        switch (eventKey) {
            case 'toggle': EventListenerHelper.removeEventListener(this.toggleButton, 'click', handler); break;
            case 'prevPage': EventListenerHelper.removeEventListener(this.prevButton, 'click', handler); break;
            case 'nextPage': EventListenerHelper.removeEventListener(this.nextButton, 'click', handler); break;
            case 'search': EventListenerHelper.removeEventListener(this.searchInput, 'input', handler); break;
            case 'refresh': EventListenerHelper.removeEventListener(this.refreshButton, 'click', handler); break;
            case 'download': EventListenerHelper.removeEventListener(this.downloadButton, 'click', handler); break;
            case 'visit': EventListenerHelper.removeEventListener(this.visitButton, 'click', handler); break;
            case 'downloadDb': EventListenerHelper.removeEventListener(this.downloadDbButton, 'click', handler); break;
            case 'restoreDb': EventListenerHelper.removeEventListener(this.restoreDbButton, 'click', handler); break;
            case 'restoreDbFile': EventListenerHelper.removeEventListener(this.restoreDbFileInput, 'change', handler); break;
            default:
                break;
        }
    }

    public destroy(): void {
        // Cleanup if needed
    }
}
