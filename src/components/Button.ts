import template from '@public/templates/button.hbs';

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

    constructor(options: ButtonOptions) {
        const { id, classNames, text, type = 'button', ariaLabel } = options;
        const buttonHTML = template({ id, classNames, text, type, ariaLabel });
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

    public addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        this.element.addEventListener(type, listener);
    }

    public removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        this.element.removeEventListener(type, listener);
    }
}
