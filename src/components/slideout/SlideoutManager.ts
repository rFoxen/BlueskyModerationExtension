import { SlideoutView } from '@src/components/slideout/SlideoutView';
import { EventEmitter } from '@src/utils/events/EventEmitter';
import { FocusManager } from '@src/utils/dom/FocusManager';
import { SwipeGestureHandler } from '@src/utils/dom/SwipeGestureHandler';
import { LABELS, ARIA_LABELS, ERRORS, STORAGE_KEYS, MESSAGES } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';
import { StateManager } from '@src/utils/state/StateManager';
import { LoginHandler } from '@src/components/authentication/LoginHandler';
import { UserInfoManager } from '@src/components/authentication/UserInfoManager';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';
import Logger from '@src/utils/logger/Logger';

/**
 * Interface representing an event listener entry.
 */
interface EventListenerEntry {
    element: HTMLElement | Document | Window;
    event: string;
    handler: EventListener;
}

/**
 * Manages the slideout UI, login form, block list toggles, etc.
 */
export class SlideoutManager extends EventEmitter {
    private view!: SlideoutView;
    private focusManager!: FocusManager;
    private swipeHandler!: SwipeGestureHandler;
    private stateManager!: StateManager;
    private loginHandler!: LoginHandler;
    private userInfoManager!: UserInfoManager;

    // Centralized registry for event listeners
    private eventListeners: EventListenerEntry[] = [];

    // Reference to the block post style <select>
    private blockPostStyleSelect: HTMLSelectElement | null = null;

    constructor() {
        super();
        this.initializeComponents();
        this.addEventListeners();
        this.applySavedState();
        this.initializeTabListeners();
        this.subscribeToGlobalEvents();
    }

    private initializeComponents(): void {
        this.view = new SlideoutView();
        this.focusManager = new FocusManager(this.view.slideoutElement);
        this.stateManager = new StateManager();
        this.initializeLoginHandler();
        this.initializeUserInfoManager();
    }

    private initializeLoginHandler(): void {
        this.loginHandler = new LoginHandler({
            formElement: this.view.loginForm,
            onLogin: this.handleLogin.bind(this),
            displayFeedback: this.displayFormFeedback.bind(this),
        });
    }

    private initializeUserInfoManager(): void {
        this.userInfoManager = new UserInfoManager({
            loggedInUsernameElement: this.view.loggedInUsername,
            userInfoSectionElement: this.view.userInfoSection,
            loginFormElement: this.view.loginForm,
        });
    }

    private subscribeToGlobalEvents(): void {
        const blockListChangedHandler = this.handleBlockListChanged.bind(this);
        this.addEventListenerToElement(document, 'blockListChanged', blockListChangedHandler);
    }

    /**
     * Handles the custom 'blockListChanged' event.
     * @param event - The event object, expected to be a CustomEvent with a 'detail' property.
     */
    private handleBlockListChanged(event: Event): void {
        const customEvent = event as CustomEvent<{ listName: string }>;
        const listName = customEvent.detail.listName;
        this.updateToggleButtonText(listName);
    }

    /**
     * Updates the toggle button's text to include the selected block list name.
     * @param listName - The name of the currently selected block list.
     */
    public updateToggleButtonText(listName: string): void {
        this.view.toggleButton.textContent = `☰ ${listName}`;
    }

    /**
     * Adds all necessary event listeners by delegating to specific setup methods.
     */
    private addEventListeners(): void {
        this.setupSlideoutUIEventListeners();
        this.setupThemeToggleListener();
        this.setupToggleListener();
        this.setupScrollPreventionListeners();
        this.setupKeyDownListener();
        this.setupBlockPostStyleSelector();
        this.setupPrependAppendRadioListeners();
    }

