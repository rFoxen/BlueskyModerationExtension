import template from '@public/templates/loginSlideout.hbs';
import { EventEmitter } from '@src/utils/EventEmitter';
import { LABELS, ARIA_LABELS, ERRORS, STORAGE_KEYS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';
import { StorageHelper } from '@src/utils/StorageHelper';

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

    // Store references to event handlers for cleanup
    private eventHandlers: { [key: string]: EventListener } = {};

    constructor() {
        super();
        this.injectSlideout();
        this.addEventListeners();
        this.applySavedState();
    }

    private injectSlideout(): void {
        const slideoutHTML = template({ labels: LABELS, ariaLabels: ARIA_LABELS });
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
        // Define handlers with general Event type and cast inside
        const closeSlideoutHandler = () => this.hideSlideout();
        const loginFormSubmitHandler = (e: Event) => this.handleLoginFormSubmit(e);
        const logoutHandler = () => this.emit('logout');
        const toggleSlideoutHandler = () => this.showSlideout();
        const overlayClickHandler = () => this.hideSlideout();
        const themeToggleHandler = () => this.emit('themeToggle');
        const blockButtonsToggleHandler = () => {
            const isChecked = this.blockButtonsToggle.checked;
            StorageHelper.setBoolean(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE, isChecked);
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
        this.eventHandlers['loginFormSubmit'] = loginFormSubmitHandler;
        this.eventHandlers['logout'] = logoutHandler;
        this.eventHandlers['toggleSlideout'] = toggleSlideoutHandler;
        this.eventHandlers['overlayClick'] = overlayClickHandler;
        this.eventHandlers['themeToggle'] = themeToggleHandler;
        this.eventHandlers['blockButtonsToggle'] = blockButtonsToggleHandler;
        this.eventHandlers['preventScrollWheel'] = preventScrollWheel;
        this.eventHandlers['preventScrollTouchMove'] = preventScrollTouchMove;
        this.eventHandlers['keyDown'] = keyDownHandler;

        // Add event listeners using the generic helper
        EventListenerHelper.addEventListener(this.closeSlideoutButton, 'click', closeSlideoutHandler);
        EventListenerHelper.addEventListener(this.loginForm, 'submit', loginFormSubmitHandler);
        EventListenerHelper.addEventListener(this.logoutButton, 'click', logoutHandler);
        EventListenerHelper.addEventListener(this.toggleButton, 'click', toggleSlideoutHandler);
        EventListenerHelper.addEventListener(this.overlayElement, 'click', overlayClickHandler);
        EventListenerHelper.addEventListener(this.themeToggleButton, 'click', themeToggleHandler);
        EventListenerHelper.addEventListener(this.blockButtonsToggle, 'change', blockButtonsToggleHandler);

        // Prevent scroll propagation
        EventListenerHelper.addEventListener(this.slideoutElement, 'wheel', preventScrollWheel);
        EventListenerHelper.addEventListener(this.slideoutElement, 'touchmove', preventScrollTouchMove);

        // Add keydown listener for ESC key
        EventListenerHelper.addEventListener(document, 'keydown', keyDownHandler);

        // Add touch event listeners for swipe to close
        this.addSwipeToCloseListeners();
    }

    private addSwipeToCloseListeners(): void {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchCurrentX = 0;
        let touchCurrentY = 0;
        let isDragging = false;
        const threshold = 100; // Minimum swipe distance in px
        const maxTranslate = 100; // Maximum translate distance in %

        const onTouchStart = (e: Event) => {
            const touchEvent = e as TouchEvent;
            if (touchEvent.touches.length === 1) {
                touchStartX = touchEvent.touches[0].clientX;
                touchStartY = touchEvent.touches[0].clientY;
                isDragging = true;
                this.slideoutElement.style.transition = 'none';
            }
        };

        const onTouchMove = (e: Event) => {
            if (!isDragging) return;
            const touchEvent = e as TouchEvent;
            if (touchEvent.touches.length !== 1) return;

            touchCurrentX = touchEvent.touches[0].clientX;
            touchCurrentY = touchEvent.touches[0].clientY;

            const deltaX = touchCurrentX - touchStartX;

            // Detect horizontal swipe only
            if (Math.abs(deltaX) > Math.abs(touchCurrentY - touchStartY)) {
                e.preventDefault(); // Prevent scrolling
                if (deltaX > 0) {
                    // Calculate translation percentage based on slideout width
                    const slideoutWidth = this.slideoutElement.getBoundingClientRect().width;
                    let translatePercent = (deltaX / slideoutWidth) * 100;
                    translatePercent = Math.min(translatePercent, maxTranslate);
                    // Cap at maxTranslate%
                    this.slideoutElement.style.transform = `translateX(${translatePercent}%)`;
                    this.overlayElement.style.opacity = `${0.35 * (1 - translatePercent / maxTranslate)}`;
                }
            }
        };

        const onTouchEnd = (e: Event) => {
            if (!isDragging) return;
            isDragging = false;

            const deltaX = touchCurrentX - touchStartX;
            this.slideoutElement.style.transition = `transform 0.3s ease-in-out, opacity 0.3s ease-in-out`;
            this.overlayElement.style.transition = `opacity 0.3s ease-in-out`;

            const slideoutWidth = this.slideoutElement.getBoundingClientRect().width;
            const translatePercent = (deltaX / slideoutWidth) * 100;

            if (translatePercent > (threshold / slideoutWidth) * 100) {
                // If swipe exceeds threshold, smoothly translate out
                this.slideoutElement.style.transform = `translateX(100%)`;
                this.overlayElement.style.opacity = '0';
                // After transition ends, hide the slideout
                this.slideoutElement.addEventListener(
                    'transitionend',
                    this.handleTransitionEnd.bind(this),
                    { once: true }
                );
            } else {
                // Otherwise, reset to original position
                this.slideoutElement.style.transform = 'translateX(0)';
                this.overlayElement.style.opacity = '0.35';
            }

            // Reset touch positions
            touchStartX = 0;
            touchStartY = 0;
            touchCurrentX = 0;
            touchCurrentY = 0;
        };

        const handleTransitionEnd = () => {
            this.hideSlideoutInternal();
        };

        // Store handlers for cleanup
        this.eventHandlers['touchStart'] = onTouchStart;
        this.eventHandlers['touchMove'] = onTouchMove;
        this.eventHandlers['touchEnd'] = onTouchEnd;
        this.eventHandlers['handleTransitionEnd'] = handleTransitionEnd;

        // Add touch event listeners to slideout using the generic helper
        EventListenerHelper.addEventListener(this.slideoutElement, 'touchstart', onTouchStart, { passive: true });
        EventListenerHelper.addEventListener(this.slideoutElement, 'touchmove', onTouchMove, { passive: false });
        EventListenerHelper.addEventListener(this.slideoutElement, 'touchend', onTouchEnd);
    }

    private handleTransitionEnd(): void {
        this.hideSlideoutInternal();
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            this.hideSlideout();
        }
    }

    private async handleLoginFormSubmit(event: Event): Promise<void> {
        event.preventDefault();
        const usernameInput = this.loginForm.querySelector('#username') as HTMLInputElement;
        const passwordInput = this.loginForm.querySelector('#password') as HTMLInputElement;
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            this.displayFormFeedback(ERRORS.BOTH_FIELDS_REQUIRED, 'danger');
            this.markInputAsInvalid(usernameInput, passwordInput);
            return;
        }

        // Reset invalid states
        this.markInputAsValid(usernameInput, passwordInput);

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

    public displayFormFeedback(message: string, type: 'success' | 'danger'): void {
        let feedback = this.loginForm.querySelector('.form-feedback') as HTMLElement;
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
        document.body.classList.add('no-scroll');
        StorageHelper.setBoolean(STORAGE_KEYS.SLIDEOUT_STATE, true);
        // Reset transform and opacity in case they were altered during swipe
        this.slideoutElement.style.transform = 'translateX(0)';
        this.overlayElement.style.opacity = '0.35';
        // Focus Management: Trap focus within the slideout
        this.trapFocus();
    }

    public hideSlideout(): void {
        // Start hiding with smooth transition
        this.slideoutElement.style.transform = `translateX(100%)`;
        this.overlayElement.style.opacity = '0';
        // After transition ends, remove 'show' class and reset styles
        this.slideoutElement.addEventListener('transitionend', this.handleTransitionEnd.bind(this), { once: true });
        // Release focus trapping
        this.releaseFocus();
    }

    private hideSlideoutInternal(): void {
        this.slideoutElement.classList.remove('show');
        this.overlayElement.classList.remove('show');
        this.toggleButton.classList.remove('hidden');
        document.body.classList.remove('no-scroll');
        // Reset transform and opacity
        this.slideoutElement.style.transform = 'translateX(100%)';
        this.overlayElement.style.opacity = '0';
        StorageHelper.setBoolean(STORAGE_KEYS.SLIDEOUT_STATE, false);
    }

    private applySavedState(): void {
        const savedState = StorageHelper.getBoolean(STORAGE_KEYS.SLIDEOUT_STATE, true);
        if (savedState) {
            this.showSlideout();
        } else {
            this.hideSlideoutInternal();
        }

        const blockButtonsVisible = StorageHelper.getBoolean(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE, true);
        this.blockButtonsToggle.checked = blockButtonsVisible;
        this.emit('blockButtonsToggle', blockButtonsVisible);
    }

    public getBlockButtonsToggleState(): boolean {
        return StorageHelper.getBoolean(STORAGE_KEYS.BLOCK_BUTTONS_TOGGLE_STATE, true);
    }

    // Focus Management Methods
    private trapFocus(): void {
        const focusableElements = this.slideoutElement.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        const handleTab = (e: Event) => {
            const keyboardEvent = e as KeyboardEvent;
            if (keyboardEvent.key !== 'Tab') return;

            if (keyboardEvent.shiftKey) {
                // Shift + Tab
                if (document.activeElement === firstFocusable) {
                    keyboardEvent.preventDefault();
                    lastFocusable.focus();
                }
            } else {
                // Tab
                if (document.activeElement === lastFocusable) {
                    keyboardEvent.preventDefault();
                    firstFocusable.focus();
                }
            }
        };

        this.slideoutElement.addEventListener('keydown', handleTab);
        this.eventHandlers['trapFocus'] = handleTab;
    }

    private releaseFocus(): void {
        const handleTab = this.eventHandlers['trapFocus'];
        if (handleTab) {
            this.slideoutElement.removeEventListener('keydown', handleTab);
            delete this.eventHandlers['trapFocus'];
        }
    }

    private markInputAsInvalid(...inputs: HTMLInputElement[]): void {
        inputs.forEach((input) => {
            input.setAttribute('aria-invalid', 'true');
            input.classList.add('is-invalid');
        });
    }

    private markInputAsValid(...inputs: HTMLInputElement[]): void {
        inputs.forEach((input) => {
            input.setAttribute('aria-invalid', 'false');
            input.classList.remove('is-invalid');
        });
    }

    public destroy(): void {
        // Remove all event listeners
        Object.entries(this.eventHandlers).forEach(([event, handler]) => {
            switch (event) {
                case 'closeSlideout':
                    EventListenerHelper.removeEventListener(this.closeSlideoutButton, 'click', handler);
                    break;
                case 'loginFormSubmit':
                    EventListenerHelper.removeEventListener(this.loginForm, 'submit', handler);
                    break;
                case 'logout':
                    EventListenerHelper.removeEventListener(this.logoutButton, 'click', handler);
                    break;
                case 'toggleSlideout':
                    EventListenerHelper.removeEventListener(this.toggleButton, 'click', handler);
                    break;
                case 'overlayClick':
                    EventListenerHelper.removeEventListener(this.overlayElement, 'click', handler);
                    break;
                case 'themeToggle':
                    EventListenerHelper.removeEventListener(this.themeToggleButton, 'click', handler);
                    break;
                case 'blockButtonsToggle':
                    EventListenerHelper.removeEventListener(this.blockButtonsToggle, 'change', handler);
                    break;
                case 'preventScrollWheel':
                    EventListenerHelper.removeEventListener(this.slideoutElement, 'wheel', handler);
                    break;
                case 'preventScrollTouchMove':
                    EventListenerHelper.removeEventListener(this.slideoutElement, 'touchmove', handler);
                    break;
                case 'keyDown':
                    EventListenerHelper.removeEventListener(document, 'keydown', handler as EventListener);
                    break;
                case 'trapFocus':
                    this.slideoutElement.removeEventListener('keydown', handler as EventListener);
                    break;
                case 'handleTransitionEnd':
                    this.slideoutElement.removeEventListener('transitionend', handler as EventListener);
                    break;
                default:
                    // Handle other events if any
                    break;
            }
        });

        // Clear eventHandlers object
        this.eventHandlers = {};

        // Release focus trapping if active
        this.releaseFocus();

        // Optionally: Remove the slideout and overlay from the DOM
        // document.body.removeChild(this.slideoutElement);
        // document.body.removeChild(this.overlayElement);
    }
}
