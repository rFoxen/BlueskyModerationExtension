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

    public displayUserInfo(username: string): void {
        if (username) {
            this.loggedInUsernameElement.textContent = username;
            this.userInfoSectionElement.classList.remove('d-none');
            this.loginFormElement.classList.add('d-none');
        }
    }

    public hideUserInfo(): void {
        this.loggedInUsernameElement.textContent = '';
        this.userInfoSectionElement.classList.add('d-none');
        this.loginFormElement.classList.remove('d-none');
    }

    public updateUsername(username: string): void {
        this.loggedInUsernameElement.textContent = username;
    }

    public clearUserInfo(): void {
        this.loggedInUsernameElement.textContent = '';
    }

    public destroy(): void {
        this.removeAllListeners();
    }
}
