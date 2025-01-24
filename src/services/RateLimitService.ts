export class RateLimitService {
    private limit: number | null = null;
    private remaining: number | null = null;
    private reset: number | null = null;
    private static GRACE_PERIOD_MS = 1000;

    public updateRateLimit(headers: { [key: string]: string }): void {
        this.limit = headers['ratelimit-limit'] ? parseInt(headers['ratelimit-limit'], 10) : null;
        this.remaining = headers['ratelimit-remaining'] ? parseInt(headers['ratelimit-remaining'], 10) : null;
        this.reset = headers['ratelimit-reset'] ? parseInt(headers['ratelimit-reset'], 10) : null;
    }

    public canMakeRequest(): boolean {
        if (this.remaining === null) return false; // Assume disallowed
        return this.remaining >= 3; // 3 is the maximum credits used.
    }

    public timeUntilReset(): number {
        if (this.reset === null) return 0;
        const currentTime = Math.floor(Date.now() / 1000);
        const waitTime = this.reset > currentTime ? (this.reset - currentTime) * 1000 : 0;
        // Subtract the grace period to prevent premature retries
        return Math.max(waitTime - RateLimitService.GRACE_PERIOD_MS, 0);
    }

    // Additional methods as needed
}
