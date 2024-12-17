import { LABELS, ARIA_LABELS } from '@src/constants/Constants';
import { EventEmitter } from '@src/utils/events/EventEmitter';

export interface UserInfoManagerOptions {
    loggedInUsernameElement: HTMLElement;
    userInfoSectionElement: HTMLElement;
    loginFormElement: HTMLFormElement;
}

export class UserInfoManager extends EventEmitter {
    private loggedInUsernameElement: HTMLElement;
    private userInfoSectionElement: HTMLElement;
    private loginFormElement: HTMLFormElement;

    constructor(options: UserInfoManagerOptions) {
        super();
        this.loggedInUsernameElement = options.loggedInUsernameElement;
        this.userInfoSectionElement = options.userInfoSectionElement;
        this.loginFormElement = options.loginFormElement; 
    }

    /**
     * Displays the logged-in user's information.
     * @param username - The username to display.
     */
    public displayUserInfo(username: string): void {
        if (username) {
            this.loggedInUsernameElement.textContent = username;
            this.userInfoSectionElement.classList.remove('d-none');
            this.loginFormElement.classList.add('d-none');
        }
    }

    /**
     * Hides the user information and shows the login form.
     */
    public hideUserInfo(): void {
        this.loggedInUsernameElement.textContent = '';
        this.userInfoSectionElement.classList.add('d-none');
        this.loginFormElement.classList.remove('d-none');
    }

    /**
     * Updates the username displayed in the user info section.
     * @param username - The new username to display.
     */
    public updateUsername(username: string): void {
        this.loggedInUsernameElement.textContent = username;
    }

    /**
     * Clears the user info display.
     */
    public clearUserInfo(): void {
        this.loggedInUsernameElement.textContent = '';
    }

    /**
     * Destroys the UserInfoManager by removing all listeners.
     */
    public destroy(): void {
        this.removeAllListeners();
    }
}
