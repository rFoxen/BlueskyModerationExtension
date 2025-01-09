import Logger from '@src/utils/logger/Logger';
import { BskyAgent } from '@atproto/api';
import { STORAGE_KEYS, ERRORS } from '@src/constants/Constants';
import { AuthenticationError } from '../errors/CustomErrors';
import { ErrorService } from '../errors/ErrorService';
import {EventEmitter} from "../../utils/events/EventEmitter";

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
export class SessionService extends EventEmitter {
    private agent: BskyAgent;
    private errorService: ErrorService;

    constructor(agent: BskyAgent, errorService: ErrorService) {
        super();
        this.agent = agent;
        this.errorService = errorService;
    }

    public resumeSessionFromStorage(): void {
        const sessionData = this.getSessionDataFromStorage();
        if (sessionData) {
            this.tryResumeSession(sessionData);
        }
    }

    private getSessionDataFromStorage(): string | null {
        return localStorage.getItem(STORAGE_KEYS.BLUESKY_SESSION);
    }

    private tryResumeSession(sessionData: string): void {
        try {
            const parsed = JSON.parse(sessionData);
            this.agent.resumeSession(parsed);
        } catch (error) {
            Logger.warn('Invalid session data. Clearing stored session.', error);
            this.clearSessionFromStorage();
        }
    }

    private clearSessionFromStorage(): void {
        localStorage.removeItem(STORAGE_KEYS.BLUESKY_SESSION);
    }


    public async login(username: string, password: string): Promise<boolean> {
        try {
            await this.performLogin(username, password);
            return true;
        } catch (error) {
            this.handleLoginError(error);
            return false;
        }
    }

    private async performLogin(username: string, password: string): Promise<void> {
        await this.agent.login({ identifier: username, password });
    }

    private handleLoginError(error: any): void {
        Logger.error('Login failed:', error);
        this.emit('loginFailed', error);
    }


    public async logout(): Promise<boolean> {
        try {
            await this.performLogout();
            this.clearSessionFromStorage();
            return true;
        } catch (error) {
            this.handleLogoutError(error);
            return false;
        }
    }

    private async performLogout(): Promise<void> {
        await this.agent.logout();
    }

    private handleLogoutError(error: any): void {
        Logger.error('Logout failed:', error);
        this.emit('logoutFailed', error);
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
            this.saveSessionToStorage(session);
        } else {
            this.clearSessionFromStorage();
        }
    }

    private saveSessionToStorage(session: any): void {
        try {
            const serializedSession = JSON.stringify(session);
            localStorage.setItem(STORAGE_KEYS.BLUESKY_SESSION, serializedSession);
        } catch (error) {
            Logger.error('Failed to serialize session data:', error);
            this.emit('error', ERRORS.FAILED_TO_SAVE_SESSION);
        }
    }
    
    /**
     * Attempt to refresh the session if refreshJwt is present.
     * Returns true if refresh succeeded, false otherwise.
     */
    public async tryRefreshSession(): Promise<boolean> {
        if (!this.hasRefreshToken()) return false;
        try {
            await this.refreshAgentSession();
            this.persistCurrentSession();
            return true;
        } catch (error) {
            this.handleRefreshSessionError(error);
            return false;
        }
    }

    private hasRefreshToken(): boolean {
        return !!this.agent.session?.refreshJwt;
    }

    private async refreshAgentSession(): Promise<void> {
        // Casting to any due to lack of public refreshSession method
        await (this.agent as any).sessionManager.refreshSession();
    }

    private persistCurrentSession(): void {
        if (this.agent.session) {
            try {
                const serializedSession = JSON.stringify(this.agent.session);
                localStorage.setItem(STORAGE_KEYS.BLUESKY_SESSION, serializedSession);
            } catch (error) {
                Logger.error('Failed to persist refreshed session:', error);
                this.emit('error', ERRORS.FAILED_TO_SAVE_SESSION);
            }
        }
    }

    private handleRefreshSessionError(error: any): void {
        Logger.error('Session refresh failed:', error);
        this.emit('error', ERRORS.SESSION_EXPIRED);
    }

    /**
     * Check if the user is authenticated; if not, throw.
     */
    public ensureAuthenticated(): void {
        if (!this.isLoggedIn()) {
            this.handleUnauthenticatedAccess();
        }
    }

    private handleUnauthenticatedAccess(): never {
        const error = this.errorService.createAuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        Logger.warn('Unauthenticated access attempted.');
        throw error;
    }


    /**
     * Checks if token is near or past expiry; if so, tries to refresh first.
     * If refresh fails, we throw an authentication error to force re-login.
     */
    public async ensureAccessTokenFresh(): Promise<void> {
        this.ensureAuthenticated();
        const session = this.getSessionData();
        const decodedToken = this.decodeAccessToken(session.accessJwt);
        if (decodedToken && this.shouldRefreshToken(decodedToken.exp)) {
            const refreshed = await this.tryRefreshSession();
            if (!refreshed) {
                this.handleSessionExpiry();
            }
        }
    }

    private getSessionData(): BskySessionData {
        const session = this.agent.session as BskySessionData | undefined;
        if (!session || !session.accessJwt) {
            throw this.errorService.createAuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        }
        return session;
    }

    private decodeAccessToken(token: string): any | null {
        return parseJwt(token);
    }

    private shouldRefreshToken(expiration: number): boolean {
        const now = Math.floor(Date.now() / 1000);
        const bufferTime = 60; // seconds
        return (expiration - now) < bufferTime;
    }

    private handleSessionExpiry(): never {
        const error = this.errorService.createAuthenticationError(ERRORS.SESSION_EXPIRED);
        Logger.warn('Session expired after failed refresh attempt.');
        throw error;
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
