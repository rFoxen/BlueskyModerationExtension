import { NotificationManager } from './NotificationManager';
import { Button } from './Button';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { LABELS, MESSAGES, ERRORS, ARIA_LABELS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';
import { MutationObserverManager } from '@src/utils/MutationObserverManager';
import { PostActionButtonsFactory } from './PostActionButtonsFactory';
import { PostTypeDeterminer } from '@src/utils/PostTypeDeterminer';
import { UserReporter } from './UserReporter';

type PostType =
    | 'post'
    | 'repost'
    | 'quoted-repost'
    | 'notification-reply'
    | 'notification-like'
    | 'reply'
    | 'block-list-item'
    | 'people-search-item';

export class PostScanner {
    private notificationManager: NotificationManager;
    private isLoggedIn: () => boolean;
    private getSelectedBlockList: () => string | null;
    private onUserBlocked: (userHandle: string) => Promise<void>;
    private onUserUnblocked: (userHandle: string) => Promise<void>;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private observer: MutationObserver | null = null;
    private blockButtonsVisible: boolean = true;
    private processedElements: WeakSet<HTMLElement> = new WeakSet();

    // Throttling fields
    private mutationManager: MutationObserverManager;
    private mutationQueue: MutationRecord[] = [];
    private mutationThrottleTimer: number | null = null;
    private readonly MUTATION_THROTTLE_DELAY = 300;

    // CSS selectors for allowed list containers
    private listContainerSelectors = [
        'div.css-175oi2r.r-1ljd8xs.r-13l2t4g.r-1jj8364.r-lchren.r-1ye8kvj.r-13qz1uu.r-sa2ff0',
        'div.css-175oi2r.r-q5xsgd.r-1jj8364.r-lchren.r-1ye8kvj.r-13qz1uu.r-sa2ff0',
        'div.css-175oi2r.r-1jj8364.r-lchren.r-1ye8kvj.r-13qz1uu.r-sa2ff0',
        'div.css-175oi2r.r-sa2ff0',
    ];

    // Unified post selector includes normal posts, profile links, and quoted posts
    private postSelectors = [
        'div[role="link"][tabindex="0"]',
        'a[href^="/profile/"]',
        'div[role="link"][tabindex="0"][aria-label^="Post by"]',
    ].join(', ');

    // Define eventHandlers as an object to store event handler functions
    private eventHandlers: { [key: string]: EventListener } = {};

    private buttonsFactory: PostActionButtonsFactory;
    private postTypeDeterminer: PostTypeDeterminer;
    
    private userReporter: UserReporter;

    constructor(
        notificationManager: NotificationManager,
        blueskyService: BlueskyService,
        blockedUsersService: BlockedUsersService,
        isLoggedIn: () => boolean,
        getSelectedBlockList: () => string | null,
        onUserBlocked: (userHandle: string) => Promise<void>,
        onUserUnblocked: (userHandle: string) => Promise<void>,
        getBlockButtonsToggleState: () => boolean
    ) {
        this.notificationManager = notificationManager;
        this.blueskyService = blueskyService;
        this.blockedUsersService = blockedUsersService;
        this.isLoggedIn = isLoggedIn;
        this.getSelectedBlockList = getSelectedBlockList;
        this.onUserBlocked = onUserBlocked;
        this.onUserUnblocked = onUserUnblocked;
        this.blockButtonsVisible = getBlockButtonsToggleState();

        this.buttonsFactory = new PostActionButtonsFactory(this.notificationManager, this.blockedUsersService); // Initialize factory

        this.postTypeDeterminer = new PostTypeDeterminer();
        
        this.mutationManager = new MutationObserverManager(
            this.handleMutations.bind(this),
            { childList: true, subtree: true }
        );
        
        this.userReporter = new UserReporter(
            this.notificationManager,
            this.blockedUsersService,
            this.isLoggedIn
        );
        
        this.subscribeToBlockedUsersServiceEvents();
        this.start();
    }

    private subscribeToBlockedUsersServiceEvents(): void {
        this.blockedUsersService.on('blockedUserAdded', (newItem: any) => {
            const userHandle = newItem.subject.handle || newItem.subject.did;
            this.updatePostsByUser(userHandle, true);
        });
        this.blockedUsersService.on('blockedUserRemoved', (userHandle: string) => {
            this.updatePostsByUser(userHandle, false);
        });
    }

    public start(): void {
        this.mutationManager.start(document.body);
        this.scanForPosts();
    }

    private handleMutations(mutations: MutationRecord[]): void {
        this.mutationQueue.push(...mutations);
        this.scheduleMutationProcessing();
    }

    private scheduleMutationProcessing(): void {
        if (this.mutationThrottleTimer !== null) {
            clearTimeout(this.mutationThrottleTimer);
        }
        this.mutationThrottleTimer = window.setTimeout(() => {
            this.processQueuedMutations();
        }, this.MUTATION_THROTTLE_DELAY);
    }

    private processQueuedMutations(): void {
        this.mutationThrottleTimer = null;
        const mutationsToProcess = this.mutationQueue.splice(0, this.mutationQueue.length);
        for (const mutation of mutationsToProcess) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        // Direct check if node is within a list container
                        if (this.isWithinListContainer(node)) {
                            this.scanElement(node);
                        } else {
                            // Check descendants within allowed containers
                            const posts = node.querySelectorAll<HTMLElement>(this.postSelectors);
                            posts.forEach((post) => {
                                if (this.isWithinListContainer(post)) {
                                    this.scanElement(post);
                                }
                            });
                        }
                    }
                });
            }
        }
    }

    private scanForPosts(): void {
        const containerQuery = this.listContainerSelectors.join(', ');
        const listContainers = document.querySelectorAll<HTMLElement>(containerQuery);
        listContainers.forEach((container) => {
            const elements = container.querySelectorAll<HTMLElement>(this.postSelectors);
            elements.forEach((element) => this.scanElement(element));
        });
    }

    private scanElement(element: HTMLElement): void {
        if (this.processedElements.has(element)) return;
        if (!this.isWithinListContainer(element)) return;
        
        const postType = this.postTypeDeterminer.determinePostType(element);
        if (postType && this.processElement(element, postType)) {
            this.processedElements.add(element);

            // If quoted-repost, scan nested posts once more
            if (postType === 'quoted-repost') {
                const nestedPosts = element.querySelectorAll<HTMLElement>(
                    '[data-testid^="feedItem-by-"], [data-testid^="postThreadItem-by-"]'
                );
                nestedPosts.forEach((nestedPost) => {
                    if (!this.processedElements.has(nestedPost) && this.isWithinListContainer(nestedPost)) {
                        const nestedType = this.postTypeDeterminer.determinePostType(nestedPost) || 'post';
                        if (this.processElement(nestedPost, nestedType)) {
                            this.processedElements.add(nestedPost);
                        }
                    }
                });
            }
        }

        // Also scan descendants if any missed
        const descendants = element.querySelectorAll<HTMLElement>(this.postSelectors);
        descendants.forEach((descendant) => {
            if (!this.processedElements.has(descendant) && this.isWithinListContainer(descendant)) {
                const descendantType = this.postTypeDeterminer.determinePostType(descendant);
                if (descendantType && this.processElement(descendant, descendantType)) {
                    this.processedElements.add(descendant);
                }
            }
        });
    }

    private isWithinListContainer(element: HTMLElement): boolean {
        const containerQuery = this.listContainerSelectors.join(', ');
        return !!element.closest(containerQuery);
    }

    private processElement(element: HTMLElement, postType: PostType): boolean {
        if (this.processedElements.has(element)) return false;

        let profileHandle: string | null = null;

        if (postType === 'repost' || postType === 'quoted-repost') {
            // Extract original poster's handle from data-testid
            const dataTestId = element.getAttribute('data-testid') || '';
            const match = dataTestId.match(/feedItem-by-([^.\s]+)/);
            if (match && match[1]) {
                profileHandle = `${match[1]}.bsky.social`; // Construct full handle
            }
        } else {
            // For regular posts, get handle from profile link
            const profileLink = element.querySelector('a[href^="/profile/"]') as HTMLAnchorElement | null;
            if (profileLink) {
                profileHandle = this.getProfileHandleFromLink(profileLink);
            }
        }

        if (!profileHandle) {
            // Handle cases where profileHandle couldn't be determined
            this.addPostTypeLabel(element, postType);
            return true;
        }

        // If already processed or wrapped, skip
        if (element.querySelector('.toggle-block-button') || element.closest('.block-button-wrapper')) {
            return true;
        }

        const wrapper = this.ensureWrapper(element, profileHandle, postType);
        return !!wrapper;
    }

    private ensureWrapper(element: HTMLElement, profileHandle: string, postType: PostType): HTMLElement | null {
        const existingWrapper = element.closest('.block-button-wrapper');
        if (existingWrapper) {
            // Add missing label/buttons if not present
            if (!existingWrapper.querySelector('.post-type-label')) {
                this.addPostTypeLabel(existingWrapper as HTMLElement, postType);
            }
            if (!existingWrapper.querySelector('.toggle-block-button')) {
                this.addBlockAndReportButtons(existingWrapper as HTMLElement, profileHandle);
            }
            return existingWrapper as HTMLElement;
        }

        // If element is not in DOM, skip
        if (!document.body.contains(element)) return null;

        try {
            const wrapper = document.createElement('div');
            wrapper.classList.add('block-button-wrapper');
            wrapper.setAttribute('data-profile-handle', profileHandle);
            wrapper.setAttribute('data-post-type', postType);
            const isUserBlocked = this.blockedUsersService.isUserBlocked(profileHandle);
            wrapper.classList.add(isUserBlocked ? 'blocked-post' : 'unblocked-post');

            // Wrap the content of the element instead of the element itself
            while (element.firstChild) {
                wrapper.appendChild(element.firstChild);
            }
            element.appendChild(wrapper);

            // Add labels and buttons
            this.addPostTypeLabel(wrapper, postType);
            this.addBlockAndReportButtons(wrapper, profileHandle);

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

    private addPostTypeLabel(container: HTMLElement, postType: PostType): void {
        if (container.querySelector('.post-type-label')) return;
        const label = document.createElement('span');
        label.classList.add('post-type-label');
        let text = postType.replace('-', ' ');
        text = text.replace(/(^|\s)\S/g, (t) => t.toUpperCase());
        label.textContent = text;
        container.prepend(label);
    }

    private addBlockAndReportButtons(wrapper: HTMLElement, profileHandle: string): void {
        const isUserBlocked = this.blockedUsersService.isUserBlocked(profileHandle);

        // Utilize the PostActionButtonsFactory to create buttons
        const buttonContainer = this.buttonsFactory.createButtons({
            profileHandle,
            isUserBlocked,
            onBlock: this.handleBlockUser.bind(this),
            onReport: this.handleReportUser.bind(this),
        });
        
        this.addAccountFreshness(buttonContainer, profileHandle);

        wrapper.append(buttonContainer);
        
    }

    private async addAccountFreshness(container: HTMLElement, profileHandle: string): Promise<void> {
        const freshnessElement = document.createElement('div');
        freshnessElement.className = 'account-freshness';
        freshnessElement.textContent = 'Loading...';
        container.prepend(freshnessElement);

        try {
            const { creationDate, postsCount } = await this.blueskyService.getAccountProfile(profileHandle);

            if (creationDate) {
                const now = new Date();
                const accountAge = Math.floor((now.getTime() - creationDate.getTime()) / (1000 * 60 * 60 * 24)); // Days

                // Reverse Newton's Law of Cooling to calculate hotness for newer accounts
                const T_env = 0; // "Cool" baseline for old accounts
                const T_max = 100; // Maximum "hotness" for new accounts
                const k = 0.01; // Cooling constant
                const T_t = T_max * Math.exp(-k * accountAge) + T_env;

                // Set account age text
                const accountAgeText =
                    accountAge < 30
                        ? `${accountAge} days old`
                        : `${Math.floor(accountAge / 30)} months old`;

                const postCountText = postsCount !== null ? `${postsCount} posts` : 'Unknown posts count';

                freshnessElement.textContent = `Account age: ${accountAgeText}, ${postCountText}`;
                freshnessElement.style.color = this.getFreshnessColor(T_t); // Apply reversed color coding
            } else {
                freshnessElement.textContent = 'Account age: Unknown, posts count: Unknown';
                freshnessElement.style.color = 'gray'; // Default for unknown
            }
        } catch (error) {
            console.error(`Error fetching account freshness for ${profileHandle}:`, error);
            freshnessElement.textContent = 'Account age: Error, posts count: Error';
            freshnessElement.style.color = 'gray'; // Error state
        }
    }

    /**
     * Determines a color based on the hotness value, mapping fresher accounts to hotter colors.
     * @param hotness - The calculated hotness value (0-100).
     * @returns A color string (e.g., `rgb(r, g, b)`).
     */
    private getFreshnessColor(hotness: number): string {
        // Normalize hotness to a 0-1 range
        const normalized = Math.min(Math.max(hotness / 100, 0), 1);

        // Define gradient colors (blue → green → yellow → orange → red)
        const colors = [
            { r: 0, g: 0, b: 255 }, // Blue (Coolest)
            { r: 0, g: 128, b: 0 }, // Green
            { r: 255, g: 255, b: 0 }, // Yellow
            { r: 255, g: 165, b: 0 }, // Orange
            { r: 255, g: 0, b: 0 }, // Red (Hottest)
        ];

        // Calculate color stops
        const steps = colors.length - 1;
        const step = Math.floor(normalized * steps);
        const t = (normalized * steps) - step; // Fractional part for interpolation

        // Interpolate between colors[step] and colors[step + 1]
        const start = colors[step];
        const end = colors[step + 1] || colors[step];
        const r = Math.round(start.r + t * (end.r - start.r));
        const g = Math.round(start.g + t * (end.g - start.g));
        const b = Math.round(start.b + t * (end.b - start.b));

        // Adjust for dark background (#161e27)
        return this.ensureReadableColor(r, g, b);
    }

    /**
     * Adjusts color brightness to ensure readability on a dark background.
     * @param r - Red value (0-255).
     * @param g - Green value (0-255).
     * @param b - Blue value (0-255).
     * @returns An adjusted color string (e.g., `rgb(r, g, b)`).
     */
    private ensureReadableColor(r: number, g: number, b: number): string {
        const backgroundLuminance = 0.1; // Approximation for #161e27
        const luminance = 0.2126 * r / 255 + 0.7152 * g / 255 + 0.0722 * b / 255;

        // If luminance is too close to the background, increase brightness
        if (Math.abs(luminance - backgroundLuminance) < 0.3) {
            r = Math.min(r + 50, 255);
            g = Math.min(g + 50, 255);
            b = Math.min(b + 50, 255);
        }

        return `rgb(${r}, ${g}, ${b})`;
    }



    private getProfileHandleFromLink(profileLink: HTMLAnchorElement): string | null {
        const href = profileLink.getAttribute('href');
        if (!href) return null;
        const match = href.match(/\/profile\/([^/?#]+)/);
        return match ? match[1] : null;
    }

    private async handleReportUser(profileHandle: string): Promise<void> {
        await this.userReporter.reportUser(profileHandle);
    }

    private async handleBlockUser(userHandle: string, blockButton: Button): Promise<void> {
        if (!this.isLoggedIn()) {
            this.notificationManager.displayNotification(MESSAGES.LOGIN_REQUIRED_TO_BLOCK_USERS, 'error');
            return;
        }
        const selectedBlockList = this.getSelectedBlockList();
        if (!selectedBlockList) {
            this.notificationManager.displayNotification(MESSAGES.PLEASE_SELECT_BLOCK_LIST, 'error');
            return;
        }
        try {
            const isBlocking = blockButton.getText()?.includes(LABELS.BLOCK) ?? false;
            if (isBlocking) {
                const response = await this.blueskyService.blockUser(userHandle, selectedBlockList);
                if (response) {
                    await this.onUserBlocked(userHandle);
                    this.updatePostsByUser(userHandle, true);
                    const selectedBlockListName = await this.blueskyService.getBlockListName(selectedBlockList);
                    this.notificationManager.displayNotification(
                        MESSAGES.USER_BLOCKED_SUCCESS(userHandle, selectedBlockListName),
                        'success'
                    );
                } else {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }
            } else {
                const response = await this.blueskyService.unblockUser(userHandle, selectedBlockList);
                if (response) {
                    await this.onUserUnblocked(userHandle);
                    this.updatePostsByUser(userHandle, false);
                    this.notificationManager.displayNotification(MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle), 'success');
                } else {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }
            }
        } catch (error) {
            console.error(`Error blocking/unblocking user "${userHandle}":`, error);
            this.notificationManager.displayNotification(ERRORS.FAILED_TO_BLOCK_USER, 'error');
        }
    }


    private updatePostsByUser(profileHandle: string, isBlocked: boolean): void {
        const wrappers = document.querySelectorAll<HTMLElement>(`.block-button-wrapper[data-profile-handle="${profileHandle}"]`);
        wrappers.forEach((wrapper) => {
            const blockButtonElement = wrapper.querySelector('.toggle-block-button') as HTMLButtonElement;
            if (!blockButtonElement) return;
            if (isBlocked) {
                blockButtonElement.textContent = LABELS.UNBLOCK;
                blockButtonElement.classList.remove('btn-outline-secondary');
                blockButtonElement.classList.add('btn-danger');
                wrapper.classList.remove('unblocked-post');
                wrapper.classList.add('blocked-post');
            } else {
                blockButtonElement.textContent = LABELS.BLOCK;
                blockButtonElement.classList.remove('btn-danger');
                blockButtonElement.classList.add('btn-outline-secondary');
                wrapper.classList.remove('blocked-post');
                wrapper.classList.add('unblocked-post');
            }
        });
    }

    public setBlockButtonsVisibility(visible: boolean): void {
        this.blockButtonsVisible = visible;
        visible ? this.showBlockButtons() : this.hideBlockButtons();
    }

    private showBlockButtons(): void {
        document.querySelectorAll('.toggle-block-button').forEach((button) => {
            (button as HTMLElement).style.display = '';
        });
    }

    private hideBlockButtons(): void {
        document.querySelectorAll('.toggle-block-button').forEach((button) => {
            (button as HTMLElement).style.display = 'none';
        });
    }

    public destroy(): void {
        this.mutationManager.destroy();

        // Clear eventHandlers as PostScanner no longer has references to external elements
        this.eventHandlers = {};

        // Clear processed elements
        this.processedElements = new WeakSet();
    }
}
