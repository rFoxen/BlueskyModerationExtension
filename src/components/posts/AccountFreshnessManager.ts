import { BlueskyService } from '@src/services/BlueskyService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { LABELS, ERRORS } from '@src/constants/Constants';

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
                const diffInDays = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));

                const accountAgeText =
                    diffInDays < 30
                        ? `${diffInDays} day${diffInDays !== 1 ? 's' : ''} old`
                        : `${Math.floor(diffInDays / 30)} month${Math.floor(diffInDays / 30) !== 1 ? 's' : ''} old`;

                const postCountText =
                    postsCount !== null ? `${postsCount} post${postsCount !== 1 ? 's' : ''}` : 'Unknown posts count';

                element.textContent = `Account age: ${accountAgeText}, ${postCountText}`;
                element.style.color = this.getFreshnessColor(diffInDays);
            } else {
                element.textContent = 'Account age: Unknown, posts count: Unknown';
                element.style.color = 'gray';
            }
        } catch (error) {
            console.error(`Error fetching account freshness for ${profileHandle}:`, error);
            element.textContent = 'Account age: Error, posts count: Error';
            element.style.color = 'gray';
        }
    }

    private getFreshnessColor(diffInDays: number): string {
        // Example logic to determine color based on account age
        if (diffInDays < 7) return 'red'; // Very new
        if (diffInDays < 30) return 'orange'; // New
        if (diffInDays < 365) return 'yellow'; // Established
        return 'green'; // Old
    }

    public destroy(): void {
        // Implement if any cleanup is necessary
    }
}
