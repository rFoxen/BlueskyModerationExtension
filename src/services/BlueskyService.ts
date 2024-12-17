import {APP_BSKY_GRAPH, AppBskyGraphDefs, BskyAgent} from '@atproto/api';
import { EventEmitter } from '@src/utils/events/EventEmitter';
import { IBlueskyService } from '@src/services/interfaces/IBlueskyService';
import { API_ENDPOINTS, ERRORS, STORAGE_KEYS } from '@src/constants/Constants';
import { encodeURIComponentSafe } from '@src/utils/encodeURIComponent';
import { sanitizeHTML } from '@src/utils/sanitize';

/**
 * Custom Error Classes for better error handling.
 */
class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

class APIError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = 'APIError';
    }
}

/**
 * BlueskyService handles interactions with the Bluesky API.
 */
export class BlueskyService extends EventEmitter implements IBlueskyService {
    private agent: BskyAgent;
    private didToHandleCache: Map<string, string> = new Map();
    private handleToDidCache: Map<string, string> = new Map();

    constructor(sessionData: any = null) {
        super();
        this.agent = new BskyAgent({
            service: API_ENDPOINTS.SERVICE,
            persistSession: this.handleSession.bind(this),
        });

        if (sessionData) {
            this.agent.resumeSession(sessionData);
        } else {
            const savedSession = this.loadSessionData();
            if (savedSession) {
                this.agent.resumeSession(savedSession);
            }
        }
    }

    /**
     * Handles session persistence.
     */
    private handleSession(evt: string, session?: any): void {
        if (session) {
            localStorage.setItem(STORAGE_KEYS.BLUESKY_SESSION, JSON.stringify(session));
        } else {
            localStorage.removeItem(STORAGE_KEYS.BLUESKY_SESSION);
        }
        this.emit('sessionUpdated', this.agent.session);
    }

    /**
     * Loads session data from localStorage.
     */
    private loadSessionData(): any {
        const sessionData = localStorage.getItem(STORAGE_KEYS.BLUESKY_SESSION);
        return sessionData ? JSON.parse(sessionData) : null;
    }

    public isLoggedIn(): boolean {
        return !!this.agent.session;
    }

    public getLoggedInUsername(): string | null {
        return this.agent.session?.handle || null;
    }

    public async login(username: string, password: string): Promise<boolean> {
        try {
            await this.agent.login({ identifier: username, password });
            return true;
        } catch (error) {
            this.emit('loginFailed', error);
            return false;
        }
    }

    public async logout(): Promise<boolean> {
        try {
            await this.agent.logout();
            return true;
        } catch (error) {
            this.emit('logoutFailed', error);
            return false;
        }
    }