    private setupSlideoutUIEventListeners(): void {
        this.addEventListenerToElement(this.view.closeSlideoutButton, 'click', () => this.hideSlideout());
        this.addEventListenerToElement(this.view.logoutButton, 'click', () => this.emit('logout'));
        this.addEventListenerToElement(this.view.toggleButton, 'click', () => this.showSlideout());
        this.addEventListenerToElement(this.view.overlayElement, 'click', () => this.hideSlideout());
    }

    private setupThemeToggleListener(): void {
        this.addEventListenerToElement(this.view.themeToggleButton, 'click', () => this.emit('themeToggle'));
    }

    private setupToggleListener(): void {
        const blockHandler = () => {
            const isChecked = this.view.blockButtonsToggle.checked;
            this.stateManager.setBoolean(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE, isChecked);
            this.emit('blockButtonsToggle', isChecked);
        };
        this.addEventListenerToElement(this.view.blockButtonsToggle, 'change', blockHandler);

        const reportHandler = () => {
            const isChecked = this.view.reportButtonsToggle.checked;
            this.stateManager.setBoolean(STORAGE_KEYS.REPORT_BUTTONS_TOGGLE_STATE, isChecked);
            this.emit('reportButtonsToggle', isChecked);
        };
        this.addEventListenerToElement(this.view.reportButtonsToggle, 'change', reportHandler);
        
        const freshnessHandler = () => {
            const isChecked = this.view.freshnessToggle.checked;
            this.stateManager.setBoolean(STORAGE_KEYS.FRESHNESS_TOGGLE_STATE, isChecked);
            this.emit('freshnessToggle', isChecked);
        };
        this.addEventListenerToElement(this.view.freshnessToggle, 'change', freshnessHandler);
    }

    private setupScrollPreventionListeners(): void {
        const preventScrollWheel = (e: Event) => {
            e.stopPropagation();
        };
        const preventScrollTouchMove = (e: Event) => {
            e.stopPropagation();
        };
        this.addEventListenerToElement(this.view.slideoutElement, 'wheel', preventScrollWheel);
        this.addEventListenerToElement(this.view.slideoutElement, 'touchmove', preventScrollTouchMove);
    }

    private setupKeyDownListener(): void {
        const keyDownHandler = (e: KeyboardEvent) => this.handleKeyDown(e);
        this.addEventListenerToElement(document, 'keydown', keyDownHandler as EventListener);
    }

    private setupBlockPostStyleSelector(): void {
        this.blockPostStyleSelect = document.getElementById('block-post-style-select') as HTMLSelectElement;
        if (this.blockPostStyleSelect) {
            const handler = () => {
                const styleValue = this.blockPostStyleSelect!.value || 'darkened';
                this.emit('blockPostStyleChange', styleValue);
                localStorage.setItem(STORAGE_KEYS.BLOCKED_POST_STYLE, styleValue);
            };
            this.addEventListenerToElement(this.blockPostStyleSelect, 'change', handler);
        }
    }

    private setupPrependAppendRadioListeners(): void {
        const prependChangeHandler = () => this.handlePrependAppendChange('prepend');
        const appendChangeHandler = () => this.handlePrependAppendChange('append');

        this.addEventListenerToElement(this.view.prependRadio, 'change', prependChangeHandler);
        this.addEventListenerToElement(this.view.appendRadio, 'change', appendChangeHandler);
    }

    /**
     * Handles changes between prepend and append options.
     * @param option - The selected option, either 'prepend' or 'append'.
     */
    private handlePrependAppendChange(option: 'prepend' | 'append'): void {
        StorageHelper.setString(STORAGE_KEYS.PREPEND_APPEND_OPTION, option);
        this.emit('prependAppendChanged', option);
        Logger.debug(`Prepend/Append option changed to: ${option}`);
    }

    /**
     * Initializes the swipe gesture handler.
     */
    private initializeSwipeGesture(): void {
        if (this.swipeHandler) {
            this.swipeHandler.destroy();
        }
        this.swipeHandler = new SwipeGestureHandler(
            this.view.slideoutElement,
            () => this.hideSlideout(),
            100,
            100
        );
    }

