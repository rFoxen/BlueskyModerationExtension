import template from '@public/templates/loginSlideout.hbs';
import { LABELS, ARIA_LABELS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';

export class SlideoutView {
    public slideoutElement: HTMLElement;
    public overlayElement: HTMLElement;
    public toggleButton: HTMLElement;
    public themeToggleButton: HTMLElement;
    public logoutButton: HTMLElement;
    public loginForm: HTMLFormElement;
    public userInfoSection: HTMLElement;
    public loggedInUsername: HTMLElement;
    public blockListsSection: HTMLElement;
    public closeSlideoutButton: HTMLElement;
    public blockButtonsToggle: HTMLInputElement;

    constructor() {
        this.injectSlideout();

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

    private injectSlideout(): void {
        const slideoutHTML = template({ labels: LABELS, ariaLabels: ARIA_LABELS });
        const div = document.createElement('div');
        div.innerHTML = slideoutHTML;
        document.body.appendChild(div);
    }

    public destroy(): void {
        // Optionally remove the slideout from the DOM
        if (this.slideoutElement && this.slideoutElement.parentElement) {
            this.slideoutElement.parentElement.removeChild(this.slideoutElement);
        }
        if (this.overlayElement && this.overlayElement.parentElement) {
            this.overlayElement.parentElement.removeChild(this.overlayElement);
        }
    }
}
