import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { UserReporter } from '@src/components/reporting/UserReporter';
import { PostTypeDeterminer } from '@src/utils/helpers/PostTypeDeterminer';
import { ActionButtonManager } from './ActionButtonManager';
import { AccountFreshnessManager } from './AccountFreshnessManager';

export class PostProcessor {
    private notificationManager: NotificationManager;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private isLoggedIn: () => boolean;
    private getSelectedBlockList: () => string | null;
    private onUserBlocked: (userHandle: string) => Promise<void>;
    private onUserUnblocked: (userHandle: string) => Promise<void>;
    private userReporter: UserReporter;
    private postTypeDeterminer: PostTypeDeterminer;
    private actionButtonManager: ActionButtonManager;
    private accountFreshnessManager: AccountFreshnessManager;
    private blockButtonsVisible: boolean = true;
    private processedElements: WeakSet<HTMLElement> = new WeakSet();

    constructor(
        notificationManager: NotificationManager,
        blueskyService: BlueskyService,
        blockedUsersService: BlockedUsersService,
        isLoggedIn: () => boolean,
        getSelectedBlockList: () => string | null,
        onUserBlocked: (userHandle: string) => Promise<void>,
        onUserUnblocked: (userHandle: string) => Promise<void>,
        userReporter: UserReporter
    ) {
        this.notificationManager = notificationManager;
        this.blueskyService = blueskyService;
        this.blockedUsersService = blockedUsersService;
        this.isLoggedIn = isLoggedIn;
        this.getSelectedBlockList = getSelectedBlockList;
        this.onUserBlocked = onUserBlocked;
        this.onUserUnblocked = onUserUnblocked;
        this.userReporter = userReporter;

        this.postTypeDeterminer = new PostTypeDeterminer();
        this.actionButtonManager = new ActionButtonManager(
            this.notificationManager,
            this.blueskyService,
            this.blockedUsersService,
            this.isLoggedIn,
            this.getSelectedBlockList,
            this.onUserBlocked,
            this.onUserUnblocked,
            this.userReporter
        );
        this.accountFreshnessManager = new AccountFreshnessManager(this.blueskyService, this.notificationManager);
    }

    public processPosts(posts: HTMLElement[]): void {
        posts.forEach((post) => this.processElement(post));
    }

    public processElement(element: HTMLElement): void {
        if (this.processedElements.has(element)) return;

        const postType = this.postTypeDeterminer.determinePostType(element);
        if (!postType) return;

        let profileHandle: string | null = null;

        if (['repost', 'quoted-repost'].includes(postType)) {
            const dataTestId = element.getAttribute('data-testid') || '';
            const match = dataTestId.match(/feedItem-by-([^\s]+)/);
            profileHandle = match && match[1] ? match[1] : null;
        } else {
            const profileLink = element.querySelector('a[href^="/profile/"]') as HTMLAnchorElement | null;
            profileHandle = profileLink ? this.getProfileHandleFromLink(profileLink) : null;
        }

        if (!profileHandle) {
            //this.addPostTypeLabel(element, postType);
            this.processedElements.add(element);
            return;
        }

        if (element.querySelector('.toggle-block-button') || element.closest('.block-button-wrapper')) {
            return;
        }

        const wrapper = this.ensureWrapper(element, profileHandle, postType);
        if (wrapper) {
            this.processedElements.add(element);
        }
    }

