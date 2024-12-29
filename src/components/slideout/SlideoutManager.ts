import { SlideoutView } from '@src/components/slideout/SlideoutView';
import { EventEmitter } from '@src/utils/events/EventEmitter';
import { FocusManager } from '@src/utils/dom/FocusManager';
import { SwipeGestureHandler } from '@src/utils/dom/SwipeGestureHandler';
import {
    LABELS,
    ARIA_LABELS,
    ERRORS,
    STORAGE_KEYS,
    MESSAGES,
} from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';
import { StateManager } from '@src/utils/state/StateManager';
import { LoginHandler } from '@src/components/authentication/LoginHandler';
import { UserInfoManager } from '@src/components/authentication/UserInfoManager';

/**
 * Manages the slideout UI, login form, block list toggles, etc.
 */
export class SlideoutManager extends EventEmitter {
    private view: SlideoutView;
    private focusManager: FocusManager;
    private swipeHandler: SwipeGestureHandler | null = null;
    private stateManager: StateManager;
    private loginHandler: LoginHandler;
    private userInfoManager: UserInfoManager;

    // Store references to event handlers for cleanup
    private eventHandlers: { [key: string]: EventListener } = {};

    // NEW: reference to the block post style <select>
    private blockPostStyleSelect: HTMLSelectElement | null = null;

    constructor() {
        super();
        this.view = new SlideoutView();
        this.focusManager = new FocusManager(this.view.slideoutElement);
        this.stateManager = new StateManager();

        // Initialize LoginHandler
        this.loginHandler = new LoginHandler({
            formElement: this.view.loginForm,
            onLogin: this.handleLogin.bind(this),
            displayFeedback: this.displayFormFeedback.bind(this),
        });

        // Initialize UserInfoManager
        this.userInfoManager = new UserInfoManager({
            loggedInUsernameElement: this.view.loggedInUsername,
            userInfoSectionElement: this.view.userInfoSection,
            loginFormElement: this.view.loginForm,
        });

        this.addEventListeners();
        this.applySavedState();
        this.initializeTabListeners();
    }

    private addEventListeners(): void {
        // Define handlers
        const closeSlideoutHandler = () => this.hideSlideout();
        const logoutHandler = () => this.emit('logout');
        const toggleSlideoutHandler = () => this.showSlideout();
        const overlayClickHandler = () => this.hideSlideout();
        const themeToggleHandler = () => this.emit('themeToggle');
        const blockButtonsToggleHandler = () => {
            const isChecked = this.view.blockButtonsToggle.checked;
            this.stateManager.setBoolean(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE, isChecked);
            this.emit('blockButtonsToggle', isChecked);
        };
        const preventScrollWheel = (e: Event) => {
            const wheelEvent = e as WheelEvent;
            wheelEvent.stopPropagation();
        };
        const preventScrollTouchMove = (e: Event) => {
            const touchEvent = e as TouchEvent;
            touchEvent.stopPropagation();
        };
        const keyDownHandler = (e: Event) => this.handleKeyDown(e as KeyboardEvent);

        // Assign to eventHandlers for later removal
        this.eventHandlers['closeSlideout'] = closeSlideoutHandler;
        this.eventHandlers['logout'] = logoutHandler;
        this.eventHandlers['toggleSlideout'] = toggleSlideoutHandler;
        this.eventHandlers['overlayClick'] = overlayClickHandler;
        this.eventHandlers['themeToggle'] = themeToggleHandler;
        this.eventHandlers['blockButtonsToggle'] = blockButtonsToggleHandler;
        this.eventHandlers['preventScrollWheel'] = preventScrollWheel;
        this.eventHandlers['preventScrollTouchMove'] = preventScrollTouchMove;
        this.eventHandlers['keyDown'] = keyDownHandler;

        // Add event listeners
        EventListenerHelper.addEventListener(this.view.closeSlideoutButton, 'click', closeSlideoutHandler);
        EventListenerHelper.addEventListener(this.view.logoutButton, 'click', logoutHandler);
        EventListenerHelper.addEventListener(this.view.toggleButton, 'click', toggleSlideoutHandler);
        EventListenerHelper.addEventListener(this.view.overlayElement, 'click', overlayClickHandler);
        EventListenerHelper.addEventListener(this.view.themeToggleButton, 'click', themeToggleHandler);
        EventListenerHelper.addEventListener(
            this.view.blockButtonsToggle,
            'change',
            blockButtonsToggleHandler
        );

        // Prevent scroll propagation
        EventListenerHelper.addEventListener(this.view.slideoutElement, 'wheel', preventScrollWheel);
        EventListenerHelper.addEventListener(this.view.slideoutElement, 'touchmove', preventScrollTouchMove);

        // Add keydown listener for ESC key
        EventListenerHelper.addEventListener(document, 'keydown', keyDownHandler);

        // Initialize SwipeGestureHandler
        this.initializeSwipeGesture();

        // NEW: set up the block post style select
        this.blockPostStyleSelect = document.getElementById('block-post-style-select') as HTMLSelectElement;
        if (this.blockPostStyleSelect) {
            const blockPostStyleChangeHandler = () => {
                const styleValue = this.blockPostStyleSelect?.value || 'darkened';
                // Emit event so other parts can handle
                this.emit('blockPostStyleChange', styleValue);

                // Persist to localStorage
                localStorage.setItem(STORAGE_KEYS.BLOCKED_POST_STYLE, styleValue);
            };

            this.blockPostStyleSelect.addEventListener('change', blockPostStyleChangeHandler);
            this.eventHandlers['blockPostStyleChange'] = blockPostStyleChangeHandler;
        }
    }