    public showSlideout(): void {
        this.view.slideoutElement.classList.add('show');
        this.view.overlayElement.classList.add('show');
        this.view.toggleButton.classList.add('hidden');
        document.body.classList.add('no-scroll');
        this.stateManager.setBoolean(STORAGE_KEYS.SLIDEOUT_STATE, true);

        // Reset transform and opacity in case they were altered during swipe
        this.view.slideoutElement.style.transform = 'translateX(0)';
        this.view.overlayElement.style.opacity = '0.5';

        // Initialize focus trapping
        this.focusManager.initialize();
        this.focusManager.focusFirst();

        // Re-initialize swipe gesture
        this.initializeSwipeGesture();
    }

    public hideSlideout(): void {
        // Smooth transition out
        this.view.slideoutElement.style.transform = `translateX(100%)`;
        this.view.overlayElement.style.opacity = '0';
        // After transition ends, remove 'show' class and reset styles
        this.view.slideoutElement.addEventListener('transitionend', this.handleTransitionEnd.bind(this), {
            once: true,
        });
        // Release focus
        this.focusManager.destroy();
    }

    private handleTransitionEnd(): void {
        this.hideSlideoutInternal();
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.hideSlideout();
        }
    }

    public displayLoginInfo(username: string | null): void {
        if (username) {
            this.userInfoManager.displayUserInfo(username);
            this.view.blockListsSection.classList.remove('d-none');
        }
    }

    public hideUserInfo(): void {
        this.userInfoManager.hideUserInfo();
        this.view.blockListsSection.classList.add('d-none');
    }

    public showBlockListsSection(): void {
        this.view.blockListsSection.classList.remove('d-none');
    }

    public hideBlockListsSection(): void {
        this.view.blockListsSection.classList.add('d-none');
    }

    public displayFormFeedback(message: string, type: 'success' | 'danger'): void {
        let feedback = this.view.loginForm.querySelector('.form-feedback') as HTMLElement;
        if (!feedback) {
            feedback = document.createElement('div');
            feedback.className = 'form-feedback alert';
            this.view.loginForm.prepend(feedback);
        }
        feedback.classList.remove('alert-success', 'alert-danger', 'd-none');
        feedback.classList.add(`alert-${type}`);
        feedback.textContent = message;

        setTimeout(() => {
            feedback.classList.add('d-none');
        }, 3000);
    }

    private applySavedState(): void {
        // Slideout open/closed
        const savedState = this.stateManager.getBoolean(STORAGE_KEYS.SLIDEOUT_STATE, true);
        if (savedState) {
            this.showSlideout();
        } else {
            this.hideSlideoutInternal();
        }

        // Block Buttons Visibility
        const blockButtonsVisible = this.stateManager.getBoolean(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE, true);
        this.view.blockButtonsToggle.checked = blockButtonsVisible;
        this.emit('blockButtonsToggle', blockButtonsVisible);
        
        // Block Buttons Visibility
        const reportButtonsVisible = this.stateManager.getBoolean(STORAGE_KEYS.REPORT_BUTTONS_TOGGLE_STATE, true);
        this.view.reportButtonsToggle.checked = reportButtonsVisible;
        this.emit('reportButtonsToggle', reportButtonsVisible);
        
        // Block Buttons Visibility
        const freshnessVisible = this.stateManager.getBoolean(STORAGE_KEYS.FRESHNESS_TOGGLE_STATE, true);
        this.view.freshnessToggle.checked = freshnessVisible;
        this.emit('freshnessToggle', freshnessVisible);

        // Load saved blocked post style
        const savedStyle = localStorage.getItem(STORAGE_KEYS.BLOCKED_POST_STYLE) || 'darkened';
        if (this.blockPostStyleSelect) {
            this.blockPostStyleSelect.value = savedStyle;
        }
        // Emit event to initialize style
        this.emit('blockPostStyleChange', savedStyle);

        // Apply Prepend/Append option
        const savedOption = StorageHelper.getString(STORAGE_KEYS.PREPEND_APPEND_OPTION, 'prepend');
        if (savedOption === 'prepend') {
            this.view.prependRadio.checked = true;
        } else if (savedOption === 'append') {
            this.view.appendRadio.checked = true;
        } else {
            this.view.prependRadio.checked = true; // Default to prepend
        }

        // Emit the initial state
        this.emit('prependAppendChanged', savedOption);
    }

    public getBlockButtonsToggleState(): boolean {
        return this.stateManager.getBoolean(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE, true);
    }

    private async handleLogin(username: string, password: string): Promise<void> {
        this.emit('login', username, password);
    }

    private hideSlideoutInternal(): void {
        this.view.slideoutElement.classList.remove('show');
        this.view.overlayElement.classList.remove('show');
        this.view.toggleButton.classList.remove('hidden');
        document.body.classList.remove('no-scroll');
        this.view.slideoutElement.style.transform = 'translateX(100%)';
        this.view.overlayElement.style.opacity = '0';
        this.stateManager.setBoolean(STORAGE_KEYS.SLIDEOUT_STATE, false);
    }

    /**
     * Initializes Tab Event Listeners.
     */
    private initializeTabListeners(): void {
        const tabButtons = this.view.tabList.querySelectorAll('.nav-link');
        tabButtons.forEach((tabButton) => {
            const handler = this.handleTabClick.bind(this);
            this.addEventListenerToElement(tabButton as HTMLElement, 'click', handler);
        });
    }

    private handleTabClick(event: Event): void {
        const clickedTab = event.target as HTMLElement;
        const targetPaneId = clickedTab.getAttribute('data-bs-target');
        if (!targetPaneId) return;

        this.deactivateAllTabs();
        this.activateTab(clickedTab);
        this.hideAllTabPanes();
        this.showTargetTabPane(targetPaneId);
    }

    private deactivateAllTabs(): void {
        const allTabs = this.view.tabList.querySelectorAll('.nav-link');
        allTabs.forEach((tab) => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });
    }

    private activateTab(tab: HTMLElement): void {
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
    }

    private hideAllTabPanes(): void {
        const allPanes = this.view.tabContent.querySelectorAll('.tab-pane');
        allPanes.forEach((pane) => {
            pane.classList.remove('show', 'active');
            pane.setAttribute('aria-hidden', 'true');
        });
    }

    private showTargetTabPane(targetPaneId: string): void {
        const targetPane = this.view.tabContent.querySelector(targetPaneId) as HTMLElement;
        if (targetPane) {
            targetPane.classList.add('show', 'active');
            targetPane.setAttribute('aria-hidden', 'false');
        }
    }

    /**
     * Adds an event listener to a specified element and records it in the registry.
     * @param element - The target element to attach the event listener to.
     * @param event - The event type (e.g., 'click', 'change').
     * @param handler - The event handler function.
     */
    private addEventListenerToElement(
        element: HTMLElement | Document | Window,
        event: string,
        handler: EventListener
    ): void {
        element.addEventListener(event, handler);
        this.eventListeners.push({ element, event, handler });
    }

    /**
     * Removes all event listeners by iterating over the registry.
     */
    private removeAllEventListeners(): void {
        this.eventListeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.eventListeners = []; // Clear the registry after removal
    }

    private cleanupResources(): void {
        // Release focus
        this.focusManager.destroy();

        // Destroy swipe handler
        if (this.swipeHandler) {
            this.swipeHandler.destroy();
        }

        // Destroy the view
        this.view.destroy();

        // Destroy LoginHandler and UserInfoManager
        this.loginHandler.destroy();
        this.userInfoManager.destroy();
    }

    public destroy(): void {
        this.removeAllEventListeners();
        this.cleanupResources();
    }
}
