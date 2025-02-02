import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { UserReporter } from '@src/components/reporting/UserReporter';
import { PostTypeDeterminer } from '@src/utils/helpers/PostTypeDeterminer';
import { ActionButtonManager } from './ActionButtonManager';
import { AccountFreshnessManager } from './AccountFreshnessManager';
// import { isElementHiddenByCss } from '@src/utils/helpers/isElementHidden';
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
    private reportButtonsVisible: boolean = true;
    private freshnessVisible: boolean = true;
    private blockedPostStyle: string = 'darkened'; // default

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

    private updateAllBlockedPosts(): void {
        const blockedWrappers = document.querySelectorAll<HTMLElement>(
            this.getBlockedWrapperSelector()
        );
        blockedWrappers.forEach((wrapper) => {
            this.resetBlockedClasses(wrapper);
        });
        this.applyBlockedStyle(Array.from(blockedWrappers));
    }

    private getBlockedWrapperSelector(): string {
        const blockedClasses = [
            'blocked-post',
            'blocked-post--none',
            'blocked-post--darkened',
            'blocked-post--hidden',
            'blocked-post--compact',
            'blocked-post--blurred',
        ];
        return blockedClasses
            .map((cls) => `.wrapper-injected.${cls}, .wrapper-content-post.${cls}`)
            .join(', ');
    }

    private resetBlockedClasses(wrapper: HTMLElement): void {
        wrapper.classList.remove(
            'blocked-post',
            'blocked-post--none',
            'blocked-post--darkened',
            'blocked-post--hidden',
            'blocked-post--compact',
            'blocked-post--blurred'
        );
    }

    private applyBlockedStyle(elements: HTMLElement[]): void {
        elements.forEach((wrapper) => {
            switch (this.blockedPostStyle) {
                case 'none':
                    wrapper.classList.add('blocked-post--none');
                    break;
                    
                case 'darkened':
                    wrapper.classList.add('blocked-post--darkened');
                    break;
                    
                case 'hidden':
                    wrapper.classList.add('blocked-post--hidden');
                    break;
                    
                case 'blurred':
                    if(wrapper.classList.contains('wrapper-content-post')){
                        wrapper.classList.add('blocked-post--blurred');
                    } else{
                        wrapper.classList.add('blocked-post--none');
                    }
                    break;
                    
                case 'compact':
                    if(wrapper.classList.contains('wrapper-content-post')) {
                        wrapper.classList.add('blocked-post--compact');
                    } else{
                        wrapper.classList.add('blocked-post--none');
                    }
                    break;
            }
        });
    }

    /**
     * Main method to process multiple posts at once.
     */
    public processPosts(posts: HTMLElement[]): void {
        posts.forEach((post) => this.processElement(post));
    }

    /**
     * Processes a single post element.
     */
    public async processElement(element: HTMLElement): Promise<void> {
        // Instead of checking a Set, we check for a 'data-processed' attribute.
        if (!element.isConnected) {
            return;
        }
        
        if (this.isElementProcessed(element)) return;

        // if (!this.isElementEligibleForProcessing(element)) {
        //     this.markAsProcessed(element);
        //     return;
        // }

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
            Logger.debug(
                `Ancestor wrapper already exists for user: ${profileHandle}. Skipping.`
            );
            this.markAsProcessed(element);
            return;
        }

        if (this.isElementAlreadyWrappedOrHasToggle(element)) {
            Logger.debug(
                `Element is already wrapped or has a toggle-block-button. Marking as processed.`
            );
            this.markAsProcessed(element);
            return;
        }

        // Instead of wrapping, simply inject our custom UI
        await this.injectCustomUI(element, profileHandle, postType);
    }

    private async injectCustomUI(
        postElement: HTMLElement,
        profileHandle: string,
        postType: string
    ): Promise<void> {
        // Check if any parent element is already processed for the same profileHandle
        let currentParent = postElement.parentElement;
        while (currentParent) {
            if (currentParent.getAttribute('data-profile-handle') === profileHandle) {
                // A parent has already been processed for this profile; skip injection.
                return;
            }
            currentParent = currentParent.parentElement;
        }
        
        // Prevent double injection
        this.markAsProcessed(postElement);
        if (postElement.querySelector('.buttons-freshness-container')) {
            return;
        }

        // Create your container (you can reuse your existing method for creating elements)

        postElement.setAttribute('data-profile-handle', profileHandle);
        const container = document.createElement('div');
        container.classList.add('wrapper-injected');
        container.setAttribute('data-profile-handle', profileHandle);
        container.setAttribute('data-post-type', postType);
        await this.addButtonsAndFreshness(container, profileHandle);

        const savedOption = StorageHelper.getString(STORAGE_KEYS.PREPEND_APPEND_OPTION, 'prepend');
        
        // Determine where to insert: try to target a stable sub-element,
        // or if none is available, inject at the beginning of the post.
        // Adjust the selector below to match a suitable anchor point in the post.
        const anchor = postElement.querySelector('.css-175oi2r') as HTMLElement;
        const interiorAnchor = postElement.querySelectorAll('[style*="background-color:"]')[-1] as HTMLElement;
        if (interiorAnchor){
            if (savedOption === 'prepend') {
                interiorAnchor.insertAdjacentElement('beforebegin', container);
            } else if (savedOption === 'append' && interiorAnchor.parentElement && interiorAnchor.parentElement.lastElementChild) {
                interiorAnchor.parentElement.lastElementChild.insertAdjacentElement('afterend', container);
            }
            interiorAnchor.classList.add('wrapper-content-post');
            interiorAnchor.setAttribute('data-profile-handle', profileHandle);
            interiorAnchor.setAttribute('data-post-type', postType);
            await this.applyBlockedStyleIfNecessary([container, interiorAnchor], profileHandle);
        } else if (anchor) {
            if (savedOption === 'prepend') {
                anchor.insertAdjacentElement('beforebegin', container);
            } else if (savedOption === 'append' && anchor.parentElement && anchor.parentElement.lastElementChild) {
                anchor.parentElement.lastElementChild.insertAdjacentElement('afterend', container);
            }
            anchor.classList.add('wrapper-content-post');
            anchor.setAttribute('data-profile-handle', profileHandle);
            anchor.setAttribute('data-post-type', postType);
            await this.applyBlockedStyleIfNecessary([container, anchor], profileHandle);
        } else if (postElement.parentElement) {
            if (savedOption === 'prepend') {
                postElement.insertAdjacentElement('beforebegin', container);
            } else if (savedOption === 'append' && postElement.parentElement && postElement.parentElement.lastElementChild) {
                postElement.parentElement.lastElementChild.insertAdjacentElement('afterend', container);
            }
            postElement.classList.add('wrapper-content-post');
            postElement.setAttribute('data-profile-handle', profileHandle);
            postElement.setAttribute('data-post-type', postType);
            await this.applyBlockedStyleIfNecessary([container, postElement], profileHandle);
        }
    }
    
    /**
     * Checking data attribute instead of a processedPosts Set.
     */
    private isElementProcessed(element: HTMLElement): boolean {
        return element.hasAttribute('data-processed');
    }

    // private isElementEligibleForProcessing(element: HTMLElement): boolean {
    //     return !isElementHiddenByCss(element);
    // }

    /**
     * Mark the element with a data attribute to signal it's processed.
     */
    private markAsProcessed(element: HTMLElement): void {
        element.setAttribute('data-processed', 'true');
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
        const ancestorWrapper = element.closest('.wrapper-injected') as HTMLElement | null;
        if (ancestorWrapper) {
            const ancestorHandle = ancestorWrapper.getAttribute('data-profile-handle');
            return ancestorHandle === profileHandle;
        }
        return false;
    }

    private isElementAlreadyWrappedOrHasToggle(element: HTMLElement): boolean {
        return (
            element.querySelector('.toggle-block-button') !== null ||
            element.closest('.wrapper-injected') !== null
        );
    }

    private async wrapAndCleanElement(
        element: HTMLElement,
        profileHandle: string,
        postType: string
    ): Promise<void> {
        const wrapper = await this.ensureWrapper(element, profileHandle, postType);
        if (wrapper) {
            // Mark the original element as processed so we don’t try again later.
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
            await this.applyBlockedStyleIfNecessary([wrapper], profileHandle);
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
        wrapper.classList.add('wrapper-injected');
        wrapper.setAttribute('data-profile-handle', profileHandle);
        wrapper.setAttribute('data-post-type', postType);
        return wrapper;
    }

    private async applyBlockedStyleIfNecessary(
        htmlElements: HTMLElement[],
        profileHandle: string
    ): Promise<void> {
        const activeListUris = this.getActiveBlockLists();
        const isUserGlobalBlocked = await this.blockedUsersService.isUserBlocked(
            profileHandle,
            activeListUris
        );
        if (isUserGlobalBlocked) {
            this.applyBlockedStyle(htmlElements);
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
        const buttonContainer = this.actionButtonManager.createButtons(
            profileHandle,
            isUserBlocked
        );
        buttonsAndFreshnessContainer.appendChild(buttonContainer);

        // Determine placement based on user preference
        this.placeButtonsAndFreshness(wrapper, buttonsAndFreshnessContainer);

        // Fetch and display account freshness
        this.accountFreshnessManager.displayAccountFreshness(freshnessElement, profileHandle);

        // Handle visibility of block buttons
        this.handleElementVisibility(wrapper);
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

    private placeButtonsAndFreshness(
        wrapper: HTMLElement,
        container: HTMLElement
    ): void {
        const savedOption = StorageHelper.getString(STORAGE_KEYS.PREPEND_APPEND_OPTION, 'prepend');
        if (savedOption === 'prepend') {
            wrapper.prepend(container);
        } else if (savedOption === 'append') {
            wrapper.append(container);
        }
    }

    private handleElementVisibility(wrapper: HTMLElement): void {
        if (!this.blockButtonsVisible) {
            const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLElement;
            if (blockButton) {
                blockButton.style.display = 'none';
            }
        }
        if (!this.reportButtonsVisible) {
            const reportButton = wrapper.querySelector('.report-user-button') as HTMLElement;
            if (reportButton) {
                reportButton.style.display = 'none';
            }
        }
        if (!this.freshnessVisible) {
            const accountFreshness = wrapper.querySelector('.account-freshness') as HTMLElement;
            if (accountFreshness) {
                accountFreshness.style.display = 'none';
            }
        }
    }

    private removeInnerDuplicateWrappers(wrapper: HTMLElement, profileHandle: string): void {
        const nestedWrappers = wrapper.querySelectorAll('.wrapper-injected');
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
            Logger.debug(
                `Inner duplicate wrapper removed and content repositioned for user: ${profileHandle}`
            );
        } else {
            Logger.warn(
                `Parent of nested wrapper not found for user: ${profileHandle}. Unable to reposition content.`
            );
        }
    }

    private getProfileHandleFromLink(profileLink: HTMLAnchorElement): string | null {
        const href = profileLink.getAttribute('href');
        if (!href) return null;
        const match = href.match(/\/profile\/([^/?#]+)/);
        return match ? match[1] : null;
    }

    public updatePostsByUser(profileHandle: string, isBlocked: boolean): void {
        const wrappers = this.getWrappersByProfileHandle(profileHandle);
        wrappers.forEach((wrapper) => {
            if (isBlocked) {
                this.applyBlockedStyle([wrapper]);
                wrapper.classList.remove('unblocked-post');
            } else {
                this.removeBlockedStyles(wrapper);
                wrapper.classList.add('unblocked-post');
            }
            this.updateBlockButton(wrapper, isBlocked);
        });
    }

    private getWrappersByProfileHandle(
        profileHandle: string
    ): NodeListOf<HTMLElement> {
        return document.querySelectorAll<HTMLElement>(
            `.wrapper-injected[data-profile-handle="${profileHandle}"], 
                      .wrapper-content-post[data-profile-handle="${profileHandle}"]`
        );
    }

    private removeBlockedStyles(wrapper: HTMLElement): void {
        wrapper.classList.remove(
            'blocked-post',
            'blocked-post--none',
            'blocked-post--darkened',
            'blocked-post--hidden',
            'blocked-post--compact',
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

    public setBlockButtonsVisibility(visible: boolean): void {
        this.blockButtonsVisible = visible;
        this.actionButtonManager.setBlockButtonsVisibility(visible, this.isAllHidden());
    }

    public setReportButtonsVisibility(visible: boolean): void {
        this.reportButtonsVisible = visible;
        this.actionButtonManager.setReportButtonsVisibility(visible, this.isAllHidden());
    }

    public setFreshnessVisibility(visible: boolean): void {
        this.freshnessVisible = visible;
        this.actionButtonManager.setFreshnessVisibility(visible, this.isAllHidden());
    }
    
    public isAllHidden(): boolean {
        return !this.blockButtonsVisible && !this.reportButtonsVisible && !this.freshnessVisible;
    }

    public async refreshAllProcessedPosts(): Promise<void> {
        // Because we no longer store processed posts in a Set,
        // we can iterate over all wrapped elements in the DOM instead.
        const allWrappers = Array.from(document.querySelectorAll<HTMLElement>('.wrapper-injected, .wrapper-content-post'));

        for (const wrapper of allWrappers) {
            const profileHandle = wrapper.getAttribute('data-profile-handle');
            if (!profileHandle) continue;

            const isUserBlocked = await this.isUserBlocked(profileHandle);
            this.updateWrapperStyleAndButton(wrapper, isUserBlocked);
        }
    }

    private updateWrapperStyleAndButton(wrapper: HTMLElement, isBlocked: boolean): void {
        if (isBlocked) {
            this.applyBlockedStyle([wrapper]);
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
        // No need to clear a Set of processed posts—data attributes remain on elements,
        // and the DOM is presumably torn down when the extension is disabled/unloaded.
    }
}
