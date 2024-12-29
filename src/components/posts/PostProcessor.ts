import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { UserReporter } from '@src/components/reporting/UserReporter';
import { PostTypeDeterminer } from '@src/utils/helpers/PostTypeDeterminer';
import { ActionButtonManager } from './ActionButtonManager';
import { AccountFreshnessManager } from './AccountFreshnessManager';

/**
 * PostProcessor handles the logic of scanning posts, adding block/unblock actions,
 * and applying styling for blocked posts.
 */
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

    // NEW: track the chosen style for blocked posts
    private blockedPostStyle: string = 'darkened'; // default

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
        this.accountFreshnessManager = new AccountFreshnessManager(
            this.blueskyService,
            this.notificationManager
        );
    }

    /**
     * Called when user changes blocked post style in the Slideout.
     */
    public setBlockedPostStyle(style: string): void {
        this.blockedPostStyle = style;
        this.updateAllBlockedPosts();
    }

    /**
     * Loops over all "blocked" posts in the DOM to re-apply styling.
     */
    private updateAllBlockedPosts(): void {
        // Any element that has a blocked style
        const blockedWrappers = document.querySelectorAll(
            '.block-button-wrapper.blocked-post, \
             .block-button-wrapper.blocked-post--darkened, \
             .block-button-wrapper.blocked-post--hidden, \
             .block-button-wrapper.blocked-post--blurred'
        );
        blockedWrappers.forEach((wrapper) => {
            wrapper.classList.remove(
                'blocked-post',
                'blocked-post--darkened',
                'blocked-post--hidden',
                'blocked-post--blurred'
            );
            this.applyBlockedStyle(wrapper as HTMLElement);
        });
    }

    /**
     * Applies the correct class based on this.blockedPostStyle.
     */
    private applyBlockedStyle(wrapper: HTMLElement): void {
        switch (this.blockedPostStyle) {
            case 'hidden':
                wrapper.classList.add('blocked-post--hidden');
                break;
            case 'blurred':
                wrapper.classList.add('blocked-post--blurred');
                break;
            default:
                // darkened
                wrapper.classList.add('blocked-post--darkened');
                break;
        }
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
            this.processedElements.add(element);
            return;
        }

        if (element.querySelector('.toggle-block-button') || element.closest('.block-button-wrapper')) {
            return; // Already processed
        }

        const wrapper = this.ensureWrapper(element, profileHandle, postType);
        if (wrapper) {
            this.processedElements.add(element);
        }
    }

    private ensureWrapper(element: HTMLElement, profileHandle: string, postType: string): HTMLElement | null {
        const existingWrapper = element.closest('.block-button-wrapper') as HTMLElement | null;
        if (existingWrapper) {
            // already wrapped
            if (!existingWrapper.querySelector('.toggle-block-button')) {
                this.addActionButtons(existingWrapper, profileHandle);
            }
            if (!existingWrapper.querySelector('.account-freshness')) {
                this.addAccountFreshness(existingWrapper, profileHandle);
            }
            return existingWrapper;
        }

        const parent = element.parentNode;
        if (!parent) return null;

        try {
            // Create a new wrapper
            const wrapper = document.createElement('div');
            wrapper.classList.add('block-button-wrapper');
            wrapper.setAttribute('data-profile-handle', profileHandle);
            wrapper.setAttribute('data-post-type', postType);

            // If user is blocked, apply style
            const isUserBlocked = this.blockedUsersService.isUserBlocked(profileHandle);
            if (isUserBlocked) {
                this.applyBlockedStyle(wrapper);
            }

            parent.insertBefore(wrapper, element);

            while (element.firstChild) {
                wrapper.appendChild(element.firstChild);
            }

            element.remove();

            // Create container for buttons/freshness
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

            wrapper.appendChild(buttonsAndFreshnessContainer);

            // Update account freshness asynchronously
            this.accountFreshnessManager.displayAccountFreshness(freshnessElement, profileHandle);

            // If block buttons are currently hidden, hide them
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
        const wrappers = document.querySelectorAll<HTMLElement>(
            `.block-button-wrapper[data-profile-handle="${profileHandle}"]`
        );
        wrappers.forEach((wrapper) => {
            if (isBlocked) {
                // Apply the chosen style
                this.applyBlockedStyle(wrapper);
                wrapper.classList.add('blocked-post'); // optional legacy class
            } else {
                // Remove all possible styles
                wrapper.classList.remove(
                    'blocked-post',
                    'blocked-post--darkened',
                    'blocked-post--hidden',
                    'blocked-post--blurred'
                );
            }
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
    }
}
