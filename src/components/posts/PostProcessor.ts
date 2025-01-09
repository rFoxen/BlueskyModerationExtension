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
        const blockedWrappers = document.querySelectorAll<HTMLElement>(this.getBlockedWrapperSelector());

        blockedWrappers.forEach((wrapper) => {
            this.resetBlockedClasses(wrapper);
            this.applyBlockedStyle(wrapper);
        });
    }
    private getBlockedWrapperSelector(): string {
        const blockedClasses = [
            'blocked-post',
            'blocked-post--darkened',
            'blocked-post--hidden',
            'blocked-post--blurred',
        ];
        return blockedClasses.map(cls => `.block-button-wrapper.${cls}`).join(', ');
    }
    private resetBlockedClasses(wrapper: HTMLElement): void {
        wrapper.classList.remove(
            'blocked-post',
            'blocked-post--darkened',
            'blocked-post--hidden',
            'blocked-post--blurred'
        );
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
        if (this.isElementProcessed(element)) return;

        if (!this.isElementEligibleForProcessing(element)) {
            this.markAsProcessed(element);
            return;
        }

        const postType = this.postTypeDeterminer.determinePostType(element);
        if (!postType) {
            this.markAsProcessed(element);
            return;
        }

        const profileHandle = this.extractProfileHandle(element, postType);
        if (!profileHandle) {
            this.markAsProcessed(element);
            return;
        }

        if (this.hasAncestorWithProfileHandle(element, profileHandle)) {
            Logger.debug(`Ancestor wrapper already exists for user: ${profileHandle}. Skipping wrapping for this element.`);
            this.markAsProcessed(element);
            return;
        }

        if (this.isElementAlreadyWrappedOrHasToggle(element)) {
            Logger.debug(`Element is already wrapped or has a toggle-block-button. Marking as processed.`);
            this.markAsProcessed(element);
            return;
        }

        await this.wrapAndCleanElement(element, profileHandle, postType);
    }

    private isElementProcessed(element: HTMLElement): boolean {
        return this.processedPosts.has(element);
    }
    private isElementEligibleForProcessing(element: HTMLElement): boolean {
        return !isElementHiddenByCss(element);
    }
    private markAsProcessed(element: HTMLElement): void {
        this.processedPosts.add(element);
    }
    private extractProfileHandle(element: HTMLElement, postType: string): string | null {
        if (['repost', 'quoted-repost'].includes(postType)) {
            const dataTestId = element.getAttribute('data-testid') || '';
            const match = dataTestId.match(/feedItem-by-([^\s]+)/);
            return match && match[1] ? match[1] : null;
        } else {
            const profileLink = element.querySelector('a[href^="/profile/"]') as HTMLAnchorElement | null;
            return profileLink ? this.getProfileHandleFromLink(profileLink) : null;
        }
    }
    private hasAncestorWithProfileHandle(element: HTMLElement, profileHandle: string): boolean {
        const ancestorWrapper = element.closest('.block-button-wrapper') as HTMLElement | null;
        if (ancestorWrapper) {
            const ancestorHandle = ancestorWrapper.getAttribute('data-profile-handle');
            return ancestorHandle === profileHandle;
        }
        return false;
    }
    private isElementAlreadyWrappedOrHasToggle(element: HTMLElement): boolean {
        return (
            element.querySelector('.toggle-block-button') !== null ||
            element.closest('.block-button-wrapper') !== null
        );
    }
    private async wrapAndCleanElement(element: HTMLElement, profileHandle: string, postType: string): Promise<void> {
        const wrapper = await this.ensureWrapper(element, profileHandle, postType);
        if (wrapper) {
            this.markAsProcessed(element);
            this.removeInnerDuplicateWrappers(wrapper, profileHandle);
        }
    }

    private async ensureWrapper(
        element: HTMLElement,
        profileHandle: string,
        postType: string
    ): Promise<HTMLElement | null> {
        const parent = element.parentNode;
        if (!parent) {
            Logger.warn('Element has no parent. Cannot wrap.');
            return null;
        }

        try {
            const wrapper = this.createWrapper(profileHandle, postType);
            await this.applyBlockedStyleIfNecessary(wrapper, profileHandle);

            this.insertWrapperIntoDOM(parent, wrapper, element);

            this.moveChildrenToWrapper(element, wrapper);

            await this.addButtonsAndFreshness(wrapper, profileHandle);

            Logger.debug(`Wrapped element for user: ${profileHandle}`);
            return wrapper;
        } catch (e) {
            Logger.error('Error wrapping element:', e);
            return null;
        }
    }
    private createWrapper(profileHandle: string, postType: string): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.classList.add('block-button-wrapper');
        wrapper.setAttribute('data-profile-handle', profileHandle);
        wrapper.setAttribute('data-post-type', postType);
        return wrapper;
    }
    private async applyBlockedStyleIfNecessary(wrapper: HTMLElement, profileHandle: string): Promise<void> {
        const activeListUris = this.getActiveBlockLists();
        const isUserGlobalBlocked = await this.blockedUsersService.isUserBlocked(profileHandle, activeListUris);
        if (isUserGlobalBlocked) {
            this.applyBlockedStyle(wrapper);
        }
    }
    private insertWrapperIntoDOM(parent: Node, wrapper: HTMLElement, element: HTMLElement): void {
        parent.insertBefore(wrapper, element);
    }
    private moveChildrenToWrapper(element: HTMLElement, wrapper: HTMLElement): void {
        while (element.firstChild) {
            wrapper.appendChild(element.firstChild);
        }
        element.remove();
    }
    private async addButtonsAndFreshness(wrapper: HTMLElement, profileHandle: string): Promise<void> {
        const buttonsAndFreshnessContainer = document.createElement('div');
        buttonsAndFreshnessContainer.classList.add('buttons-freshness-container');

        // Add account freshness
        const freshnessElement = this.createFreshnessElement();
        buttonsAndFreshnessContainer.appendChild(freshnessElement);

        // Add block/unblock & report buttons
        const isUserBlocked = await this.isUserBlocked(profileHandle);
        const buttonContainer = this.actionButtonManager.createButtons(profileHandle, isUserBlocked);
        buttonsAndFreshnessContainer.appendChild(buttonContainer);

        // Determine placement based on user preference
        this.placeButtonsAndFreshness(wrapper, buttonsAndFreshnessContainer);

        // Fetch and display account freshness
        this.accountFreshnessManager.displayAccountFreshness(freshnessElement, profileHandle);

        // Handle visibility of block buttons
        this.handleBlockButtonsVisibility(wrapper);
    }
    private createFreshnessElement(): HTMLElement {
        const freshnessElement = document.createElement('div');
        freshnessElement.className = 'account-freshness';
        freshnessElement.textContent = 'Loading...';
        return freshnessElement;
    }
    private async isUserBlocked(profileHandle: string): Promise<boolean> {
        const activeListUris = this.getActiveBlockLists();
        return await this.blockedUsersService.isUserBlocked(profileHandle, activeListUris);
    }
    private placeButtonsAndFreshness(wrapper: HTMLElement, container: HTMLElement): void {
        const savedOption = StorageHelper.getString(STORAGE_KEYS.PREPEND_APPEND_OPTION, 'prepend');
        if (savedOption === 'prepend') {
            wrapper.prepend(container);
        } else if (savedOption === 'append') {
            wrapper.append(container);
        }
    }
    private handleBlockButtonsVisibility(wrapper: HTMLElement): void {
        if (!this.blockButtonsVisible) {
            const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLElement;
            if (blockButton) {
                blockButton.style.display = 'none';
            }
        }
    }


    private removeInnerDuplicateWrappers(wrapper: HTMLElement, profileHandle: string): void {
        const nestedWrappers = wrapper.querySelectorAll('.block-button-wrapper');
        nestedWrappers.forEach((nestedWrapper) => {
            const nestedHandle = nestedWrapper.getAttribute('data-profile-handle');
            if (nestedHandle === profileHandle) {
                Logger.debug(`Removing inner duplicate wrapper for user: ${profileHandle}`);
                this.removeDuplicateWrapper(nestedWrapper as HTMLElement, profileHandle);
            }
        });
    }
    private removeDuplicateWrapper(nestedWrapper: HTMLElement, profileHandle: string): void {
        const parentOfNested = nestedWrapper.parentNode;
        if (parentOfNested) {
            // Insert each child before the nestedWrapper to maintain order
            while (nestedWrapper.firstChild) {
                parentOfNested.insertBefore(nestedWrapper.firstChild, nestedWrapper);
            }
            // Remove the now-empty nested wrapper
            nestedWrapper.remove();
            Logger.debug(`Inner duplicate wrapper removed and content repositioned for user: ${profileHandle}`);
        } else {
            Logger.warn(`Parent of nested wrapper not found for user: ${profileHandle}. Unable to reposition content.`);
        }
    }



    private async addActionButtons(wrapper: HTMLElement, profileHandle: string): Promise<void> {
        const isUserBlocked = await this.isUserBlocked(profileHandle);
        const buttonContainer = this.actionButtonManager.createButtons(profileHandle, isUserBlocked);
        wrapper.appendChild(buttonContainer);
    }


    private async addAccountFreshness(wrapper: HTMLElement, profileHandle: string): Promise<void> {
        const freshnessElement = this.createFreshnessElement();
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
        const wrappers = this.getWrappersByProfileHandle(profileHandle);

        wrappers.forEach((wrapper) => {
            if (isBlocked) {
                this.applyBlockedStyle(wrapper);
                wrapper.classList.remove('unblocked-post');
            } else {
                this.removeBlockedStyles(wrapper);
                wrapper.classList.add('unblocked-post');
            }

            this.updateBlockButton(wrapper, isBlocked);
        });
    }
    private getWrappersByProfileHandle(profileHandle: string): NodeListOf<HTMLElement> {
        return document.querySelectorAll<HTMLElement>(
            `.block-button-wrapper[data-profile-handle="${profileHandle}"]`
        );
    }
    private removeBlockedStyles(wrapper: HTMLElement): void {
        wrapper.classList.remove(
            'blocked-post',
            'blocked-post--darkened',
            'blocked-post--hidden',
            'blocked-post--blurred'
        );
    }
    private updateBlockButton(wrapper: HTMLElement, isBlocked: boolean): void {
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
            const wrapper = this.getWrapperForPost(post);
            if (!wrapper) continue;

            const profileHandle = wrapper.getAttribute('data-profile-handle');
            if (!profileHandle) continue;

            const isUserBlocked = await this.isUserBlocked(profileHandle);
            this.updateWrapperStyleAndButton(wrapper, isUserBlocked);
        }
    }
    private getWrapperForPost(post: HTMLElement): HTMLElement | null {
        return post.closest('.block-button-wrapper') as HTMLElement | null;
    }
    private updateWrapperStyleAndButton(wrapper: HTMLElement, isBlocked: boolean): void {
        if (isBlocked) {
            this.applyBlockedStyle(wrapper);
            wrapper.classList.remove('unblocked-post');
        } else {
            this.removeBlockedStyles(wrapper);
            wrapper.classList.add('unblocked-post');
        }

        this.updateBlockButton(wrapper, isBlocked);
    }


    public destroy(): void {
        this.actionButtonManager.destroy();
        this.accountFreshnessManager.destroy();
        this.clearProcessedPosts();
    }

    private clearProcessedPosts(): void {
        this.processedPosts.clear();
    }
}
