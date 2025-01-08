import template from '@public/templates/loginSlideout.hbs';
import { LABELS, ARIA_LABELS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';

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

    public prependRadio: HTMLInputElement;
    public appendRadio: HTMLInputElement;
    
    // New References for Tabs
    public tabList: HTMLElement;
    public tabContent: HTMLElement;
    public blockedUsersToggle: HTMLElement;
    public blockedUsersContent: HTMLElement;

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

        // Initialize new tab references
        this.tabList = this.slideoutElement.querySelector('#slideoutTabs')!;
        this.tabContent = this.slideoutElement.querySelector('#slideoutTabsContent')!;

        // Initialize accordion references
        this.blockedUsersToggle = this.slideoutElement.querySelector('#blocked-users-toggle')!;
        this.blockedUsersContent = this.slideoutElement.querySelector('#blocked-users-content')!;
        
        // Initialize new radio button references
        this.prependRadio = this.slideoutElement.querySelector('#prepend-radio') as HTMLInputElement;
        this.appendRadio = this.slideoutElement.querySelector('#append-radio') as HTMLInputElement;
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
        // Clean up references
        this.prependRadio = null!;
        this.appendRadio = null!;
    }
}
