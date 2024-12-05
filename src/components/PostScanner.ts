// =============================== //
// src/components/PostScanner.ts

import { NotificationManager } from './NotificationManager';
import { Button } from './Button';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import {
    LABELS,
    MESSAGES,
    ERRORS,
    ARIA_LABELS,
} from '@src/constants/Constants';
import { EventListenerHelper } from '@src/utils/EventListenerHelper';

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

        // Subscribe to BlockedUsersService events
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
        // Initial scan
        this.scanForPosts();
    }

    private setupObserver(): void {
        const targetNode = document.body;
        const config: MutationObserverInit = {
            childList: true,
            subtree: true,
        };

        this.observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node instanceof HTMLElement) {
                            this.scanElement(node);
                        }
                    });
                }
            }
        });

        this.observer.observe(targetNode, config);
    }

    private scanForPosts(): void {
        const elements = document.querySelectorAll<HTMLElement>(
                `div[role="link"][tabindex="0"],
                div.css-175oi2r a[href^="/profile/"]`
        );
        elements.forEach((element) => this.injectBlockButton(element));
    }

    private scanElement(element: HTMLElement): void {
        // Check if the element matches the selectors
        if (
            element.matches(
                `div[role="link"][tabindex="0"], div.css-175oi2r a[href^="/profile/"]`
            )
        ) {
            this.injectBlockButton(element);
        }

        // Also check its descendants
        const descendants = element.querySelectorAll<HTMLElement>(
                `div[role="link"][tabindex="0"], div.css-175oi2r a[href^="/profile/"]`
        );
        descendants.forEach((descendant) => this.injectBlockButton(descendant));
    }

    public setBlockButtonsVisibility(visible: boolean): void {
        this.blockButtonsVisible = visible;
        if (visible) {
            this.showBlockButtons();
        } else {
            this.hideBlockButtons();
        }
    }

    private showBlockButtons(): void {
        const buttons = document.querySelectorAll('.toggle-block-button');
        buttons.forEach((button) => {
            (button as HTMLElement).style.display = '';
        });
    }

    private hideBlockButtons(): void {
        const buttons = document.querySelectorAll('.toggle-block-button');
        buttons.forEach((button) => {
            (button as HTMLElement).style.display = 'none';
        });
    }

    private injectBlockButton(element: HTMLElement): void {
        // Prevent multiple block buttons on the same element
        if (element.querySelector('.toggle-block-button')) return;

        const profileLink = element.querySelector(
            'a[href^="/profile/"]'
        ) as HTMLAnchorElement | null;
        if (!profileLink) return;

        const profileHandle = this.getProfileHandleFromLink(profileLink);
        if (!profileHandle) return;

        // Check if the element is already wrapped
        if (
            element.parentElement &&
            element.parentElement.classList.contains('block-button-wrapper')
        ) {
            const wrapper = element.parentElement as HTMLElement;
            // Update the check to look for any existing toggle-block-button
            if (wrapper.querySelector('.toggle-block-button')) return;

            this.addBlockAndReportButtons(wrapper, profileHandle, element);
            return;
        }

        // Create a wrapper div
        const wrapper = document.createElement('div');
        wrapper.classList.add('block-button-wrapper');
        wrapper.setAttribute('data-profile-handle', profileHandle);

        // Set initial post state based on block status
        const isUserBlocked = this.blockedUsersService.isUserBlocked(profileHandle);
        if (isUserBlocked) {
            wrapper.classList.add('blocked-post');
        } else {
            wrapper.classList.add('unblocked-post');
        }

        // Insert the wrapper before the target element
        element.parentElement?.insertBefore(wrapper, element);
        // Move the target element into the wrapper
        wrapper.appendChild(element);

        // Add the block button to the wrapper
        this.addBlockAndReportButtons(wrapper, profileHandle, element);

        // Hide the button if block buttons are not visible
        if (!this.blockButtonsVisible) {
            const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLElement;
            if (blockButton) {
                blockButton.style.display = 'none';
            }
        }
    }

    private addBlockAndReportButtons(
        wrapper: HTMLElement,
        profileHandle: string,
        postElement: HTMLElement
    ): void {
        const isUserBlocked = this.blockedUsersService.isUserBlocked(profileHandle);

        // Block Button
        const blockButtonText = isUserBlocked ? LABELS.UNBLOCK : LABELS.BLOCK;
        const blockButtonClasses = isUserBlocked
            ? 'toggle-block-button unblock-user-button btn btn-danger btn-sm'
            : 'toggle-block-button block-user-button btn btn-outline-secondary btn-sm';

        const blockButton = new Button({
            classNames: blockButtonClasses,
            text: blockButtonText,
            ariaLabel: ARIA_LABELS.BLOCK_USER(profileHandle),
        });

        // Report Button
        const reportButton = new Button({
            classNames: 'report-user-button btn btn-warning btn-sm',
            text: LABELS.REPORT,
            ariaLabel: ARIA_LABELS.REPORT_USER(profileHandle),
        });

        // Create a container for the buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.classList.add('button-container');
        buttonContainer.appendChild(blockButton.element);
        buttonContainer.appendChild(reportButton.element);

        // Append the button container to the wrapper
        wrapper.appendChild(buttonContainer);

        // Event Listeners
        EventListenerHelper.addMultipleEventListeners(
            blockButton.element,
            ['click', 'touchend'],
            (event) =>
                this.handleBlockUser(event, profileHandle, blockButton, postElement)
        );

        EventListenerHelper.addMultipleEventListeners(
            reportButton.element,
            ['click', 'touchend'],
            (event) => this.handleReportUser(event, profileHandle)
        );
    }

    private getProfileHandleFromLink(
        profileLink: HTMLAnchorElement
    ): string | null {
        const href = profileLink.getAttribute('href');
        const match = href?.match(/\/profile\/([^/?#]+)/);
        return match ? match[1] : null;
    }

    private async handleReportUser(
        event: Event,
        profileHandle: string
    ): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        if (!this.isLoggedIn()) {
            console.error('Not logged in.');
            this.notificationManager.displayNotification(
                MESSAGES.LOGIN_REQUIRED_TO_REPORT_USERS,
                'error'
            );
            return;
        }

        try {
            // Define reason types
            const reasonTypes = [
                { code: 'com.atproto.moderation.defs#reasonSpam', label: 'Spam' },
                { code: 'com.atproto.moderation.defs#reasonViolation', label: 'Violation' },
                { code: 'com.atproto.moderation.defs#reasonMisleading', label: 'Misleading' },
                { code: 'com.atproto.moderation.defs#reasonSexual', label: 'Sexual Content' },
                { code: 'com.atproto.moderation.defs#reasonRude', label: 'Rude Behavior' },
            ];

            // Create prompt message
            const reasonOptions = reasonTypes
                .map((r, index) => `${index + 1}. ${r.label}`)
                .join('\n');
            const promptMessage = `${MESSAGES.PROMPT_REPORT_REASON}\n${reasonOptions}`;

            // Show prompt
            const reasonInput = prompt(promptMessage);

            if (reasonInput !== null) {
                const reasonIndex = parseInt(reasonInput.trim()) - 1;
                if (reasonIndex >= 0 && reasonIndex < reasonTypes.length) {
                    const selectedReasonType = reasonTypes[reasonIndex];
                    // Report the user
                    await this.blueskyService.reportAccount(
                        profileHandle,
                        selectedReasonType.code,
                        selectedReasonType.label
                    );

                    this.notificationManager.displayNotification(
                        MESSAGES.USER_REPORTED_SUCCESS(profileHandle),
                        'success'
                    );
                } else {
                    this.notificationManager.displayNotification(
                        MESSAGES.INVALID_REPORT_SELECTION,
                        'error'
                    );
                }
            } else {
                this.notificationManager.displayNotification(
                    MESSAGES.REPORT_CANCELLED,
                    'info'
                );
            }
        } catch (error) {
            console.error('Failed to report user:', error);
            this.notificationManager.displayNotification(
                MESSAGES.FAILED_TO_REPORT_USER,
                'error'
            );
        }
    }

    private async handleBlockUser(
        event: Event,
        profileHandle: string,
        blockButton: Button,
        postElement: HTMLElement
    ): Promise<void> {
        event.preventDefault();
        event.stopPropagation();

        if (!this.isLoggedIn()) {
            console.error('Not logged in.');
            this.notificationManager.displayNotification(
                MESSAGES.LOGIN_REQUIRED_TO_BLOCK_USERS,
                'error'
            );
            return;
        }

        const selectedBlockList = this.getSelectedBlockList();
        if (!selectedBlockList) {
            this.notificationManager.displayNotification(
                MESSAGES.PLEASE_SELECT_BLOCK_LIST,
                'error'
            );
            return;
        }

        try {
            const currentText = blockButton.getText();
            const isBlocking = currentText?.includes(LABELS.BLOCK);

            if (isBlocking) {
                const response = await this.blueskyService.blockUser(
                    profileHandle,
                    selectedBlockList
                );
                if (response) {
                    console.log(`User ${profileHandle} has been blocked.`);
                    await this.onUserBlocked(profileHandle);
                    this.updatePostsByUser(profileHandle, true);

                    const selectedBlockListName =
                        await this.blueskyService.getBlockListName(selectedBlockList);
                    this.notificationManager.displayNotification(
                        MESSAGES.USER_BLOCKED_SUCCESS(
                            profileHandle,
                            selectedBlockListName
                        ),
                        'success'
                    );
                } else {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }
            } else {
                const response = await this.blueskyService.unblockUser(
                    profileHandle,
                    selectedBlockList
                );
                if (response) {
                    console.log(`User ${profileHandle} has been unblocked.`);
                    await this.onUserUnblocked(profileHandle);
                    this.updatePostsByUser(profileHandle, false);

                    this.notificationManager.displayNotification(
                        MESSAGES.USER_UNBLOCKED_SUCCESS(profileHandle),
                        'success'
                    );
                } else {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }
            }
        } catch (error) {
            console.error('Failed to block/unblock user:', error);
            this.notificationManager.displayNotification(
                MESSAGES.FAILED_TO_BLOCK_USER,
                'error'
            );
        }
    }

    private updatePostsByUser(profileHandle: string, isBlocked: boolean): void {
        const wrappers = document.querySelectorAll<HTMLElement>(
            `.block-button-wrapper[data-profile-handle="${profileHandle}"]`
        );

        wrappers.forEach((wrapper) => {
            const blockButtonElement = wrapper.querySelector(
                '.toggle-block-button'
            ) as HTMLButtonElement;

            if (blockButtonElement) {
                if (isBlocked) {
                    blockButtonElement.textContent = LABELS.UNBLOCK;
                    blockButtonElement.classList.remove(
                        'block-user-button',
                        'btn-outline-secondary'
                    );
                    blockButtonElement.classList.add(
                        'unblock-user-button',
                        'btn-danger'
                    );
                    wrapper.classList.remove('unblocked-post');
                    wrapper.classList.add('blocked-post');
                } else {
                    blockButtonElement.textContent = LABELS.BLOCK;
                    blockButtonElement.classList.remove(
                        'unblock-user-button',
                        'btn-danger'
                    );
                    blockButtonElement.classList.add(
                        'block-user-button',
                        'btn-outline-secondary'
                    );
                    wrapper.classList.remove('blocked-post');
                    wrapper.classList.add('unblocked-post');
                }
            }
        });
    }
}