    private ensureWrapper(element: HTMLElement, profileHandle: string, postType: string): HTMLElement | null {
        const existingWrapper = element.closest('.block-button-wrapper') as HTMLElement | null;
        if (existingWrapper) {
            if (!existingWrapper.querySelector('.toggle-block-button')) {
                this.addActionButtons(existingWrapper, profileHandle);
            }
            if (!existingWrapper.querySelector('.account-freshness')) {
                this.addAccountFreshness(existingWrapper, profileHandle);
            }
            return existingWrapper;
        }

        if (!document.body.contains(element)) return null;

        try {
            const wrapper = document.createElement('div');
            wrapper.classList.add('block-button-wrapper');
            wrapper.setAttribute('data-profile-handle', profileHandle);
            wrapper.setAttribute('data-post-type', postType);

            const isUserBlocked = this.blockedUsersService.isUserBlocked(profileHandle);
            wrapper.classList.add(isUserBlocked ? 'blocked-post' : 'unblocked-post');

            // Move all child nodes of element into wrapper
            while (element.firstChild) {
                wrapper.appendChild(element.firstChild as Node);
            }
            element.appendChild(wrapper);

            // Create a container for buttons and account freshness
            const buttonsAndFreshnessContainer = document.createElement('div');
            buttonsAndFreshnessContainer.classList.add('buttons-freshness-container');

            // Add Account Freshness
            const freshnessElement = document.createElement('div');
            freshnessElement.className = 'account-freshness';
            freshnessElement.textContent = 'Loading...';
            buttonsAndFreshnessContainer.appendChild(freshnessElement);
            
            // Add Action Buttons
            const buttonContainer = this.actionButtonManager.createButtons(profileHandle, isUserBlocked);
            buttonsAndFreshnessContainer.appendChild(buttonContainer);
            
            // Append the container to the wrapper
            wrapper.appendChild(buttonsAndFreshnessContainer);

            // Display account freshness information
            this.accountFreshnessManager.displayAccountFreshness(freshnessElement, profileHandle);

            if (!this.blockButtonsVisible) {
                const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLElement;
                if (blockButton) {
                    blockButton.style.display = 'none';
                }
            }
            return wrapper;
        } catch (e) {
            console.error('Error wrapping element:', e);
            return null;
        }
    }

    private addPostTypeLabel(container: HTMLElement, postType: string): void {
        if (container.querySelector('.post-type-label')) return;

        const label = document.createElement('span');
        label.classList.add('post-type-label');
        let text = postType.replace('-', ' ');
        text = text.replace(/(^|\s)\S/g, (t) => t.toUpperCase());
        label.textContent = text;
        container.prepend(label);
    }

    private addActionButtons(wrapper: HTMLElement, profileHandle: string): void {
        const isUserBlocked = this.blockedUsersService.isUserBlocked(profileHandle);
        const buttonContainer = this.actionButtonManager.createButtons(profileHandle, isUserBlocked);
        wrapper.appendChild(buttonContainer);
    }

    private async addAccountFreshness(wrapper: HTMLElement, profileHandle: string): Promise<void> {
        const freshnessElement = document.createElement('div');
        freshnessElement.className = 'account-freshness';
        freshnessElement.textContent = 'Loading...';
        wrapper.appendChild(freshnessElement);

        await this.accountFreshnessManager.displayAccountFreshness(freshnessElement, profileHandle);
    }

    private getProfileHandleFromLink(profileLink: HTMLAnchorElement): string | null {
        const href = profileLink.getAttribute('href');
        if (!href) return null;
        const match = href.match(/\/profile\/([^/?#]+)/);
        return match ? match[1] : null;
    }

    public updatePostsByUser(profileHandle: string, isBlocked: boolean): void {
        const wrappers = document.querySelectorAll<HTMLElement>(`.block-button-wrapper[data-profile-handle="${profileHandle}"]`);
        wrappers.forEach((wrapper) => {
            this.actionButtonManager.updateButtonState(wrapper, isBlocked);
            wrapper.classList.toggle('blocked-post', isBlocked);
            wrapper.classList.toggle('unblocked-post', !isBlocked);
        });
    }

    public setBlockButtonsVisibility(visible: boolean): void {
        this.blockButtonsVisible = visible;
        this.actionButtonManager.setButtonsVisibility(visible);
    }

    public destroy(): void {
        this.actionButtonManager.destroy();
        this.accountFreshnessManager.destroy();
        // Additional cleanup if necessary
    }
}
