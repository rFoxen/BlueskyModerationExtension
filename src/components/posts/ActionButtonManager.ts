import { Button } from '@src/components/common/Button';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { UserReporter } from '@src/components/reporting/UserReporter';
import { LABELS, ARIA_LABELS, MESSAGES, ERRORS } from '@src/constants/Constants';
import { PostActionButtonsFactory } from './PostActionButtonsFactory';
import Logger from '@src/utils/logger/Logger';

export class ActionButtonManager {
    private notificationManager: NotificationManager;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private isLoggedIn: () => boolean;
    private getActiveBlockLists: () => string[];
    private onUserBlocked: (userHandle: string) => Promise<void>;
    private onUserUnblocked: (userHandle: string) => Promise<void>;
    private userReporter: UserReporter;
    private buttonsFactory: PostActionButtonsFactory;

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

        this.buttonsFactory = new PostActionButtonsFactory(
            this.notificationManager,
            this.blockedUsersService
        );
    }

    public createButtons(profileHandle: string, isUserBlocked: boolean): HTMLElement {
        const buttonContainer = this.buttonsFactory.createButtons({
            profileHandle,
            isUserBlocked,
            onBlock: this.handleBlockUser.bind(this),
            onReport: this.handleReportUser.bind(this),
        });
        return buttonContainer;
    }

    private async handleBlockUser(userHandle: string, blockButton: Button): Promise<void> {
        if (!this.isLoggedIn()) {
            this.notificationManager.displayNotification(MESSAGES.LOGIN_REQUIRED_TO_BLOCK_USERS, 'error');
            return;
        }

        const selectedBlockList = this.getActiveBlockLists()[0];
        if (!selectedBlockList) {
            this.notificationManager.displayNotification(MESSAGES.PLEASE_SELECT_BLOCK_LIST, 'error');
            return;
        }

        // For debugging performance: track start time
        Logger.time(`handleBlockUser: ${userHandle}`);
        
        const activeListUris = this.getActiveBlockLists();
        // Check whether user is currently blocked
        const alreadyBlocked = await this.blockedUsersService.isUserBlocked(userHandle, [activeListUris[0]]);

        // Show "spinner" or disable
        blockButton.setDisabled(true);
        blockButton.addClasses('loading');

        try {
            // Determine if we are blocking or unblocking
            const isBlocking = blockButton.getText()?.includes(LABELS.BLOCK) ?? false;

            if (isBlocking) {
                if (alreadyBlocked) {
                    Logger.debug(`User ${userHandle} is already blocked. Skipping re-block.`);
                    return;
                }

                // --- BLOCK FLOW (Optimistic) ---
                this.debugLog(`Optimistic block -> ${userHandle}`);
                const tempItem = { subject: { handle: userHandle, did: '' }, uri: 'pending' };
                this.blockedUsersService.emit('blockedUserAdded', tempItem);

                // API call
                this.debugLog(`Calling blueskyService.blockUser(...) for ${userHandle}`);
                const response = await this.blueskyService.blockUser(userHandle, selectedBlockList);
                if (!response) {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }

                // If success, store the real URI
                this.debugLog(`API returned success for blocking ${userHandle}. addBlockedUserFromResponse(...)`);
                await this.blockedUsersService.addBlockedUserFromResponse(response, userHandle, selectedBlockList);
                Logger.debug('intermediate timeEnd for handleBlockUser...');
                Logger.timeEnd(`handleBlockUser: ${userHandle}`);
                
                // Let other parts know
                await this.onUserBlocked(userHandle);

                Logger.time('getBlockListName');
                const selectedBlockListName = await this.blueskyService.getBlockListName(selectedBlockList);
                Logger.timeEnd('getBlockListName');
                
                this.notificationManager.displayNotification(
                    MESSAGES.USER_BLOCKED_SUCCESS(userHandle, selectedBlockListName),
                    'success'
                );

                // Update button to show "Unblock"
                this.setBlockButtonToBlockedState(blockButton);

            } else {
                // If user is NOT blocked, skip unblocking
                if (!alreadyBlocked) {
                    Logger.debug(`User ${userHandle} is not blocked. Skipping unblock.`);
                    return;
                }

                // --- UNBLOCK FLOW ---
                this.debugLog(`Calling removeBlockedUser(...) for ${userHandle}`);
                await this.blockedUsersService.removeBlockedUser(userHandle, selectedBlockList);

                this.notificationManager.displayNotification(
                    MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle),
                    'success'
                );

                // Let others know
                await this.onUserUnblocked(userHandle);

                // Switch the button to "Block"
                this.setBlockButtonToUnblockedState(blockButton);
            }
        } catch (error) {
            Logger.error(`Error blocking/unblocking user "${userHandle}":`, error);

            // If we were optimistically blocking, revert
            const isBlocking = blockButton.getText()?.includes(LABELS.BLOCK) ?? false;
            if (isBlocking && !alreadyBlocked) {
                this.blockedUsersService.emit('blockedUserRemoved', userHandle);
            }

            this.notificationManager.displayNotification(ERRORS.FAILED_TO_BLOCK_USER, 'error');
        } finally {
            Logger.debug('About to end handleBlockUser, no more steps remain...');
            // remove spinner
            blockButton.setDisabled(false);
            blockButton.removeClasses('loading');
        }
    }

    private async handleReportUser(userHandle: string): Promise<void> {
        await this.userReporter.reportUser(userHandle);
    }

    public updateButtonState(wrapper: HTMLElement, isBlocked: boolean): void {
        const blockButton = wrapper.querySelector('.toggle-block-button') as HTMLButtonElement | null;
        if (blockButton) {
            blockButton.textContent = isBlocked ? LABELS.UNBLOCK : LABELS.BLOCK;
            blockButton.classList.toggle('btn-danger', isBlocked);
            blockButton.classList.toggle('btn-outline-secondary', !isBlocked);
        }
    }

    private setBlockButtonToBlockedState(blockButton: Button): void {
        blockButton.setText(LABELS.UNBLOCK);
        blockButton.removeClasses('btn-outline-secondary');
        blockButton.addClasses('btn-danger');
    }

    private setBlockButtonToUnblockedState(blockButton: Button): void {
        blockButton.setText(LABELS.BLOCK);
        blockButton.removeClasses('btn-danger');
        blockButton.addClasses('btn-outline-secondary');
    }

    /**
     * Simple helper to unify debug logging.
     * If you want to disable debugging, comment out this method’s content
     * or wrap in a condition check.
     */
    private debugLog(...args: any[]): void {
        Logger.debug('', ...args);
    }

    public setButtonsVisibility(visible: boolean): void {
        const buttons = document.querySelectorAll('.toggle-block-button');
        buttons.forEach((button) => {
            (button as HTMLElement).style.display = visible ? '' : 'none';
        });
    }

    public destroy(): void {
        this.buttonsFactory.destroy();
        // Additional cleanup if needed
    }
}
