import { Button } from '@src/components/common/Button';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { UserReporter } from '@src/components/reporting/UserReporter';
import { LABELS, ARIA_LABELS, MESSAGES, ERRORS } from '@src/constants/Constants';
import { PostActionButtonsFactory } from './PostActionButtonsFactory';

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
                    this.blockedUsersService.removeBlockedUser(userHandle, selectedBlockList);
                    this.notificationManager.displayNotification(
                        MESSAGES.USER_UNBLOCKED_SUCCESS(userHandle),
                        'success'
                    );
                } else {
                    throw new Error(ERRORS.UNKNOWN_ERROR);
                }
            }
        } catch (error) {
            console.error(`Error blocking/unblocking user "${userHandle}":`, error);
            this.notificationManager.displayNotification(ERRORS.FAILED_TO_BLOCK_USER, 'error');
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