    public async getBlockLists(): Promise<AppBskyGraphDefs.ListView[]> {
        if (!this.agent.session) return [];
        try {
            const response = await this.fetchWithAuth(`${API_ENDPOINTS.GET_LISTS}?actor=${encodeURIComponent(this.agent.session.did)}`);
            return response.lists.filter((list: AppBskyGraphDefs.ListView) => list.purpose === APP_BSKY_GRAPH.DefsModlist);
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCK_LISTS);
            return [];
        }
    }

    public async getBlockListName(listUri: string): Promise<string> {
        if (!this.agent.session) return '';
        try {
            const response = await this.fetchWithAuth(`${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`);
            return response.list.name || 'Unnamed List';
        } catch (error) { 
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCK_LISTS);
            return 'Unnamed List';
        }
    }

    public async getBlockedUsers(listUri: string): Promise<any[]> {
        if (!this.agent.session) return [];
        try {
            let items: any[] = [];
            let cursor: string | null = null;
            const MAX_LIMIT = 100;

            do {
                const url: string = `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}&limit=${MAX_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
                const response = await this.fetchWithAuth(url);
                items = items.concat(response.items || []);
                cursor = response.cursor || null;
            } while (cursor);

            return items;
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
            return [];
        }
    }

    public async resolveHandleFromDid(did: string): Promise<string> {
        if (this.didToHandleCache.has(did)) {
            return this.didToHandleCache.get(did)!;
        }
        try {
            const response = await this.fetchWithAuth(`${API_ENDPOINTS.RESOLVE_DID}?did=${encodeURIComponent(did)}`);
            if (response.handle) {
                this.didToHandleCache.set(did, response.handle);
                this.handleToDidCache.set(response.handle, did);
                return response.handle;
            } else {
                throw new NotFoundError(ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
            }
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
            throw error;
        }
    }

    public async resolveDidFromHandle(handle: string): Promise<string> {
        if (this.handleToDidCache.has(handle)) {
            return this.handleToDidCache.get(handle)!;
        }
        try {
            const response = await this.fetchWithAuth(`${API_ENDPOINTS.GET_PROFILE}?actor=${encodeURIComponent(handle)}`);
            if (response.did) {
                this.handleToDidCache.set(handle, response.did);
                this.didToHandleCache.set(response.did, handle);
                return response.did;
            } else {
                throw new NotFoundError(ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
            }
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
            throw error;
        }
    }

    public async blockUser(userHandle: string, listUri: string): Promise<any> {
        if (!this.agent.session) {
            throw new AuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        }
        try {
            const userDid = await this.resolveDidFromHandle(userHandle);
            if (userDid === this.agent.session.did) {
                throw new Error('Cannot block yourself.');
            }
            const body = {
                collection: 'app.bsky.graph.listitem',
                record: {
                    $type: 'app.bsky.graph.listitem',
                    createdAt: new Date().toISOString(),
                    list: listUri,
                    subject: userDid,
                },
                repo: this.agent.session.did,
            };
            const response = await this.fetchWithAuth(API_ENDPOINTS.CREATE_RECORD, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return response;
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_BLOCK_USER);
            throw error;
        }
    }

    public async unblockUser(userHandle: string, listUri: string): Promise<any> {
        if (!this.agent.session) {
            throw new AuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        }
        try {
            const userDid = await this.resolveDidFromHandle(userHandle);
            console.log(`Resolved DID for ${userHandle}: ${userDid}`); // Log DID
            const listResponse = await this.fetchWithAuth(`${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`);
            console.log(`Fetched block list for ${listUri}:`, listResponse); // Log block list
            const itemToDelete = listResponse.items.find((item: any) => item.subject.did === userDid);
            console.log(`Item to delete for ${userHandle}:`, itemToDelete); // Log item to delete
            if (!itemToDelete) {
                throw new NotFoundError('User is not in the block list.');
            }
            const rkey = itemToDelete.uri.split('/').pop();
            if (!rkey) {
                throw new Error('Invalid record key.');
            }
            const body = {
                collection: 'app.bsky.graph.listitem',
                repo: this.agent.session.did,
                rkey: rkey,
            };
            const response = await this.fetchWithAuth(API_ENDPOINTS.DELETE_RECORD, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            console.log(`Unblock response for ${userHandle}:`, response); // Log response
            return response;
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
            console.error(`Error unblocking user ${userHandle}:`, error); // Enhanced error logging
            throw error;
        }
    }


    public async reportAccount(userDid: string, reasonType: string, reason: string = ""): Promise<void> {
        if (!this.agent.session) {
            throw new AuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        }
        const subject = {
            $type: "com.atproto.admin.defs#repoRef",
            did: userDid,
            type: "account",
        };
        const body = {
            reason,
            reasonType,
            subject,
        };
        try {
            await this.fetchWithAuth(API_ENDPOINTS.REPORT_ACCOUNT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_REPORT_USER);
            throw error;
        }
    }

    public async getAccountProfile(userDidOrHandle: string): Promise<{ creationDate: Date | null; postsCount: number | null }> {
        const url = `${API_ENDPOINTS.GET_PROFILE}?actor=${encodeURIComponent(userDidOrHandle)}`;
        try {
            const profile = await this.fetchWithAuth(url, {
                method: "GET",
                headers: { "Content-Type": "application/json" },
            });
            const creationDate = profile.createdAt ? new Date(profile.createdAt) : null;
            const postsCount = profile.postsCount ?? null;
            return { creationDate, postsCount };
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
            return { creationDate: null, postsCount: null };
        }
    }

    /**
     * Centralized method for making authenticated API requests.
     */
    private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<any> {
        const accessJwt = this.agent.session?.accessJwt;
        if (!accessJwt) {
            this.emit('sessionExpired');
            throw new AuthenticationError(ERRORS.USER_NOT_AUTHENTICATED);
        }

        const authOptions: RequestInit = {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${accessJwt}`,
            },
        };

        try {
            const response = await fetch(url, authOptions);
            if (response.ok) {
                return response.json();
            }

            if (response.status === 401) {
                const refreshed = await this.tryRefreshSession();
                if (refreshed) {
                    const newAccessJwt = this.agent.session?.accessJwt;
                    if (!newAccessJwt) {
                        this.emit('sessionExpired');
                        throw new AuthenticationError(ERRORS.SESSION_EXPIRED);
                    }
                    authOptions.headers = {
                        ...authOptions.headers,
                        Authorization: `Bearer ${newAccessJwt}`,
                    };
                    const retryResponse = await fetch(url, authOptions);
                    if (retryResponse.ok) {
                        return retryResponse.json();
                    } else {
                        const errorData = await retryResponse.json().catch(() => ({ message: ERRORS.UNKNOWN_ERROR }));
                        throw new APIError(errorData.message || ERRORS.UNKNOWN_ERROR, retryResponse.status);
                    }
                } else {
                    this.emit('sessionExpired');
                    throw new AuthenticationError(ERRORS.SESSION_EXPIRED);
                }
            }

            const errorData = await response.json().catch(() => ({ message: ERRORS.UNKNOWN_ERROR }));
            throw new APIError(errorData.message || ERRORS.UNKNOWN_ERROR, response.status);
        } catch (error) {
            this.emit('error', ERRORS.UNKNOWN_ERROR);
            throw error;
        }
    }

    /**
     * Attempts to refresh the session using the refresh JWT.
     */
    private async tryRefreshSession(): Promise<boolean> {
        if (!this.agent.session?.refreshJwt) return false;
        try {
            await (this.agent as any).sessionManager.refreshSession();
            return true;
        } catch {
            return false;
        }
    }

    public destroy(): void {
        this.didToHandleCache.clear();
        this.handleToDidCache.clear();
        this.removeAllListeners();
        // Additional cleanup if necessary
    }
}
