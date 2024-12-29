import { BskyAgent } from '@atproto/api';
import { STORAGE_KEYS, ERRORS } from '@src/constants/Constants';
import { AuthenticationError } from '../errors/CustomErrors';
import { ErrorService } from '../errors/ErrorService';

/**
 * SessionService manages user session: login, logout, token storage, refresh logic, etc.
 */
export class SessionService {
    private agent: BskyAgent;
    private errorService: ErrorService;

    constructor(agent: BskyAgent, errorService: ErrorService) {
        this.agent = agent;
        this.errorService = errorService;
    }

    /**
     * Loads session data from localStorage (or another store) and resumes it if found.
     */
    public resumeSessionFromStorage(): void {
        const sessionData = localStorage.getItem(STORAGE_KEYS.BLUESKY_SESSION);
        if (sessionData) {
            try {
                const parsed = JSON.parse(sessionData);
                this.agent.resumeSession(parsed);
            } catch {
                // If invalid, clear localStorage data
                localStorage.removeItem(STORAGE_KEYS.BLUESKY_SESSION);
            }
        }
    }

    /**
     * Logs in the user with the given credentials. Persists session if successful.
     */
    public async login(username: string, password: string): Promise<boolean> {
        try {
            await this.agent.login({ identifier: username, password });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Logs out the current user. Also clears local storage session data.
     */
    public async logout(): Promise<boolean> {
        try {
            await this.agent.logout();
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Checks if there is a valid session in memory (agent).
     */
    public isLoggedIn(): boolean {
        return !!this.agent.session;
    }

    /**
     * Returns the currently logged in username (handle) or null.
     */
    public getLoggedInUsername(): string | null {
        return this.agent.session?.handle || null;
    }

    /**
     * Called by BskyAgent persistSession to save or remove session data
     * in localStorage automatically.
     */
    public persistSession(evt: string, session?: any): void {
        if (session) {
            localStorage.setItem(STORAGE_KEYS.BLUESKY_SESSION, JSON.stringify(session));
        } else {
            localStorage.removeItem(STORAGE_KEYS.BLUESKY_SESSION);
        }
    }

    /**
     * Attempt to refresh session using the agent's session manager, if available.
     */
    public async tryRefreshSession(): Promise<boolean> {
        if (!this.agent.session?.refreshJwt) return false;
        try {
            await (this.agent as any).sessionManager.refreshSession();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Throws an AuthenticationError if there is no valid session.
     */
    public ensureAuthenticated(): void {
        if (!this.isLoggedIn()) {
            throw this.errorService.createAuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        }
    }

    public getAgent(): BskyAgent {
        return this.agent;
    }
}
