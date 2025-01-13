export class RateLimitService {
    private limit: number | null = null;
    private remaining: number | null = null;
    private reset: number | null = null;

    public updateRateLimit(headers: { [key: string]: string }): void {
        this.limit = headers['ratelimit-limit'] ? parseInt(headers['ratelimit-limit'], 10) : null;
        this.remaining = headers['ratelimit-remaining'] ? parseInt(headers['ratelimit-remaining'], 10) : null;
        this.reset = headers['ratelimit-reset'] ? parseInt(headers['ratelimit-reset'], 10) : null;
    }

    public canMakeRequest(): boolean {
        if (this.remaining === null) return false; // Assume disallowed
        return this.remaining > 0;
    }

    public timeUntilReset(): number {
        if (this.reset === null) return 0;
        const currentTime = Math.floor(Date.now() / 1000);
        return this.reset > currentTime ? (this.reset - currentTime) * 1000 : 0;
    }

    // Additional methods as needed
}
