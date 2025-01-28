import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { MESSAGES, LABELS, ERRORS } from '@src/constants/Constants';
import Logger from '@src/utils/logger/Logger';

export class UserReporter {
    private notificationManager: NotificationManager;
    private blockedUsersService: BlockedUsersService;
    private isLoggedIn: () => boolean;

    constructor(
        notificationManager: NotificationManager,
        blockedUsersService: BlockedUsersService,
        isLoggedIn: () => boolean
    ) {
        this.notificationManager = notificationManager;
        this.blockedUsersService = blockedUsersService;
        this.isLoggedIn = isLoggedIn;
    }

    /**
     * Initiates the user reporting process.
     * @param profileHandle - The handle of the user to report.
     */
    public async reportUser(profileHandle: string): Promise<void> {
        try {
            await this.handleReportUser(profileHandle);
        } catch (error) {
            Logger.error('Error handling report user:', error);
            this.notificationManager.displayNotification(
                ERRORS.FAILED_TO_REPORT_USER,
                'error'
            );
        }
    }

    /**
     * Handles the internal logic of reporting a user.
     * @param profileHandle - The handle of the user to report.
     */
    private async handleReportUser(profileHandle: string): Promise<void> {
        if (!this.isLoggedIn()) {
            this.notificationManager.displayNotification(
                MESSAGES.LOGIN_REQUIRED_TO_REPORT_USERS,
                'error'
            );
            return;
        }

        try {
            const reasonTypes = [
                { code: 'com.atproto.moderation.defs#reasonSpam', label: 'Spam' },
                { code: 'com.atproto.moderation.defs#reasonViolation', label: 'Violation' },
                { code: 'com.atproto.moderation.defs#reasonMisleading', label: 'Misleading' },
                { code: 'com.atproto.moderation.defs#reasonSexual', label: 'Sexual Content' },
                { code: 'com.atproto.moderation.defs#reasonRude', label: 'Rude Behavior' }
            ];

            const reasonOptions = reasonTypes
                .map((r, index) => `${index + 1}. ${r.label}`)
                .join('\n');
            const reasonInput = prompt(`${MESSAGES.PROMPT_REPORT_REASON}\n${reasonOptions}`);
            if (!reasonInput) {
                this.notificationManager.displayNotification(MESSAGES.REPORT_CANCELLED, 'info');
                return;
            }

            const reasonIndex = parseInt(reasonInput.trim(), 10) - 1;
            if (reasonIndex < 0 || reasonIndex >= reasonTypes.length) {
                this.notificationManager.displayNotification(MESSAGES.INVALID_REPORT_SELECTION, 'error');
                return;
            }

            const selectedReasonType = reasonTypes[reasonIndex];
            const userDid = await this.blockedUsersService.resolveDidFromHandle(profileHandle);
            const additionalComments = prompt(LABELS.PROMPT_ADDITIONAL_COMMENTS) || '';

            const reportPayload = {
                reason: additionalComments,
                reasonType: selectedReasonType.code,
                subject: {
                    $type: "com.atproto.admin.defs#repoRef",
                    did: userDid
                }
            };

            await this.blockedUsersService.reportAccount(userDid, selectedReasonType.code, additionalComments);
            this.notificationManager.displayNotification(
                MESSAGES.USER_REPORTED_SUCCESS(profileHandle),
                'success'
            );
        } catch (error) {
            Logger.error('Error reporting user:', error);
            this.notificationManager.displayNotification(
                ERRORS.FAILED_TO_REPORT_USER,
                'error'
            );
        }
    }

    public destroy(): void {
        // Implement if any cleanup is necessary
    }
}
