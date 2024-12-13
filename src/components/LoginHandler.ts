import { EventEmitter } from '@src/utils/EventEmitter';
import { ERRORS } from '@src/constants/Constants';

export interface LoginHandlerOptions {
    formElement: HTMLFormElement;
    onLogin: (username: string, password: string) => void;
    displayFeedback: (message: string, type: 'success' | 'danger') => void;
}

export class LoginHandler extends EventEmitter {
    private formElement: HTMLFormElement;
    private onLoginCallback: (username: string, password: string) => void;
    private displayFeedbackCallback: (message: string, type: 'success' | 'danger') => void;
    private eventHandler: EventListener;

    constructor(options: LoginHandlerOptions) {
        super();
        this.formElement = options.formElement;
        this.onLoginCallback = options.onLogin;
        this.displayFeedbackCallback = options.displayFeedback;
        this.eventHandler = this.handleFormSubmit.bind(this);
        this.addEventListeners();
    }

    private addEventListeners(): void {
        this.formElement.addEventListener('submit', this.eventHandler);
    }

    private async handleFormSubmit(event: Event): Promise<void> {
        event.preventDefault();
        const usernameInput = this.formElement.querySelector('#username') as HTMLInputElement;
        const passwordInput = this.formElement.querySelector('#password') as HTMLInputElement;
        const username = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!username || !password) {
            this.displayFeedbackCallback(ERRORS.BOTH_FIELDS_REQUIRED, 'danger');
            this.markInputAsInvalid(usernameInput, passwordInput);
            return;
        }

        // Reset invalid states
        this.markInputAsValid(usernameInput, passwordInput);
        // Emit login event
        this.onLoginCallback(username, password);
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
        this.formElement.removeEventListener('submit', this.eventHandler);
        this.removeAllListeners();
    }
}
