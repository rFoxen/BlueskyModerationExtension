import { SlideoutView } from '@src/components/slideout/SlideoutView';
import { EventEmitter } from '@src/utils/events/EventEmitter';
import { FocusManager } from '@src/utils/dom/FocusManager';
import { SwipeGestureHandler } from '@src/utils/dom/SwipeGestureHandler';
import { LABELS, ARIA_LABELS, ERRORS, STORAGE_KEYS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/events/EventListenerHelper';
import { StateManager } from '@src/utils/state/StateManager';
import { LoginHandler } from '@src/components/authentication/LoginHandler';
import { UserInfoManager } from '@src/components/authentication/UserInfoManager'; // Added import

export class SlideoutManager extends EventEmitter {
    private view: SlideoutView;
    private focusManager: FocusManager;
    private swipeHandler: SwipeGestureHandler | null = null;
    private stateManager: StateManager;
    private loginHandler: LoginHandler;
    private userInfoManager: UserInfoManager; // Added property

    // Store references to event handlers for cleanup
    private eventHandlers: { [key: string]: EventListener } = {};
 
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
    }

    private addEventListeners(): void {
        // Define handlers with general Event type and cast inside
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

        // Add event listeners using the generic helper
        EventListenerHelper.addEventListener(this.view.closeSlideoutButton, 'click', closeSlideoutHandler);
        EventListenerHelper.addEventListener(this.view.logoutButton, 'click', logoutHandler);
        EventListenerHelper.addEventListener(this.view.toggleButton, 'click', toggleSlideoutHandler);
        EventListenerHelper.addEventListener(this.view.overlayElement, 'click', overlayClickHandler);
        EventListenerHelper.addEventListener(this.view.themeToggleButton, 'click', themeToggleHandler);
        EventListenerHelper.addEventListener(this.view.blockButtonsToggle, 'change', blockButtonsToggleHandler);

        // Prevent scroll propagation
        EventListenerHelper.addEventListener(this.view.slideoutElement, 'wheel', preventScrollWheel);
        EventListenerHelper.addEventListener(this.view.slideoutElement, 'touchmove', preventScrollTouchMove);

        // Add keydown listener for ESC key
        EventListenerHelper.addEventListener(document, 'keydown', keyDownHandler);

        // Initialize SwipeGestureHandler
        this.initializeSwipeGesture();
    }

    private initializeSwipeGesture(): void {
        if (this.swipeHandler) {
            this.swipeHandler.destroy();
        }
        this.swipeHandler = new SwipeGestureHandler(this.view.slideoutElement, () => {
            this.hideSlideout();
        }, 100, 100);
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

        // Initialize and activate focus trapping
        this.focusManager.initialize();
        this.focusManager.focusFirst();

        // Re-initialize swipe gesture in case it's needed
        this.initializeSwipeGesture();
    }

    public hideSlideout(): void {
        // Start hiding with smooth transition
        this.view.slideoutElement.style.transform = `translateX(100%)`;
        this.view.overlayElement.style.opacity = '0';

        // After transition ends, remove 'show' class and reset styles
        this.view.slideoutElement.addEventListener('transitionend', this.handleTransitionEnd.bind(this), { once: true });

        // Release focus trapping
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

    // Removed handleLoginFormSubmit as it's now handled by LoginHandler

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
        const savedState = this.stateManager.getBoolean(STORAGE_KEYS.SLIDEOUT_STATE, true);
        if (savedState) {
            this.showSlideout();
        } else {
            this.hideSlideoutInternal();
        }

        const blockButtonsVisible = this.stateManager.getBoolean(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE, true);
        this.view.blockButtonsToggle.checked = blockButtonsVisible;
        this.emit('blockButtonsToggle', blockButtonsVisible);
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

        // Reset transform and opacity
        this.view.slideoutElement.style.transform = 'translateX(100%)';
        this.view.overlayElement.style.opacity = '0';

        this.stateManager.setBoolean(STORAGE_KEYS.SLIDEOUT_STATE, false);
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
                    EventListenerHelper.removeEventListener(document, 'keydown', handler as EventListener);
                    break;
                default:
                    // Handle other events if any
                    break;
            }
        });

        // Clear eventHandlers object
        this.eventHandlers = {};

        // Release focus trapping if active
        this.focusManager.destroy();

        // Destroy swipe handler if exists
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
