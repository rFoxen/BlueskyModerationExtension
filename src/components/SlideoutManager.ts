// src/components/SlideoutManager.ts

import template from '@public/templates/loginSlideout.hbs';
import { EventEmitter } from '@src/utils/EventEmitter';
import {
    LABELS,
    ARIA_LABELS,
    ERRORS,
    STORAGE_KEYS,
} from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';

export class SlideoutManager extends EventEmitter {
    private slideoutElement!: HTMLElement;
    private overlayElement!: HTMLElement;
    private toggleButton!: HTMLElement;
    private themeToggleButton!: HTMLElement;
    private logoutButton!: HTMLElement;
    private loginForm!: HTMLFormElement;
    private userInfoSection!: HTMLElement;
    private loggedInUsername!: HTMLElement;
    private blockListsSection!: HTMLElement;
    private closeSlideoutButton!: HTMLElement;
    private blockButtonsToggle!: HTMLInputElement;

    constructor() {
        super();
        this.injectSlideout();
        this.addEventListeners();
        this.applySavedState();
    }

    private injectSlideout(): void {
        const slideoutHTML = template({
            labels: LABELS,
            ariaLabels: ARIA_LABELS,
        });
        const div = document.createElement('div');
        div.innerHTML = slideoutHTML;
        document.body.appendChild(div);

        this.slideoutElement = document.getElementById('login-slideout')!;
        this.overlayElement = document.getElementById('slideout-overlay')!;
        this.toggleButton = document.getElementById('toggle-slideout')!;
        this.themeToggleButton = document.getElementById('theme-toggle')!;
        this.logoutButton = document.getElementById('logout-button')!;
        this.loginForm = document.getElementById('login-form') as HTMLFormElement;
        this.userInfoSection = document.getElementById('user-info')!;
        this.loggedInUsername = document.getElementById('logged-in-username')!;
        this.blockListsSection = document.getElementById('block-lists-section')!;
        this.closeSlideoutButton = document.getElementById('close-slideout')!;
        this.blockButtonsToggle = document.getElementById('block-buttons-toggle') as HTMLInputElement;
    }

    private addEventListeners(): void {
        EventListenerHelper.addEventListener(
            this.closeSlideoutButton,
            'click',
            () => this.hideSlideout()
        );
        EventListenerHelper.addEventListener(this.loginForm, 'submit', (e) =>
            this.handleLoginFormSubmit(e)
        );
        EventListenerHelper.addEventListener(this.logoutButton, 'click', () =>
            this.emit('logout')
        );
        EventListenerHelper.addEventListener(this.toggleButton, 'click', () =>
            this.showSlideout()
        );
        EventListenerHelper.addEventListener(this.overlayElement, 'click', () =>
            this.hideSlideout()
        );
        EventListenerHelper.addEventListener(this.themeToggleButton, 'click', () =>
            this.emit('themeToggle')
        );
        EventListenerHelper.addEventListener(this.blockButtonsToggle, 'change', () => {
            const isChecked = this.blockButtonsToggle.checked;
            this.saveBlockButtonsToggleState(isChecked);
            this.emit('blockButtonsToggle', isChecked);
        });
    }
    private saveBlockButtonsToggleState(isChecked: boolean): void {
        try {
            localStorage.setItem(
                STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE,
                JSON.stringify(isChecked)
            );
        } catch (error) {
            console.error(ERRORS.FAILED_TO_SAVE_BLOCK_BUTTONS_TOGGLE_STATE, error);
        }
    }

    public getBlockButtonsToggleState(): boolean {
        try {
            const state = localStorage.getItem(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE);
            return state ? JSON.parse(state) : true; // Default to true (buttons shown)
        } catch (error) {
            console.error(ERRORS.FAILED_TO_RETRIEVE_BLOCK_BUTTONS_TOGGLE_STATE, error);
            return true;
        }
    }

    private async handleLoginFormSubmit(event: Event): Promise<void> {
        event.preventDefault();
        const usernameInput = this.loginForm.querySelector(
            '#username'
        ) as HTMLInputElement;
        const passwordInput = this.loginForm.querySelector(
            '#password'
        ) as HTMLInputElement;
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            this.displayFormFeedback(ERRORS.BOTH_FIELDS_REQUIRED, 'danger');
            return;
        }

        this.emit('login', username, password);
    }

    public displayLoginInfo(username: string | null): void {
        if (username) {
            this.loggedInUsername.textContent = username;
            this.userInfoSection.classList.remove('d-none');
            this.loginForm.classList.add('d-none');
        }
    }

    public hideUserInfo(): void {
        this.loggedInUsername.textContent = '';
        this.userInfoSection.classList.add('d-none');
        this.loginForm.classList.remove('d-none');
    }

    public showBlockListsSection(): void {
        this.blockListsSection.classList.remove('d-none');
    }

    public hideBlockListsSection(): void {
        this.blockListsSection.classList.add('d-none');
    }

    public displayFormFeedback(
        message: string,
        type: 'success' | 'danger'
    ): void {
        let feedback = this.loginForm.querySelector(
            '.form-feedback'
        ) as HTMLElement;
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.className = 'form-feedback alert';
            this.loginForm.prepend(feedback);
        }

        feedback.classList.remove('alert-success', 'alert-danger', 'd-none');
        feedback.classList.add(`alert-${type}`);
        feedback.textContent = message;

        setTimeout(() => {
            feedback.classList.add('d-none');
        }, 3000);
    }

    public showSlideout(): void {
        this.slideoutElement.classList.add('show');
        this.overlayElement.classList.add('show');
        this.toggleButton.classList.add('hidden');
        this.saveSlideoutState(true);
    }

    public hideSlideout(): void {
        this.slideoutElement.classList.remove('show');
        this.overlayElement.classList.remove('show');
        this.toggleButton.classList.remove('hidden');
        this.saveSlideoutState(false);
    }

    private saveSlideoutState(isVisible: boolean): void {
        try {
            localStorage.setItem(
                STORAGE_KEYS.SLIDEOUT_STATE,
                JSON.stringify(isVisible)
            );
        } catch (error) {
            console.error(ERRORS.FAILED_TO_SAVE_SLIDEOUT_STATE, error);
        }
    }

    private applySavedState(): void {
        const savedState = this.getSavedSlideoutState();
        if (savedState === null || savedState === undefined) {
            this.showSlideout();
        } else if (savedState) {
            this.showSlideout();
        } else {
            this.hideSlideout();
        }

        // Set initial state of block buttons toggle
        const blockButtonsVisible = this.getBlockButtonsToggleState();
        this.blockButtonsToggle.checked = blockButtonsVisible;
        this.emit('blockButtonsToggle', blockButtonsVisible);
    }

    private getSavedSlideoutState(): boolean | null {
        try {
            const state = localStorage.getItem(STORAGE_KEYS.SLIDEOUT_STATE);
            return state ? JSON.parse(state) : null;
        } catch (error) {
            console.error(ERRORS.FAILED_TO_RETRIEVE_SLIDEOUT_STATE, error);
            return null;
        }
    }
}