// AccountFreshnessManager.ts
import { BlueskyService } from '@src/services/BlueskyService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { LABELS, ERRORS } from '@src/constants/Constants';
import Logger from '@src/utils/logger/Logger';

/**
 * Interface to represent the posts per time unit.
 */
interface PostsPerTime {
    formatted: string;
    value: number;
    unit: string;
}

export class AccountFreshnessManager {
    private readonly blueskyService: BlueskyService;
    private readonly notificationManager: NotificationManager;

    private static readonly COLORS = {
        BRAND_NEW: 'darkred',
        VERY_NEW: 'red',
        NEW: 'orange',
        RECENT: 'gold',
        ESTABLISHED: 'yellow',
        EXPERIENCED: 'lightgreen',
        MATURE: 'green',
        VERY_OLD: 'darkgreen',
        LEGENDARY: 'blue',
        UNKNOWN: 'gray',
        BOT: '#ff69b4', // Additional color for bots
    };

    // Mapping of time units to their abbreviations
    private static readonly UNIT_ABBREVIATIONS: { [key: string]: string } = {
        year: 'yr',
        month: 'mo',
        week: 'wk',
        day: 'd',
        hour: 'hr',
        minute: 'min',
        second: 'sec',
    };

    // Define time unit thresholds in milliseconds
    private static readonly TIME_THRESHOLDS = [
        { unit: 'year', milliseconds: 365 * 24 * 60 * 60 * 1000 },
        { unit: 'month', milliseconds: 30 * 24 * 60 * 60 * 1000 },
        { unit: 'week', milliseconds: 7 * 24 * 60 * 60 * 1000 },
        { unit: 'day', milliseconds: 24 * 60 * 60 * 1000 },
        { unit: 'hour', milliseconds: 60 * 60 * 1000 },
        { unit: 'minute', milliseconds: 60 * 1000 },
        { unit: 'second', milliseconds: 1000 },
    ];

    // Define ppt thresholds based on unit to identify potential bots
    private static readonly PPT_THRESHOLDS: { [key: string]: number } = {
        yr: 864000,   // 864,000 p/yr
        mo: 72000,    // 72,000 p/mo
        wk: 16800,    // 16,800 p/wk
        d: 2400,      // 2,400 p/d
        hr: 100,      // 100 p/hr
        min: 20,      // 20 p/min
        s: 1,         // 1 p/s
    };

    // Define minimum and maximum posts per time unit for meaningful metrics
    private static readonly MIN_POSTS_PER_UNIT = 1;
    private static readonly MAX_POSTS_PER_UNIT = 100; // Increased from 10 for flexibility

    constructor(blueskyService: BlueskyService, notificationManager: NotificationManager) {
        this.blueskyService = blueskyService;
        this.notificationManager = notificationManager;
    }

    /**
     * Displays account freshness information in the specified HTML element.
     * @param element The HTML element to update.
     * @param profileHandle The handle of the user profile to fetch.
     */
    public async displayAccountFreshness(element: HTMLElement, profileHandle: string): Promise<void> {
        try {
            const profile = await this.blueskyService.getAccountProfile(profileHandle);

            if (profile?.creationDate) {
                this.populateAccountFreshness(element, profile.creationDate, profile.postsCount);
            } else {
                this.setUnknownAccountFreshness(element);
            }
        } catch (error) {
            this.handleError(element, profileHandle, error);
        }
    }

    /**
     * Populates the element with account freshness details.
     * @param element The HTML element to update.
     * @param creationDate The account creation date.
     * @param postsCount The number of posts.
     */
    private populateAccountFreshness(element: HTMLElement, creationDate: Date, postsCount: number | null): void {
        const daysSinceCreation = this.calculateDaysSince(creationDate);
        const postsPerTimeObj = this.calculatePostsPerTime(creationDate, postsCount);
        const postsPerTime = postsPerTimeObj?.formatted || 'Posts per time: N/A';
        const postsPerUnit = postsPerTimeObj?.value || 0;
        const unit = postsPerTimeObj?.unit || '';

        const freshnessColor = this.determineFreshnessColor(daysSinceCreation, postsPerUnit, unit);

        // Specify the number of units to display here
        const maxUnits = 2;

        const accountAge = this.formatAccountAge(creationDate, maxUnits);
        const postCount = this.formatPostCount(postsCount);

        element.textContent = LABELS.ACCOUNT_FRESHNESS(
            accountAge,
            postCount,
            postsPerTime
        );
        element.style.color = freshnessColor;
    }