    private initializeSwipeGesture(): void {
        if (this.swipeHandler) {
            this.swipeHandler.destroy();
        }
        this.swipeHandler = new SwipeGestureHandler(
            this.view.slideoutElement,
            () => {
                this.hideSlideout();
            },
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
        this.view.overlayElement.style.opacity = '0.35';

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

        // NEW: load saved blocked post style
        const savedStyle = localStorage.getItem(STORAGE_KEYS.BLOCKED_POST_STYLE) || 'darkened';
        if (this.blockPostStyleSelect) {
            this.blockPostStyleSelect.value = savedStyle;
        }
        // Emit event to initialize style
        this.emit('blockPostStyleChange', savedStyle);
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

    // Initialize Tab Event Listeners
    private initializeTabListeners(): void {
        const tabButtons = this.view.tabList.querySelectorAll('.nav-link');
        tabButtons.forEach((tabButton) => {
            EventListenerHelper.addEventListener(tabButton as HTMLElement, 'click', this.handleTabClick.bind(this));
        });
        this.eventHandlers['tabClick'] = this.handleTabClick.bind(this);
    }

    private handleTabClick(event: Event): void {
        const clickedTab = event.target as HTMLElement;
        const targetPaneId = clickedTab.getAttribute('data-bs-target');
        if (!targetPaneId) return;

        // Deactivate all tabs
        const allTabs = this.view.tabList.querySelectorAll('.nav-link');
        allTabs.forEach((tab) => {
            tab.classList.remove('active');
            tab.setAttribute('aria-selected', 'false');
        });

        // Activate clicked tab
        clickedTab.classList.add('active');
        clickedTab.setAttribute('aria-selected', 'true');

        // Hide all tab panes
        const allPanes = this.view.tabContent.querySelectorAll('.tab-pane');
        allPanes.forEach((pane) => {
            pane.classList.remove('show', 'active');
            pane.setAttribute('aria-hidden', 'true');
        });

        // Show the targeted tab pane
        const targetPane = this.view.tabContent.querySelector(targetPaneId) as HTMLElement;
        if (targetPane) {
            targetPane.classList.add('show', 'active');
            targetPane.setAttribute('aria-hidden', 'false');
        }
    }

    private destroyTabListeners(): void {
        const tabButtons = this.view.tabList.querySelectorAll('.nav-link');
        tabButtons.forEach((tabButton) => {
            EventListenerHelper.removeEventListener(tabButton as HTMLElement, 'click', this.eventHandlers['tabClick']);
        });
    }

    public destroy(): void {
        // Remove all event listeners
        Object.entries(this.eventHandlers).forEach(([event, handler]) => {
            switch (event) {
                case 'closeSlideout':
                    EventListenerHelper.removeEventListener(this.view.closeSlideoutButton, 'click', handler);
                    break;
                case 'logout':
                    EventListenerHelper.removeEventListener(this.view.logoutButton, 'click', handler);
                    break;
                case 'toggleSlideout':
                    EventListenerHelper.removeEventListener(this.view.toggleButton, 'click', handler);
                    break;
                case 'overlayClick':
                    EventListenerHelper.removeEventListener(this.view.overlayElement, 'click', handler);
                    break;
                case 'themeToggle':
                    EventListenerHelper.removeEventListener(this.view.themeToggleButton, 'click', handler);
                    break;
                case 'blockButtonsToggle':
                    EventListenerHelper.removeEventListener(this.view.blockButtonsToggle, 'change', handler);
                    break;
                case 'preventScrollWheel':
                    EventListenerHelper.removeEventListener(this.view.slideoutElement, 'wheel', handler);
                    break;
                case 'preventScrollTouchMove':
                    EventListenerHelper.removeEventListener(this.view.slideoutElement, 'touchmove', handler);
                    break;
                case 'keyDown':
                    EventListenerHelper.removeEventListener(document, 'keydown', handler);
                    break;
                case 'tabClick':
                    this.destroyTabListeners();
                    break;
                case 'blockPostStyleChange':
                    if (this.blockPostStyleSelect) {
                        this.blockPostStyleSelect.removeEventListener('change', handler);
                    }
                    break;
                default:
                    // ...
                    break;
            }
        });

        // Clear eventHandlers
        this.eventHandlers = {};

        // Release focus
        this.focusManager.destroy();

        // Destroy swipe handler
        if (this.swipeHandler) {
            this.swipeHandler.destroy();
            this.swipeHandler = null;
        }

        // Destroy the view
        this.view.destroy();
        // Destroy LoginHandler and UserInfoManager
        this.loginHandler.destroy();
        this.userInfoManager.destroy();
    }
}
