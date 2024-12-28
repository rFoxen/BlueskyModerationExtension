// src\components\posts\ActionButtonManager.ts

import { Button } from '@src/components/common/Button';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { UserReporter } from '@src/components/reporting/UserReporter';
import { LABELS, ARIA_LABELS, MESSAGES, ERRORS } from '@src/constants/Constants';
import { PostActionButtonsFactory } from './PostActionButtonsFactory';

/**
 * ActionButtonManager handles the inline "Block"/"Unblock" button logic
 * that appears next to each post or user reference.
 */
export class ActionButtonManager {
    private notificationManager: NotificationManager;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private isLoggedIn: () => boolean;
    private getSelectedBlockList: () => string | null;
    private onUserBlocked: (userHandle: string) => Promise<void>;
    private onUserUnblocked: (userHandle: string) => Promise<void>;
    private userReporter: UserReporter;
    private buttonsFactory: PostActionButtonsFactory;

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

        this.buttonsFactory = new PostActionButtonsFactory(
            this.notificationManager,
            this.blockedUsersService
        );
    }

    /**
     * Creates the block/unblock/report buttons for a given post.
     */
    public createButtons(profileHandle: string, isUserBlocked: boolean): HTMLElement {
        const buttonContainer = this.buttonsFactory.createButtons({
            profileHandle,
            isUserBlocked,
            onBlock: this.handleBlockUser.bind(this),
            onReport: this.handleReportUser.bind(this),
        });
        return buttonContainer;
    }

    /**
     * Called when the user clicks the "Block" or "Unblock" button in the inline action buttons.
     */
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

        // Check whether user is currently blocked
        const alreadyBlocked = this.blockedUsersService.isUserBlocked(userHandle);

        // Show "spinner" or disable
        blockButton.setDisabled(true);
        blockButton.addClasses('loading');

        try {
            const isBlocking = blockButton.getText()?.includes(LABELS.BLOCK) ?? false;

            if (isBlocking) {
                // If user is already blocked, do nothing
                if (alreadyBlocked) {
                    console.log(`User ${userHandle} is already blocked. Skipping re-block.`);
                    return;
                }

                // --- BLOCK FLOW (Optimistic) ---
                const tempItem = {
                    subject: { handle: userHandle, did: '' },
                    uri: 'pending',
                };
                this.blockedUsersService.emit('blockedUserAdded', tempItem);

                // Call the block API
                const response = await this.blueskyService.blockUser(userHandle, selectedBlockList);
                if (!response) {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }

                // If success, store the real URI
                await this.blockedUsersService.addBlockedUserFromResponse(
                    response,
                    userHandle,
                    selectedBlockList
                );
                // Let UI or PostScanner know
                await this.onUserBlocked(userHandle);

                const selectedBlockListName = await this.blueskyService.getBlockListName(selectedBlockList);
                this.notificationManager.displayNotification(
                    MESSAGES.USER_BLOCKED_SUCCESS(userHandle, selectedBlockListName),
                    'success'
                );
            } else {
                // If user is NOT blocked, skip unblocking
                if (!alreadyBlocked) {
                    console.log(`User ${userHandle} is not blocked. Skipping unblock.`);
                    return;
                }

                // --- UNBLOCK FLOW ---
                await this.blockedUsersService.removeBlockedUser(userHandle, selectedBlockList);
                this.notificationManager.displayNotification(
                    MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle),
                    'success'
                );
                // Notify other parts of the app
                await this.onUserUnblocked(userHandle);
            }
        } catch (error) {
            console.error(`Error blocking/unblocking user "${userHandle}":`, error);

            // If we were optimistically blocking, revert
            const isBlocking = blockButton.getText()?.includes(LABELS.BLOCK) ?? false;
            if (isBlocking && !alreadyBlocked) {
                this.blockedUsersService.emit('blockedUserRemoved', userHandle);
            }
            this.notificationManager.displayNotification(ERRORS.FAILED_TO_BLOCK_USER, 'error');
        } finally {
            // remove spinner
            blockButton.setDisabled(false);
            blockButton.removeClasses('loading');
        }
    }

    private async handleReportUser(userHandle: string): Promise<void> {
        await this.userReporter.reportUser(userHandle);
    }

    /**
     * Updates the button text/style if the user is blocked or unblocked.
     */
    public updateButtonState(wrapper: HTMLElement, isBlocked: boolean): void {
        const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLButtonElement | null;
        if (blockButton) {
            blockButton.textContent = isBlocked ? LABELS.UNBLOCK : LABELS.BLOCK;
            blockButton.classList.toggle('btn-danger', isBlocked);
            blockButton.classList.toggle('btn-outline-secondary', !isBlocked);
        }
    }

    /**
     * Toggles visibility of block buttons across all posts in the feed.
     */
    public setButtonsVisibility(visible: boolean): void {
        const buttons = document.querySelectorAll('.toggle-block-button');
        buttons.forEach((button) => {
            (button as HTMLElement).style.display = visible ? '' : 'none';
        });
    }

    public destroy(): void {
        this.buttonsFactory.destroy();
        // Additional cleanup if necessary
    }
}
