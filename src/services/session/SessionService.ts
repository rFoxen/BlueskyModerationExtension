import { BskyAgent } from '@atproto/api';
import { STORAGE_KEYS, ERRORS } from '@src/constants/Constants';
import { AuthenticationError } from '../errors/CustomErrors';
import { ErrorService } from '../errors/ErrorService';

interface BskySessionData {
    accessJwt: string;
    refreshJwt?: string;
    handle?: string;
    // OPTIONAL: If you store expiration timestamps in your session, e.g.:
    // expiresAt?: number; // a timestamp in ms
    // or exp?: number;    // typical JWT exp in seconds
}

/**
 * Manages session, handling login, logout, and session refresh logic.
 */
export class SessionService {
    private agent: BskyAgent;
    private errorService: ErrorService;

    constructor(agent: BskyAgent, errorService: ErrorService) {
        this.agent = agent;
        this.errorService = errorService;
    }

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

    public async login(username: string, password: string): Promise<boolean> {
        try {
            await this.agent.login({ identifier: username, password });
            return true;
        } catch (error) {
            return false;
        }
    }

    public async logout(): Promise<boolean> {
        try {
            await this.agent.logout();
            // Clear local storage on logout
            localStorage.removeItem(STORAGE_KEYS.BLUESKY_SESSION);
            return true;
        } catch (error) {
            return false;
        }
    }

    public isLoggedIn(): boolean {
        return !!this.agent.session;
    }

    public getLoggedInUsername(): string | null {
        return this.agent.session?.handle || null;
    }

    /**
     * Called when the session or token changes, so we persist it.
     */
    public persistSession(evt: string, session?: any): void {
        if (session) {
            localStorage.setItem(STORAGE_KEYS.BLUESKY_SESSION, JSON.stringify(session));
        } else {
            localStorage.removeItem(STORAGE_KEYS.BLUESKY_SESSION);
        }
    }

    /**
     * Attempt to refresh the session if refreshJwt is present.
     * Returns true if refresh succeeded, false otherwise.
     */
    public async tryRefreshSession(): Promise<boolean> {
        if (!this.agent.session?.refreshJwt) return false;
        try {
            // BskyAgent doesn't provide an official "refreshSession" method publicly,
            // but we can call .sessionManager.refreshSession().
            await (this.agent as any).sessionManager.refreshSession();
            // If we got here, refresh was successful. Persist new session data.
            if (this.agent.session) {
                localStorage.setItem(
                    STORAGE_KEYS.BLUESKY_SESSION,
                    JSON.stringify(this.agent.session)
                );
            }
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if the user is authenticated; if not, throw.
     */
    public ensureAuthenticated(): void {
        if (!this.isLoggedIn()) {
            throw this.errorService.createAuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        }
    }

    /**
     * Checks if token is near or past expiry; if so, tries to refresh first.
     * If refresh fails, we throw an authentication error to force re-login.
     */
    public async ensureAccessTokenFresh(): Promise<void> {
        this.ensureAuthenticated();

        // Example of reading typical "exp" property if stored. Adjust to your session structure:
        const session = this.agent.session as BskySessionData | undefined;
        if (!session || !session.accessJwt) {
            throw this.errorService.createAuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        }

        // If you are storing "exp" or "expiresAt" in the session, let's parse it:
        // For demonstration, let's assume we store 'exp' in the session in seconds (JWT style).
        // If not, you might not be able to do a local check. 
        const decoded = parseJwt(session.accessJwt); // see parseJwt helper below
        if (!decoded || !decoded.exp) {
            // If we can't parse or no exp in the token, we skip the local check
            // and rely on server 401 handling. Or attempt refresh anyway.
            return;
        }

        // exp is in seconds, let's compare to current time in seconds
        const now = Math.floor(Date.now() / 1000);
        const delta = decoded.exp - now;

        // For example, refresh if token expires in the next 60 seconds
        if (delta < 60) {
            // Attempt a refresh
            const refreshed = await this.tryRefreshSession();
            if (!refreshed) {
                throw this.errorService.createAuthenticationError(ERRORS.SESSION_EXPIRED);
            }
        }
    }

    public getAgent(): BskyAgent {
        return this.agent;
    }
}

/**
 * A small utility to parse JWT without verifying signature.
 * This just splits the token and decodes base64 to get the payload.
 */
function parseJwt(jwt: string): any | null {
    try {
        const [, payload] = jwt.split('.');
        if (!payload) return null;
        // decode base64
        const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decodedPayload);
    } catch {
        return null;
    }
}
