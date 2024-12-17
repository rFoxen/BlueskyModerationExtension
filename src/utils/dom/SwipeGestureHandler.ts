type SwipeCallback = () => void;

export class SwipeGestureHandler {
    private element: HTMLElement;
    private onSwipe: SwipeCallback;
    private touchStartX: number = 0;
    private touchStartY: number = 0;
    private touchCurrentX: number = 0;
    private touchCurrentY: number = 0; 
    private isDragging: boolean = false;
    private threshold: number;
    private maxTranslate: number;
    private eventHandlers: { [key: string]: EventListener } = {};

    constructor(
        element: HTMLElement,
        onSwipe: SwipeCallback,
        threshold: number = 100,
        maxTranslate: number = 100
    ) {
        this.element = element;
        this.onSwipe = onSwipe;
        this.threshold = threshold;
        this.maxTranslate = maxTranslate;
        this.initialize();
    }

    private initialize(): void {
        this.eventHandlers['touchStart'] = this.handleTouchStart.bind(this);
        this.eventHandlers['touchMove'] = this.handleTouchMove.bind(this);
        this.eventHandlers['touchEnd'] = this.handleTouchEnd.bind(this);

        this.element.addEventListener('touchstart', this.eventHandlers['touchStart'], { passive: true });
        this.element.addEventListener('touchmove', this.eventHandlers['touchMove'], { passive: false });
        this.element.addEventListener('touchend', this.eventHandlers['touchEnd']);
    }

    private handleTouchStart(e: Event): void {
        const touchEvent = e as TouchEvent;
        if (touchEvent.touches.length === 1) {
            this.touchStartX = touchEvent.touches[0].clientX;
            this.touchStartY = touchEvent.touches[0].clientY;
            this.isDragging = true;
            this.element.style.transition = 'none';
        }
    }

    private handleTouchMove(e: Event): void {
        const touchEvent = e as TouchEvent;
        if (!this.isDragging || touchEvent.touches.length !== 1) return;

        this.touchCurrentX = touchEvent.touches[0].clientX;
        this.touchCurrentY = touchEvent.touches[0].clientY;
        const deltaX = this.touchCurrentX - this.touchStartX;
        const deltaY = this.touchCurrentY - this.touchStartY;

        // Detect horizontal swipe only
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            e.preventDefault(); // Prevent scrolling
            if (deltaX > 0) {
                // Calculate translation percentage based on element's width
                const elementWidth = this.element.getBoundingClientRect().width;
                let translatePercent = (deltaX / elementWidth) * 100;
                translatePercent = Math.min(translatePercent, this.maxTranslate);
                this.element.style.transform = `translateX(${translatePercent}%)`;
                // Optionally, adjust overlay opacity if applicable
                // This requires reference to the overlay element, which is not handled here
            }
        }
    }

    private handleTouchEnd(): void {
        if (!this.isDragging) return;
        this.isDragging = false;
        const deltaX = this.touchCurrentX - this.touchStartX;
        const elementWidth = this.element.getBoundingClientRect().width;
        const translatePercent = (deltaX / elementWidth) * 100;

        this.element.style.transition = `transform 0.3s ease-in-out, opacity 0.3s ease-in-out`;

        if (translatePercent > (this.threshold / elementWidth) * 100) {
            // Swipe exceeds threshold, trigger callback
            this.element.style.transform = `translateX(100%)`;
            this.onSwipe();
        } else {
            // Swipe does not meet threshold, reset position
            this.element.style.transform = 'translateX(0)';
        }

        // Reset touch positions
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchCurrentX = 0;
        this.touchCurrentY = 0;
    }

    public destroy(): void {
        this.element.removeEventListener('touchstart', this.eventHandlers['touchStart']);
        this.element.removeEventListener('touchmove', this.eventHandlers['touchMove']);
        this.element.removeEventListener('touchend', this.eventHandlers['touchEnd']);
        this.eventHandlers = {};
    }
}
