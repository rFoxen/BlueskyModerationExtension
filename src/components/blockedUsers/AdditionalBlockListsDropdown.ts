import { AppBskyGraphDefs } from '@atproto/api';
import { BlueskyService } from '@src/services/BlueskyService';
import { STORAGE_KEYS, MESSAGES, LABELS, ERRORS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';

export class AdditionalBlockListsDropdown {
    private dropdownElement: HTMLSelectElement;
    private service: BlueskyService;
    private eventHandlers: { [key: string]: EventListener } = {};

    constructor(dropdownId: string, service: BlueskyService) {
        const element = document.getElementById(dropdownId);
        if (!element) {
            throw new Error(`Dropdown element with ID "${dropdownId}" not found.`);
        }
        this.dropdownElement = element as HTMLSelectElement;
        this.service = service;

        const onChangeHandler = (event: Event) => this.handleSelectionChange(event);
        this.eventHandlers['change'] = onChangeHandler;
        EventListenerHelper.addEventListener(
            this.dropdownElement,
            'change',
            onChangeHandler
        );
    }

    public async loadBlockLists(): Promise<void> {
        this.setLoadingState(true);
        try {
            const blockLists = await this.service.getBlockLists();
            this.populateDropdown(blockLists);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_LOAD_BLOCK_LISTS, error);
            // Show some error option
            this.dropdownElement.innerHTML = '';
            const option = document.createElement('option');
            option.text = ERRORS.FAILED_TO_LOAD_BLOCK_LISTS;
            option.disabled = true;
            option.selected = true;
            this.dropdownElement.add(option);
        } finally {
            this.setLoadingState(false);
        }

        // Restore previously saved multi-selections
        const savedUris = StorageHelper.getString(STORAGE_KEYS.ADDITIONAL_BLOCK_LISTS, '');
        if (savedUris) {
            const selectedList = savedUris.split(',');
            for (const uri of selectedList) {
                const option = Array.from(this.dropdownElement.options).find(
                    (opt) => opt.value === uri
                );
                if (option) {
                    option.selected = true;
                }
            }
            this.dropdownElement.dispatchEvent(new Event('change'));
        }
    }

    public async refreshBlockLists(): Promise<void> {
        await this.loadBlockLists();
    }

    public getSelectedValues(): string[] {
        const selectedValues: string[] = [];
        for (const option of Array.from(this.dropdownElement.options)) {
            if (option.selected && !option.disabled) {
                selectedValues.push(option.value);
            }
        }
        return selectedValues;
    }

    public clearSelection(): void {
        for (const option of Array.from(this.dropdownElement.options)) {
            option.selected = false;
        }
        StorageHelper.setString(STORAGE_KEYS.ADDITIONAL_BLOCK_LISTS, '');
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

        // Create options
        blockLists.forEach((list) => {
            const option = document.createElement('option');
            option.value = list.uri;
            option.text = list.name || LABELS.UNNAMED_LIST;
            this.dropdownElement.add(option);
        });
    }

    private handleSelectionChange(event: Event): void {
        const selectedUris = this.getSelectedValues();
        // Save to localStorage as CSV
        StorageHelper.setString(STORAGE_KEYS.ADDITIONAL_BLOCK_LISTS, selectedUris.join(','));
        // Dispatch a custom event or call a callback
        const customEvent = new CustomEvent('additionalBlockListsChanged', {
            detail: { selectedUris },
        });
        document.dispatchEvent(customEvent);
    }

    private setLoadingState(isLoading: boolean): void {
        if (isLoading) {
            this.dropdownElement.innerHTML = `<option>${MESSAGES.LOADING_BLOCK_LISTS}</option>`;
            this.dropdownElement.disabled = true;
        } else {
            this.dropdownElement.disabled = false;
        }
    }

    public destroy(): void {
        // Cleanup
        const changeHandler = this.eventHandlers['change'];
        if (changeHandler) {
            EventListenerHelper.removeEventListener(
                this.dropdownElement,
                'change',
                changeHandler
            );
            delete this.eventHandlers['change'];
        }
    }
}
