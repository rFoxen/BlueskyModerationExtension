import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { UserReporter } from '@src/components/reporting/UserReporter';
import { PostTypeDeterminer } from '@src/utils/helpers/PostTypeDeterminer';
import { ActionButtonManager } from './ActionButtonManager';
import { AccountFreshnessManager } from './AccountFreshnessManager';
import { isElementHiddenByCss } from '@src/utils/helpers/isElementHidden';
import { STORAGE_KEYS } from '@src/constants/Constants';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';
import Logger from '@src/utils/logger/Logger';

export class PostProcessor {
    private notificationManager: NotificationManager;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private isLoggedIn: () => boolean;
    private getActiveBlockLists: () => string[];
    private onUserBlocked: (userHandle: string) => Promise<void>;
    private onUserUnblocked: (userHandle: string) => Promise<void>;
    private userReporter: UserReporter;
    private postTypeDeterminer: PostTypeDeterminer;
    private actionButtonManager: ActionButtonManager;
    private accountFreshnessManager: AccountFreshnessManager;

    private blockButtonsVisible: boolean = true;
    private blockedPostStyle: string = 'darkened'; // default

    /**
     * We track which posts we have processed so we don't re-wrap them.
     * But we still want to update styles or button text if the user’s block list changes.
     */
    private processedPosts: Set<HTMLElement> = new Set();

    constructor(
        notificationManager: NotificationManager,
        blueskyService: BlueskyService,
        blockedUsersService: BlockedUsersService,
        isLoggedIn: () => boolean,
        getActiveBlockLists: () => string[],
        onUserBlocked: (userHandle: string) => Promise<void>,
        onUserUnblocked: (userHandle: string) => Promise<void>,
        userReporter: UserReporter
    ) {
        this.notificationManager = notificationManager;
        this.blueskyService = blueskyService;
        this.blockedUsersService = blockedUsersService;
        this.isLoggedIn = isLoggedIn;
        this.getActiveBlockLists = getActiveBlockLists;
        this.onUserBlocked = onUserBlocked;
        this.onUserUnblocked = onUserUnblocked;
        this.userReporter = userReporter;

        this.postTypeDeterminer = new PostTypeDeterminer();
        this.actionButtonManager = new ActionButtonManager(
            this.notificationManager,
            this.blueskyService,
            this.blockedUsersService,
            this.isLoggedIn,
            this.getActiveBlockLists,
            this.onUserBlocked,
            this.onUserUnblocked,
            this.userReporter
        );
        this.accountFreshnessManager = new AccountFreshnessManager(
            this.blueskyService,
            this.notificationManager
        );
    }

    public setBlockedPostStyle(style: string): void {
        this.blockedPostStyle = style;
        this.updateAllBlockedPosts();
    }

    /**
     * Re-apply block style to all wrappers that currently show a blocked style
     */
    private updateAllBlockedPosts(): void {
        // find existing .block-button-wrapper elements that had a blocked style
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

    private applyBlockedStyle(wrapper: HTMLElement): void {
        switch (this.blockedPostStyle) {
            case 'hidden':
                wrapper.classList.add('blocked-post--hidden');
                break;
            case 'blurred':
                wrapper.classList.add('blocked-post--blurred');
                break;
            default:
                wrapper.classList.add('blocked-post--darkened');
                break;
        }
    }

    /**
     * Called when new posts are discovered (MutationObserver).
     */
    public processPosts(posts: HTMLElement[]): void {
        posts.forEach((post) => this.processElement(post));
    }

    /**
     * Wrap the post with block/unblock buttons, but only if not processed before.
     */
    public async processElement(element: HTMLElement): Promise<void> {
        if (this.processedPosts.has(element)) return;
        if (isElementHiddenByCss(element)) {
            return;
        }

        const postType = this.postTypeDeterminer.determinePostType(element);
        if (!postType) {
            this.processedPosts.add(element);
            return;
        }

        // Identify the user handle
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
            this.processedPosts.add(element);
            return;
        }

        // If it's already wrapped or has a .toggle-block-button, skip re-wrapping
        if (
            element.querySelector('.toggle-block-button') ||
            element.closest('.block-button-wrapper')
        ) {
            return;
        }

        // Actually wrap
        const wrapper = await this.ensureWrapper(element, profileHandle, postType);
        if (wrapper) {
            this.processedPosts.add(element);
        }
    }

