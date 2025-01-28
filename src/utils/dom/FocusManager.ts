export class FocusManager {
    private focusableElements: HTMLElement[] = [];
    private firstFocusable: HTMLElement | null = null;
    private lastFocusable: HTMLElement | null = null;
    private container: HTMLElement;
    private handleTab: (e: KeyboardEvent) => void;

    constructor(container: HTMLElement) {
        this.container = container;
        this.handleTab = this.trapTab.bind(this);
    }

    public initialize(): void {
        this.updateFocusableElements();
        this.container.addEventListener('keydown', this.handleTab);
    }

    public destroy(): void {
        this.container.removeEventListener('keydown', this.handleTab);
    }

    private updateFocusableElements(): void {
        const elements = this.container.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        this.focusableElements = Array.from(elements).filter(
            (el) => !el.hasAttribute('disabled') && !el.closest('[hidden]')
        );
        this.firstFocusable = this.focusableElements[0] || null;
        this.lastFocusable = this.focusableElements[this.focusableElements.length - 1] || null;
    }

    private trapTab(e: KeyboardEvent): void {
        if (e.key !== 'Tab') return;

        if (!this.firstFocusable || !this.lastFocusable) {
            e.preventDefault();
            return;
        }

        if (e.shiftKey) {
            // Shift + Tab
            if (document.activeElement === this.firstFocusable) {
                e.preventDefault();
                this.lastFocusable.focus();
            }
        } else {
            // Tab
            if (document.activeElement === this.lastFocusable) {
                e.preventDefault();
                this.firstFocusable.focus();
            }
        }
    }

    public update(): void {
        this.updateFocusableElements();
    }

    public focusFirst(): void {
        if (this.firstFocusable) {
            this.firstFocusable.focus();
        }
    }
}