    /**
     * Determines the freshness color based on account age and posts per time unit.
     * @param days The account age in days.
     * @param postsPerUnit The number of posts per time unit.
     * @param unit The time unit abbreviation.
     * @returns The color representing freshness.
     */
    private determineFreshnessColor(days: number, postsPerUnit: number, unit: string): string {
        // Base color based on account age
        let baseColor: string;

        if (days < 1) baseColor = AccountFreshnessManager.COLORS.BRAND_NEW;
        else if (days < 7) baseColor = AccountFreshnessManager.COLORS.VERY_NEW;
        else if (days < 30) baseColor = AccountFreshnessManager.COLORS.NEW;
        else if (days < 90) baseColor = AccountFreshnessManager.COLORS.RECENT;
        else if (days < 180) baseColor = AccountFreshnessManager.COLORS.ESTABLISHED;
        else if (days < 365) baseColor = AccountFreshnessManager.COLORS.EXPERIENCED;
        else if (days < 730) baseColor = AccountFreshnessManager.COLORS.MATURE;
        else if (days < 1095) baseColor = AccountFreshnessManager.COLORS.VERY_OLD;
        else baseColor = AccountFreshnessManager.COLORS.LEGENDARY;

        // If unit is empty, it signifies low activity; keep base color
        if (unit === '') {
            return baseColor;
        }

        // Retrieve the threshold for the current unit
        const threshold = AccountFreshnessManager.PPT_THRESHOLDS[unit] || 1; // Default to 1 if unit not found

        // If ppt exceeds threshold, adjust color to indicate potential bot
        if (postsPerUnit > threshold) {
            return AccountFreshnessManager.COLORS.BOT;
        }

        return baseColor;
    }

    /**
     * Calculates the number of days since a given date.
     * @param date The date to calculate from.
     * @returns The number of days since the date.
     */
    private calculateDaysSince(date: Date): number {
        const now = Date.now();
        return Math.max(0, Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24)));
    }

    /**
     * Formats the account age as a concise, human-readable string with abbreviations.
     * @param creationDate The account creation date.
     * @param maxUnits The maximum number of time units to display.
     * @returns A string describing the account's age with abbreviations.
     */
    private formatAccountAge(creationDate: Date, maxUnits: number = 2): string {
        const now = new Date();
        let diff = now.getTime() - creationDate.getTime(); // in milliseconds

        const parts: string[] = [];

        for (const { unit, milliseconds } of AccountFreshnessManager.TIME_THRESHOLDS) {
            if (diff >= milliseconds) {
                const value = Math.floor(diff / milliseconds);
                parts.push(`${value} ${AccountFreshnessManager.UNIT_ABBREVIATIONS[unit]}`);
                diff -= value * milliseconds;
                if (parts.length === maxUnits) break;
            }
        }

        // If no units are added (i.e., all zero), default to seconds
        if (parts.length === 0) {
            parts.push(`0 ${AccountFreshnessManager.UNIT_ABBREVIATIONS['second']}`);
        }

        return parts.join(', ') + ' old';
    }

    /**
     * Formats the number of posts.
     * @param postsCount The number of posts.
     * @returns A string representing the post count.
     */
    private formatPostCount(postsCount: number | null): string {
        if (postsCount === null || postsCount < 0) {
            return ERRORS.POST_COUNT_ERROR;
        }
        return `${postsCount} post${postsCount === 1 ? '' : 's'}`;
    }

    /**
     * Calculates the number of posts per relevant time unit based on account age.
     * @param creationDate The account creation date.
     * @param postsCount The total number of posts.
     * @returns An object containing the formatted string, numeric value, and unit.
     */
    private calculatePostsPerTime(creationDate: Date, postsCount: number | null): PostsPerTime | null {
        if (postsCount === null || postsCount <= 0) {
            return null;
        }

        const now = new Date();
        const diffMilliseconds = now.getTime() - creationDate.getTime();

        for (const { unit, milliseconds } of AccountFreshnessManager.TIME_THRESHOLDS) {
            if (diffMilliseconds >= milliseconds) {
                const postsPerUnit = postsCount / (diffMilliseconds / milliseconds);

                if (
                    postsPerUnit >= AccountFreshnessManager.MIN_POSTS_PER_UNIT &&
                    postsPerUnit < AccountFreshnessManager.MAX_POSTS_PER_UNIT
                ) {
                    return {
                        formatted: `${postsPerUnit.toFixed(2)} p/${AccountFreshnessManager.UNIT_ABBREVIATIONS[unit]}`,
                        value: postsPerUnit,
                        unit: AccountFreshnessManager.UNIT_ABBREVIATIONS[unit],
                    };
                }
            }
        }

        // If no appropriate unit found, provide a meaningful message
        return {
            formatted: 'Low activity',
            value: 0,
            unit: '',
        };
    }

    /**
     * Updates the element to display unknown freshness information.
     * @param element The HTML element to update.
     */
    private setUnknownAccountFreshness(element: HTMLElement): void {
        element.textContent = LABELS.ACCOUNT_FRESHNESS_UNKNOWN;
        element.style.color = AccountFreshnessManager.COLORS.UNKNOWN;
    }

    /**
     * Logs an error and displays an error message in the element.
     * @param element The HTML element to update.
     * @param profileHandle The profile handle associated with the error.
     * @param error The error that occurred.
     */
    private handleError(element: HTMLElement, profileHandle: string, error: unknown): void {
        Logger.error(ERRORS.FAILED_TO_LOAD_FRESHNESS_DATA(profileHandle), error);
        element.textContent = ERRORS.ACCOUNT_FRESHNESS_ERROR;
        element.style.color = AccountFreshnessManager.COLORS.UNKNOWN;
    }

    /**
     * Cleans up resources if needed.
     */
    public destroy(): void {
        // Placeholder for cleanup logic.
    }
}
