// src/components/PostScanner.ts

import { NotificationManager } from './NotificationManager';
import { Button } from './Button';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { LABELS, MESSAGES, ERRORS, ARIA_LABELS } from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';

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
    private mutationQueue: MutationRecord[] = [];
    private mutationThrottleTimer: number | null = null;
    private MUTATION_THROTTLE_DELAY = 300;

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
        this.setupObserver();
        this.scanForPosts();
    }

    private setupObserver(): void {
        const targetNode = document.body;
        const config: MutationObserverInit = {
            childList: true,
            subtree: true,
        };
        this.observer = new MutationObserver((mutationsList) => {
            // Accumulate mutations and schedule processing
            this.mutationQueue.push(...mutationsList);
            this.scheduleMutationProcessing();
        });
        this.observer.observe(targetNode, config);
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

        const postType = this.determinePostType(element);
        if (postType && this.processElement(element, postType)) {
            this.processedElements.add(element);
            // If quoted-repost, scan nested posts once more
            if (postType === 'quoted-repost') {
                const nestedPosts = element.querySelectorAll<HTMLElement>(
                    '[data-testid^="feedItem-by-"], [data-testid^="postThreadItem-by-"]'
                );
                nestedPosts.forEach((nestedPost) => {
                    if (!this.processedElements.has(nestedPost) && this.isWithinListContainer(nestedPost)) {
                        const nestedType = this.determinePostType(nestedPost) || 'post';
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
                const descendantType = this.determinePostType(descendant);
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

    private determinePostType(element: HTMLElement): PostType | null {
        const testId = element.getAttribute('data-testid') || '';
        const textContent = element.textContent?.toLowerCase() || '';
        const profileLink = element.querySelector('a[href^="/profile/"]') as HTMLAnchorElement | null;

        // block-list-item
        if (testId.startsWith('user-')) {
            return 'block-list-item';
        }

        // feed or thread items
        const isPostItem = testId.startsWith('feedItem-by-') || testId.startsWith('postThreadItem-by-');
        if (isPostItem) {
            if (textContent.includes('reposted by')) {
                const nestedPost = element.querySelector('[data-testid^="feedItem-by-"], [data-testid^="postThreadItem-by-"]');
                return nestedPost ? 'quoted-repost' : 'repost';
            }
            if (textContent.includes('reply to ')) {
                return 'reply';
            }
            if (textContent.includes('reply to you')) {
                return 'notification-reply';
            }
            if (textContent.includes('liked your post')) {
                return 'notification-like';
            }
            return 'post';
        }

        // people-search-item
        if (
            profileLink &&
            !testId.startsWith('feedItem-by-') &&
            !testId.startsWith('postThreadItem-by-') &&
            !testId.startsWith('user-')
        ) {
            const followButton = element.querySelector('button')?.textContent?.toLowerCase();
            if (followButton === 'follow') {
                return 'people-search-item';
            }
        }

        // If profile link exists but no patterns match, treat as normal post or reply
        if (profileLink) {
            if (textContent.includes('reply to ')) {
                return 'reply';
            }
            // Check if multiple posts inside
            const descendantPosts = element.querySelectorAll('div[role="link"][tabindex="0"]');
            if (descendantPosts.length > 1) return null;
            return 'post';
        }

        return null;
    }

    private processElement(element: HTMLElement, postType: PostType): boolean {
        const profileLink = element.querySelector('a[href^="/profile/"]') as HTMLAnchorElement | null;
        if (!profileLink) {
            // No profile handle: just label post type
            this.addPostTypeLabel(element, postType);
            return true;
        }

        const profileHandle = this.getProfileHandleFromLink(profileLink);
        if (!profileHandle) {
            // No handle: just label
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
            this.addPostTypeLabel(wrapper, postType);

            // Insert wrapper before element in the DOM tree
            element.parentNode?.insertBefore(wrapper, element);
            wrapper.appendChild(element);

            if (!wrapper.querySelector('.toggle-block-button')) {
                this.addBlockAndReportButtons(wrapper, profileHandle);
            }

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
        const blockButtonText = isUserBlocked ? LABELS.UNBLOCK : LABELS.BLOCK;
        const blockButtonClasses = isUserBlocked
            ? 'toggle-block-button btn btn-danger btn-sm'
            : 'toggle-block-button btn btn-outline-secondary btn-sm';

        const blockButton = new Button({
            classNames: blockButtonClasses,
            text: blockButtonText,
            ariaLabel: isUserBlocked
                ? ARIA_LABELS.UNBLOCK_USER(profileHandle)
                : ARIA_LABELS.BLOCK_USER(profileHandle),
        });

        const reportButton = new Button({
            classNames: 'report-user-button btn btn-warning btn-sm',
            text: LABELS.REPORT,
            ariaLabel: ARIA_LABELS.REPORT_USER(profileHandle),
        });

        const buttonContainer = document.createElement('div');
        buttonContainer.classList.add('button-container');
        buttonContainer.appendChild(blockButton.element);
        buttonContainer.appendChild(reportButton.element);
        wrapper.appendChild(buttonContainer);

        blockButton.addEventListener('click', async (event: Event) => {
            await this.handleBlockUser(event, profileHandle, blockButton);
        });

        reportButton.addEventListener('click', (event: Event) => {
            this.handleReportUser(event, profileHandle);
        });
    }

    private getProfileHandleFromLink(profileLink: HTMLAnchorElement): string | null {
        const href = profileLink.getAttribute('href');
        if (!href) return null;
        const match = href.match(/\/profile\/([^/?#]+)/);
        return match ? match[1] : null;
    }

    private async handleReportUser(event: Event, profileHandle: string): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        if (!this.isLoggedIn()) {
            this.notificationManager.displayNotification(MESSAGES.LOGIN_REQUIRED_TO_REPORT_USERS, 'error');
            return;
        }

        try {
            const reasonTypes = [
                { code: 'com.atproto.moderation.defs#reasonSpam', label: 'Spam' },
                { code: 'com.atproto.moderation.defs#reasonViolation', label: 'Violation' },
                { code: 'com.atproto.moderation.defs#reasonMisleading', label: 'Misleading' },
                { code: 'com.atproto.moderation.defs#reasonSexual', label: 'Sexual Content' },
                { code: 'com.atproto.moderation.defs#reasonRude', label: 'Rude Behavior' },
            ];

            const reasonOptions = reasonTypes.map((r, index) => `${index + 1}. ${r.label}`).join('\n');
            const promptMessage = `${MESSAGES.PROMPT_REPORT_REASON}\n${reasonOptions}`;
            const reasonInput = prompt(promptMessage);

            if (reasonInput !== null) {
                const reasonIndex = parseInt(reasonInput.trim(), 10) - 1;
                if (reasonIndex >= 0 && reasonIndex < reasonTypes.length) {
                    const selectedReasonType = reasonTypes[reasonIndex];
                    const userDid = await this.blockedUsersService.resolveHandleFromDid(profileHandle);
                    const comments = prompt(LABELS.PROMPT_ADDITIONAL_COMMENTS) || '';
                    await this.blockedUsersService.reportAccount(userDid, selectedReasonType.code, comments);
                    this.notificationManager.displayNotification(MESSAGES.USER_REPORTED_SUCCESS(profileHandle), 'success');
                } else {
                    this.notificationManager.displayNotification(MESSAGES.INVALID_REPORT_SELECTION, 'error');
                }
            } else {
                this.notificationManager.displayNotification(MESSAGES.REPORT_CANCELLED, 'info');
            }
        } catch (error) {
            console.error('Error reporting user:', error);
            this.notificationManager.displayNotification(MESSAGES.FAILED_TO_REPORT_USER, 'error');
        }
    }

    private async handleBlockUser(event: Event, profileHandle: string, blockButton: Button): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

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
                const response = await this.blueskyService.blockUser(profileHandle, selectedBlockList);
                if (response) {
                    await this.onUserBlocked(profileHandle);
                    this.updatePostsByUser(profileHandle, true);
                    const selectedBlockListName = await this.blueskyService.getBlockListName(selectedBlockList);
                    this.notificationManager.displayNotification(
                        MESSAGES.USER_BLOCKED_SUCCESS(profileHandle, selectedBlockListName),
                        'success'
                    );
                } else {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }
            } else {
                const response = await this.blueskyService.unblockUser(profileHandle, selectedBlockList);
                if (response) {
                    await this.onUserUnblocked(profileHandle);
                    this.updatePostsByUser(profileHandle, false);
                    this.notificationManager.displayNotification(MESSAGES.USER_UNBLOCKED_SUCCESS(profileHandle), 'success');
                } else {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }
            }
        } catch {
            this.notificationManager.displayNotification(MESSAGES.FAILED_TO_BLOCK_USER, 'error');
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
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        // Clear eventHandlers as PostScanner no longer has references to external elements
        this.eventHandlers = {};

        // Clear processed elements
        this.processedElements = new WeakSet();
    }
}