    private async ensureWrapper(
        element: HTMLElement,
        profileHandle: string,
        postType: string
    ): Promise<HTMLElement | null> {
        const existingWrapper = element.closest('.block-button-wrapper') as HTMLElement | null;
        if (existingWrapper) {
            // Already wrapped once; just ensure button/freshness exist
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

            // If user is already blocked, apply style
            const activeListUris = this.getActiveBlockLists();
            const isUserBlocked = await this.blockedUsersService.isUserBlocked(profileHandle, [activeListUris[0]]);
            if (isUserBlocked) {
                this.applyBlockedStyle(wrapper);
            }

            // Insert the wrapper before `element`
            parent.insertBefore(wrapper, element);

            // Move children from `element` -> new wrapper
            while (element.firstChild) {
                wrapper.appendChild(element.firstChild);
            }
            element.remove();

            // Buttons + freshness container
            const buttonsAndFreshnessContainer = document.createElement('div');
            buttonsAndFreshnessContainer.classList.add('buttons-freshness-container');

            // Add account freshness
            const freshnessElement = document.createElement('div');
            freshnessElement.className = 'account-freshness';
            freshnessElement.textContent = 'Loading...';
            buttonsAndFreshnessContainer.appendChild(freshnessElement);

            // Add block/unblock & report
            const buttonContainer = this.actionButtonManager.createButtons(profileHandle, isUserBlocked);
            buttonsAndFreshnessContainer.appendChild(buttonContainer);

            const savedOption = StorageHelper.getString(STORAGE_KEYS.PREPEND_APPEND_OPTION, 'prepend');
            if (savedOption === 'prepend') {
                wrapper.prepend(buttonsAndFreshnessContainer);
            } else if (savedOption === 'append') {
                wrapper.append(buttonsAndFreshnessContainer);
            }

            // asynchronously fetch freshness data
            this.accountFreshnessManager.displayAccountFreshness(freshnessElement, profileHandle);

            // If block buttons are hidden, hide them
            if (!this.blockButtonsVisible) {
                const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLElement;
                if (blockButton) {
                    blockButton.style.display = 'none';
                }
            }
            return wrapper;
        } catch (e) {
            Logger.error('Error wrapping element:', e);
            return null;
        }
    }

    private async addActionButtons(wrapper: HTMLElement, profileHandle: string): Promise<void> {
        const activeListUris = this.getActiveBlockLists();
        const isUserBlocked = await this.blockedUsersService.isUserBlocked(profileHandle, [activeListUris[0]]);
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

    /**
     * Called when the user is blocked or unblocked, to update style & button text
     */
    public updatePostsByUser(profileHandle: string, isBlocked: boolean): void {
        const wrappers = document.querySelectorAll<HTMLElement>(
            `.block-button-wrapper[data-profile-handle="${profileHandle}"]`
        );

        wrappers.forEach((wrapper) => {
            if (isBlocked) {
                this.applyBlockedStyle(wrapper);
            } else {
                // Remove all possible styles
                wrapper.classList.remove(
                    'blocked-post',
                    'blocked-post--darkened',
                    'blocked-post--hidden',
                    'blocked-post--blurred'
                );
            }
            // Possibly highlight unblocked
            wrapper.classList.toggle('unblocked-post', !isBlocked);

            // Update block/unblock button text & style
            const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLElement | null;
            if (blockButton) {
                if (isBlocked) {
                    blockButton.textContent = 'Unblock';
                    blockButton.classList.remove('btn-outline-secondary');
                    blockButton.classList.add('btn-danger');
                } else {
                    blockButton.textContent = 'Block';
                    blockButton.classList.remove('btn-danger');
                    blockButton.classList.add('btn-outline-secondary');
                }
            }
        });
    }

    /**
     * Whether to show/hide the block/unblock buttons
     */
    public setBlockButtonsVisibility(visible: boolean): void {
        this.blockButtonsVisible = visible;
        this.actionButtonManager.setButtonsVisibility(visible);
    }

    /**
     * If the block list changes, we can re-check each post in `processedPosts`
     * to see if it's now blocked or unblocked, and update styles + button text accordingly.
     */
    public async refreshAllProcessedPosts(): Promise<void> {
        for (const post of this.processedPosts) {
            // Each "post" is the original element. The actual wrapper is:
            const wrapper = post.closest('.block-button-wrapper') as HTMLElement | null;
            if (!wrapper) continue;

            const profileHandle = wrapper.getAttribute('data-profile-handle');
            if (!profileHandle) continue;

            const activeListUris = this.getActiveBlockLists();
            const isUserBlocked = await this.blockedUsersService.isUserBlocked(profileHandle, activeListUris);

            // Re-apply or remove blocked style
            if (isUserBlocked) {
                this.applyBlockedStyle(wrapper);
                wrapper.classList.remove('unblocked-post');
            } else {
                wrapper.classList.remove(
                    'blocked-post',
                    'blocked-post--darkened',
                    'blocked-post--hidden',
                    'blocked-post--blurred'
                );
                wrapper.classList.add('unblocked-post');
            }

            // Also update block/unblock button text
            const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLElement | null;
            if (blockButton) {
                if (isUserBlocked) {
                    blockButton.textContent = 'Unblock';
                    blockButton.classList.remove('btn-outline-secondary');
                    blockButton.classList.add('btn-danger');
                } else {
                    blockButton.textContent = 'Block';
                    blockButton.classList.remove('btn-danger');
                    blockButton.classList.add('btn-outline-secondary');
                }
            }
        }
    }

    public destroy(): void {
        this.actionButtonManager.destroy();
        this.accountFreshnessManager.destroy();
        this.processedPosts.clear();
    }
}
