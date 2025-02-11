import template from '@public/templates/button.hbs';
import Logger from '@src/utils/logger/Logger';

type ButtonType = 'button' | 'submit' | 'reset';

interface ButtonOptions {
    id?: string;
    classNames?: string;
    text: string;
    type?: ButtonType;
    ariaLabel?: string;
}

export class Button {
    public element: HTMLButtonElement;
    private eventHandlers: { [key: string]: EventListener } = {};

    constructor(options: ButtonOptions) {
        const { id, classNames, text, type = 'button', ariaLabel } = options;
        let buttonHTML: string;

        try {
            buttonHTML = template({ id, classNames, text, type, ariaLabel });
        } catch (error) {
            Logger.error('Error rendering button template:', error);
            // Fallback to a simple button if template rendering fails
            buttonHTML = `<button id="${id}" class="${classNames}" type="${type}" aria-label="${ariaLabel || ''}">${text}</button>`;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = buttonHTML.trim();
        this.element = tempDiv.firstChild as HTMLButtonElement;
    }

    public appendTo(parent: HTMLElement): void {
        parent.appendChild(this.element);
    }

    public setText(text: string): void {
        this.element.textContent = text;
    }

    public getText(): string | null {
        return this.element.textContent;
    }

    public setDisabled(disabled: boolean): void {
        this.element.disabled = disabled;
    }

    public addClasses(classes: string | string[]): void {
        if (typeof classes === 'string') {
            classes = classes.trim().split(/\s+/);
        }
        if (Array.isArray(classes)) {
            this.element.classList.add(...classes);
        }
    }

    public removeClasses(classes: string | string[]): void {
        if (typeof classes === 'string') {
            classes = classes.trim().split(/\s+/);
        }
        if (Array.isArray(classes)) {
            this.element.classList.remove(...classes);
        }
    }

    public addEventListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void {
        this.element.addEventListener(type, listener, options);
        // Store reference for potential removal
        if (!this.eventHandlers[type]) {
            this.eventHandlers[type] = listener;
        }
    }

    public removeEventListener(type: string, listener: EventListener, options?: boolean | EventListenerOptions): void {
        this.element.removeEventListener(type, listener, options);
        // Remove from stored handlers if matches
        if (this.eventHandlers[type] === listener) {
            delete this.eventHandlers[type];
        }
    }

    // New method to remove all event listeners
    public removeAllEventListeners(): void {
        for (const type in this.eventHandlers) {
            if (this.eventHandlers.hasOwnProperty(type)) {
                this.element.removeEventListener(type, this.eventHandlers[type]);
            }
        }
        this.eventHandlers = {};
    }
}
