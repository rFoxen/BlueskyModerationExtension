// =============================== //
// src/components/BlockListDropdown.ts

import { AppBskyGraphDefs } from '@atproto/api';
import { BlueskyService } from '@src/services/BlueskyService';
import {
    STORAGE_KEYS,
    MESSAGES,
    LABELS,
    ERRORS,
} from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';

export class BlockListDropdown {
    private dropdownElement: HTMLSelectElement;
    private service: BlueskyService;
    private selectionChangeCallback: ((selectedUri: string) => void) | null = null;

    constructor(dropdownId: string, service: BlueskyService) {
        const element = document.getElementById(dropdownId);
        if (!element) {
            throw new Error(`Dropdown element with ID "${dropdownId}" not found.`);
        }
        this.dropdownElement = element as HTMLSelectElement;
        this.service = service;

        // Register the event listener
        EventListenerHelper.addEventListener(
            this.dropdownElement,
            'change',
            this.handleSelectionChange.bind(this)
        );
    }

    public async loadBlockLists(): Promise<void> {
        this.setLoadingState(true);
        try {
            const blockLists = await this.service.getBlockLists();
            this.populateDropdown(blockLists);
        } catch (error) {
            console.error(MESSAGES.FAILED_TO_LOAD_BLOCK_LISTS, error);
            this.populateDropdown([]);
            // Optionally display an error message in the dropdown
            const option = document.createElement('option');
            option.text = MESSAGES.FAILED_TO_LOAD_BLOCK_LISTS;
            option.disabled = true;
            option.selected = true;
            this.dropdownElement.add(option);
        } finally {
            this.setLoadingState(false);
        }

        // Restore the selected block list from localStorage
        const savedSelectedUri = this.getSavedSelectedBlockList();
        if (savedSelectedUri) {
            this.dropdownElement.value = savedSelectedUri;
            // Trigger the change event to update dependent UI
            this.dropdownElement.dispatchEvent(new Event('change'));
        }
    }

    public async refreshBlockLists(): Promise<void> {
        await this.loadBlockLists();
    }

    public getSelectedValue(): string | null {
        const selectedValue = this.dropdownElement.value;
        if (
            selectedValue === MESSAGES.SELECT_BLOCK_LIST ||
            selectedValue === MESSAGES.LOADING_BLOCK_LISTS
        ) {
            return null;
        }
        return selectedValue || null;
    }

    public getSelectedText(): string | null {
        const selectedOption =
            this.dropdownElement.options[this.dropdownElement.selectedIndex];
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
        // Clear the saved selection
        this.saveSelectedBlockList('');
    }

    public clearSelection(): void {
        try {
            localStorage.removeItem(STORAGE_KEYS.SELECTED_BLOCK_LIST);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_SAVE_SELECTED_BLOCK_LIST, error);
        }
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
            option.text = list.name || 'Unnamed List';
            this.dropdownElement.add(option);
        });
    }

    private handleSelectionChange(event: Event): void {
        const select = event.target as HTMLSelectElement;
        const selectedUri = select.value;
        this.saveSelectedBlockList(selectedUri);

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

    private saveSelectedBlockList(uri: string): void {
        try {
            localStorage.setItem(STORAGE_KEYS.SELECTED_BLOCK_LIST, uri);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_SAVE_SELECTED_BLOCK_LIST, error);
        }
    }

    private getSavedSelectedBlockList(): string | null {
        try {
            const uri = localStorage.getItem(STORAGE_KEYS.SELECTED_BLOCK_LIST);
            return uri || null;
        } catch (error) {
            console.error(ERRORS.FAILED_TO_RETRIEVE_SELECTED_BLOCK_LIST, error);
            return null;
        }
    }
}