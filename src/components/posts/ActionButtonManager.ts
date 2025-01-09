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

    /**
     * Creates a container of buttons for a given profile handle.
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
     * Main entry point for toggling block/unblock when user clicks the Block/Unblock button.
     */
    public async handleBlockUser(userHandle: string, blockButton: Button): Promise<void> {
        // 1) Check essential preconditions
        if (!this.checkLoginStatus()) return;
        const selectedBlockList = this.getSelectedBlockList();
        if (!selectedBlockList) return;

        // 2) Start performance tracking & UI adjustments
        Logger.time(`handleBlockUser: ${userHandle}`);
        blockButton.setDisabled(true);
        blockButton.addClasses('loading');

        const activeListUris = this.getActiveBlockLists();
        const isCurrentlyBlocked = await this.isAlreadyBlocked(userHandle, activeListUris);

        // 3) Decide if we need to block or unblock
        const isBlocking = blockButton.getText()?.includes(LABELS.BLOCK) ?? false;

        try {
            if (isBlocking) {
                await this.blockUserFlow(userHandle, selectedBlockList, isCurrentlyBlocked);
            } else {
                await this.unblockUserFlow(userHandle, selectedBlockList, isCurrentlyBlocked);
            }
        } catch (error) {
            // Revert optimistic changes if it was a block attempt
            if (isBlocking && !isCurrentlyBlocked) {
                this.blockedUsersService.emit('blockedUserRemoved', userHandle);
            }
            this.notificationManager.displayNotification(ERRORS.FAILED_TO_BLOCK_USER, 'error');
            Logger.error(`Error blocking/unblocking user "${userHandle}":`, error);
        } finally {
            this.finalizeBlockAction(blockButton, userHandle);
        }
    }

    /**
     * Report user flow.
     */
    private async handleReportUser(userHandle: string): Promise<void> {
        await this.userReporter.reportUser(userHandle);
    }

    /**
     * Updates the state of a block button in an already created wrapper.
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
     * Set button appearance for "blocked" state.
     */
    private setBlockButtonToBlockedState(blockButton: Button): void {
        blockButton.setText(LABELS.UNBLOCK);
        blockButton.removeClasses('btn-outline-secondary');
        blockButton.addClasses('btn-danger');
    }

    /**
     * Set button appearance for "unblocked" state.
     */
    private setBlockButtonToUnblockedState(blockButton: Button): void {
        blockButton.setText(LABELS.BLOCK);
        blockButton.removeClasses('btn-danger');
        blockButton.addClasses('btn-outline-secondary');
    }

    /**
     * Small helper for debug logging.
     */
    private debugLog(...args: any[]): void {
        Logger.debug('', ...args);
    }

    /**
     * Control visibility of all toggle-block-buttons across the UI.
     */
    public setButtonsVisibility(visible: boolean): void {
        const buttons = document.querySelectorAll('.toggle-block-button');
        buttons.forEach((button) => {
            (button as HTMLElement).style.display = visible ? '' : 'none';
        });
    }

    /**
     * Cleanup resources on destruction.
     */
    public destroy(): void {
        this.buttonsFactory.destroy();
        // Additional cleanup if needed
    }

    // ------------------------------------------------------------
    //                      REFACTORED METHODS
    // ------------------------------------------------------------

    /**
     * Ensures the user is logged in before performing a block/unblock.
     */
    private checkLoginStatus(): boolean {
        if (!this.isLoggedIn()) {
            this.notificationManager.displayNotification(MESSAGES.LOGIN_REQUIRED_TO_BLOCK_USERS, 'error');
            return false;
        }
        return true;
    }

    /**
     * Retrieves and validates the selected block list. Returns null if invalid.
     */
    private getSelectedBlockList(): string | null {
        const selectedBlockList = this.getActiveBlockLists()[0];
        if (!selectedBlockList) {
            this.notificationManager.displayNotification(MESSAGES.PLEASE_SELECT_BLOCK_LIST, 'error');
            return null;
        }
        return selectedBlockList;
    }

    /**
     * Checks if the user is already blocked in any of the provided list URIs.
     */
    private async isAlreadyBlocked(
        userHandle: string,
        activeListUris: string[]
    ): Promise<boolean> {
        return await this.blockedUsersService.isUserBlocked(userHandle, [activeListUris[0]]);
    }

    /**
     * Orchestrates the block flow (optimistic UI, API call, notifications).
     */
    private async blockUserFlow(
        userHandle: string,
        listUri: string,
        alreadyBlocked: boolean
    ): Promise<void> {
        if (alreadyBlocked) {
            Logger.debug(`User ${userHandle} is already blocked. Skipping re-block.`);
            return;
        }

        // 1) Optimistic UI
        this.debugLog(`Optimistic block -> ${userHandle}`);
        const tempItem = { subject: { handle: userHandle, did: '' }, uri: 'pending' };
        this.blockedUsersService.emit('blockedUserAdded', tempItem);

        // 2) API call
        this.debugLog(`Calling blueskyService.blockUser(...) for ${userHandle}`);
        const response = await this.blueskyService.blockUser(userHandle, listUri);
        if (!response) throw new Error(ERRORS.UNKNOWN_ERROR);

        // 3) Update in memory + notify
        this.debugLog(`API returned success for blocking ${userHandle}. Updating...`);
        await this.blockedUsersService.addBlockedUserFromResponse(response, userHandle, listUri);
        await this.onUserBlocked(userHandle);

        // 4) Notification
        Logger.time('getBlockListName');
        const selectedBlockListName = await this.blueskyService.getBlockListName(listUri);
        Logger.timeEnd('getBlockListName');
        this.notificationManager.displayNotification(
            MESSAGES.USER_BLOCKED_SUCCESS(userHandle, selectedBlockListName),
            'success'
        );
    }

    /**
     * Orchestrates the unblock flow (API call, remove from data, notifications).
     */
    private async unblockUserFlow(
        userHandle: string,
        listUri: string,
        alreadyBlocked: boolean
    ): Promise<void> {
        if (!alreadyBlocked) {
            Logger.debug(`User ${userHandle} is not blocked. Skipping unblock.`);
            return;
        }

        this.debugLog(`Calling removeBlockedUser(...) for ${userHandle}`);
        await this.blockedUsersService.removeBlockedUser(userHandle, listUri);

        this.notificationManager.displayNotification(
            MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle),
            'success'
        );
        await this.onUserUnblocked(userHandle);
    }

    /**
     * Final cleanup to re-enable UI and stop performance tracking.
     */
    private finalizeBlockAction(blockButton: Button, userHandle: string): void {
        Logger.timeEnd(`handleBlockUser: ${userHandle}`);
        blockButton.setDisabled(false);
        blockButton.removeClasses('loading');
    }
}
