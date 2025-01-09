import { BlueskyService } from '@src/services/BlueskyService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { LABELS, ERRORS } from '@src/constants/Constants';
import Logger from '@src/utils/logger/Logger';

export class AccountFreshnessManager {
    private blueskyService: BlueskyService;
    private notificationManager: NotificationManager;

    constructor(blueskyService: BlueskyService, notificationManager: NotificationManager) {
        this.blueskyService = blueskyService;
        this.notificationManager = notificationManager;
    }

    public async displayAccountFreshness(element: HTMLElement, profileHandle: string): Promise<void> {
        try {
            const { creationDate, postsCount } = await this.blueskyService.getAccountProfile(profileHandle);
            if (creationDate) {
                const now = new Date();
                const diffInMilliseconds = now.getTime() - creationDate.getTime();
                const diffInSeconds = Math.floor(diffInMilliseconds / 1000);
                const diffInMinutes = Math.floor(diffInSeconds / 60);
                const diffInHours = Math.floor(diffInMinutes / 60);
                const diffInDays = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));

                let accountAgeText = '';
                if (diffInSeconds < 60) {
                    accountAgeText = `${diffInSeconds} sec${diffInSeconds !== 1 ? 's' : ''} old`;
                } else if (diffInMinutes < 60) {
                    accountAgeText = `${diffInMinutes} min${diffInMinutes !== 1 ? 's' : ''} old`;
                } else if (diffInHours < 24) {
                    accountAgeText = `${diffInHours} hour${diffInHours !== 1 ? 's' : ''} old`;
                } else if (diffInDays < 30) {
                    accountAgeText = `${diffInDays} day${diffInDays !== 1 ? 's' : ''} old`;
                } else {
                    const diffInMonths = Math.floor(diffInDays / 30);
                    accountAgeText = `${diffInMonths} month${diffInMonths !== 1 ? 's' : ''} old`;
                }

                const postCountText =
                    postsCount !== null ? `${postsCount} post${postsCount !== 1 ? 's' : ''}` : ERRORS.POST_COUNT_ERROR;

                element.textContent = LABELS.ACCOUNT_FRESHNESS(accountAgeText, postCountText);
                element.style.color = this.getFreshnessColor(diffInDays);
            } else {
                element.textContent = LABELS.ACCOUNT_FRESHNESS_UNKNOWN;
                element.style.color = 'gray';
            }
        } catch (error) {
            Logger.error(ERRORS.FAILED_TO_LOAD_FRESHNESS_DATA(profileHandle), error);
            element.textContent = ERRORS.ACCOUNT_FRESHNESS_ERROR;
            element.style.color = 'gray';
        }
    }

    private getFreshnessColor(diffInDays: number): string {
        // Example logic to determine color based on account age
        if (diffInDays < 1) return 'red'; // Very new (less than a day)
        if (diffInDays < 7) return 'orange'; // New (1-6 days)
        if (diffInDays < 30) return 'yellow'; // Established (7-29 days)
        if (diffInDays < 365) return 'lightgreen'; // Mature (1-11 months)
        return 'green'; // Very old (1+ years)
    }

    public destroy(): void {
        // Implement if any cleanup is necessary
    }
}
