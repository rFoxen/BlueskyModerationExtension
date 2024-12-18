import { AppBskyGraphDefs } from '@atproto/api';
import { BlueskyService } from '@src/services/BlueskyService';
import { STORAGE_KEYS, MESSAGES, LABELS, ERRORS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';

export class BlockListDropdown {
    private dropdownElement: HTMLSelectElement;
    private service: BlueskyService;
    private selectionChangeCallback: ((selectedUri: string) => void) | null = null;

    // Store event handler references for cleanup
    private eventHandlers: { [key: string]: EventListener } = {};

    constructor(dropdownId: string, service: BlueskyService) {
        const element = document.getElementById(dropdownId);
        if (!element) {
            throw new Error(`Dropdown element with ID "${dropdownId}" not found.`);
        }
        this.dropdownElement = element as HTMLSelectElement;
        this.service = service;

        const selectionChangeHandler = (event: Event) => this.handleSelectionChange(event);
        this.eventHandlers['selectionChange'] = selectionChangeHandler;
        EventListenerHelper.addEventListener(this.dropdownElement, 'change', selectionChangeHandler);
    } 

    public async loadBlockLists(): Promise<void> {
        this.setLoadingState(true);
        try {
            const blockLists = await this.service.getBlockLists();
            this.populateDropdown(blockLists);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_LOAD_BLOCK_LISTS, error);
            this.populateDropdown([]);
            const option = document.createElement('option');
            option.text = ERRORS.FAILED_TO_LOAD_BLOCK_LISTS;
            option.disabled = true;
            option.selected = true;
            this.dropdownElement.add(option);
        } finally {
            this.setLoadingState(false);
        }

        const savedSelectedUri = StorageHelper.getString(STORAGE_KEYS.SELECTED_BLOCK_LIST, '');
        if (savedSelectedUri) {
            this.dropdownElement.value = savedSelectedUri;
            this.dropdownElement.dispatchEvent(new Event('change'));
        }
    }

    public async refreshBlockLists(): Promise<void> {
        await this.loadBlockLists();
    }

    public getSelectedValue(): string | null {
        const selectedValue = this.dropdownElement.value;
        if (selectedValue === LABELS.SELECT_BLOCK_LIST_PLACEHOLDER || selectedValue === MESSAGES.LOADING_BLOCK_LISTS) {
            return null;
        }
        return selectedValue || null;
    }

    public getSelectedText(): string | null {
        const selectedOption = this.dropdownElement.options[this.dropdownElement.selectedIndex];
        if (selectedOption && !selectedOption.disabled) {
            return selectedOption.textContent || null;
        }
        return null;
    }

    public clearDropdown(): void {
        this.dropdownElement.innerHTML = '';
        const option = document.createElement('option');
        option.text = MESSAGES.BLOCK_LISTS_CLEARED;
        option.disabled = true;
        option.selected = true;
        this.dropdownElement.add(option);
        StorageHelper.setString(STORAGE_KEYS.SELECTED_BLOCK_LIST, '');
    }

    public clearSelection(): void {
        StorageHelper.setString(STORAGE_KEYS.SELECTED_BLOCK_LIST, '');
    }

    public onSelectionChange(callback: (selectedUri: string) => void): void {
        this.selectionChangeCallback = callback;
    }

    private populateDropdown(blockLists: AppBskyGraphDefs.ListView[]): void {
        this.dropdownElement.innerHTML = '';

        if (blockLists.length === 0) {
            const option = document.createElement('option');
            option.text = MESSAGES.NO_BLOCK_LISTS_FOUND;
            option.disabled = true;
            option.selected = true;
            this.dropdownElement.add(option);
            return;
        }

        const defaultOption = document.createElement('option');
        defaultOption.text = LABELS.SELECT_BLOCK_LIST_PLACEHOLDER;
        defaultOption.disabled = true;
        defaultOption.selected = true;
        this.dropdownElement.add(defaultOption);

        blockLists.forEach((list) => {
            const option = document.createElement('option');
            option.value = list.uri;
            option.text = list.name || LABELS.UNNAMED_LIST;
            this.dropdownElement.add(option);
        });
    }

    private handleSelectionChange(event: Event): void {
        const select = event.target as HTMLSelectElement;
        const selectedUri = select.value;
        StorageHelper.setString(STORAGE_KEYS.SELECTED_BLOCK_LIST, selectedUri);
        if (this.selectionChangeCallback) {
            this.selectionChangeCallback(selectedUri);
        }
    }

    private setLoadingState(isLoading: boolean): void {
        if (isLoading) {
            this.dropdownElement.innerHTML = `<option>${MESSAGES.LOADING_BLOCK_LISTS}</option>`;
            this.dropdownElement.disabled = true;
        } else {
            this.dropdownElement.disabled = false;
        }
    }

    private populateDropdownWithError(): void {
        this.dropdownElement.innerHTML = '';
        const option = document.createElement('option');
        option.text = ERRORS.FAILED_TO_LOAD_BLOCK_LISTS;
        option.disabled = true;
        option.selected = true;
        this.dropdownElement.add(option);
    }

    // New method to clean up event listeners
    public destroy(): void {
        const selectionChangeHandler = this.eventHandlers['selectionChange'];
        if (selectionChangeHandler) {
            EventListenerHelper.removeEventListener(this.dropdownElement, 'change', selectionChangeHandler);
            delete this.eventHandlers['selectionChange'];
        }
    }
}
