﻿// src/services/BlueskyService.ts
import { EventEmitter } from '@src/utils/EventEmitter';
import { APP_BSKY_GRAPH, AppBskyGraphDefs, BskyAgent } from '@atproto/api';
import { API_ENDPOINTS, ERRORS, STORAGE_KEYS } from '@src/constants/Constants';

interface FetchWithAuthOptions extends RequestInit {
    headers?: HeadersInit;
}

export class BlueskyService extends EventEmitter {
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

    private handleSession(evt: string, session?: any): void {
        if (session) {
            localStorage.setItem(STORAGE_KEYS.BLUESKY_SESSION, JSON.stringify(session));
        } else {
            localStorage.removeItem(STORAGE_KEYS.BLUESKY_SESSION);
        }
    }

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
            await this.agent.login({ identifier: username, password: password });
            return true;
        } catch {
            return false;
        }
    }

    public async logout(): Promise<boolean> {
        try {
            await this.agent.logout();
            return true;
        } catch {
            return false;
        }
    }

    public async getBlockLists(): Promise<AppBskyGraphDefs.ListView[]> {
        if (!this.agent.session) return [];
        const response = await this.fetchWithAuth(`${API_ENDPOINTS.GET_LISTS}?actor=${encodeURIComponent(this.agent.session.did)}`);
        return response.lists.filter((list: AppBskyGraphDefs.ListView) => list.purpose === APP_BSKY_GRAPH.DefsModlist);
    }

    public async getBlockListName(listUri: string): Promise<string> {
        if (!this.agent.session) return '';
        const response = await this.fetchWithAuth(`${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`);
        return response.list.name || 'Unnamed List';
    }

    public async getBlockedUsers(listUri: string): Promise<any[]> {
        if (!this.agent.session) return [];
        let items: any[] = [];
        let cursor: string | null = null;
        const MAX_LIMIT = 100;

        do {
            // @ts-ignore
            const response = await this.fetchWithAuth(
                `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}&limit=${MAX_LIMIT}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
            );
            items = items.concat(response.items || []);
            cursor = response.cursor || null;
        } while (cursor);

        return items;
    }

    public async resolveHandleFromDid(did: string): Promise<string> {
        if (this.didToHandleCache.has(did)) {
            return this.didToHandleCache.get(did)!;
        }

        const response = await this.fetchWithAuth(`${API_ENDPOINTS.RESOLVE_DID}?did=${encodeURIComponent(did)}`);
        if (response.handle) {
            this.didToHandleCache.set(did, response.handle);
            this.handleToDidCache.set(response.handle, did);
            return response.handle;
        } else {
            throw new Error(ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
        }
    }

    public async resolveDidFromHandle(handle: string): Promise<string> {
        if (this.handleToDidCache.has(handle)) {
            return this.handleToDidCache.get(handle)!;
        }

        const response = await this.fetchWithAuth(`${API_ENDPOINTS.RESOLVE_HANDLE}?handle=${encodeURIComponent(handle)}`);
        if (response.did) {
            this.handleToDidCache.set(handle, response.did);
            this.didToHandleCache.set(response.did, handle);
            return response.did;
        } else {
            throw new Error('Failed to resolve DID');
        }
    }

    public async blockUser(userHandle: string, listUri: string): Promise<any> {
        if (!this.agent.session) return;
        const userDid = await this.resolveDidFromHandle(userHandle);
        if (userDid === this.agent.session.did) throw new Error('Cannot block yourself.');

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

        return this.fetchWithAuth(API_ENDPOINTS.CREATE_RECORD, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    public async unblockUser(userHandle: string, listUri: string): Promise<any> {
        if (!this.agent.session) return;
        const userDid = await this.resolveDidFromHandle(userHandle);
        const listItemsResponse = await this.fetchWithAuth(`${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`);
        const itemToDelete = listItemsResponse.items.find((item: any) => item.subject.did === userDid);
        if (!itemToDelete) {
            throw new Error('User is not in the block list.');
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

        return this.fetchWithAuth(API_ENDPOINTS.DELETE_RECORD, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    private async fetchWithAuth(url: string, options: FetchWithAuthOptions = {}): Promise<any> {
        const accessJwt = this.agent.session?.accessJwt || '';
        if (!accessJwt) throw new Error(ERRORS.USER_NOT_AUTHENTICATED);

        options.headers = {
            ...options.headers,
            Authorization: `Bearer ${accessJwt}`,
        };

        const response = await fetch(url, options);
        if (response.ok) {
            return response.json();
        }

        // If we hit a 401, try to refresh the session first
        if (response.status === 401) {
            // Attempt to refresh session
            const refreshed = await this.tryRefreshSession();
            if (refreshed) {
                // If refresh succeeded, retry the request with the new access token
                const newAccessJwt = this.agent.session?.accessJwt || '';
                if (!newAccessJwt) {
                    // Should never happen if refresh succeeded, but just in case
                    this.emit('sessionExpired');
                    throw new Error(ERRORS.SESSION_EXPIRED);
                }

                const retryOptions = {
                    ...options,
                    headers: {
                        ...options.headers,
                        Authorization: `Bearer ${newAccessJwt}`,
                    },
                };
                const retryResponse = await fetch(url, retryOptions);
                if (!retryResponse.ok) {
                    // If retry still fails, we consider it a normal error
                    const errorData = await retryResponse.json().catch(() => ({ message: ERRORS.UNKNOWN_ERROR }));
                    throw new Error(errorData.message || ERRORS.UNKNOWN_ERROR);
                }
                return retryResponse.json();
            } else {
                // Refresh failed
                this.emit('sessionExpired');
                throw new Error(ERRORS.SESSION_EXPIRED);
            }
        }

        // Handle other non-OK statuses
        const errorData = await response.json().catch(() => ({ message: ERRORS.UNKNOWN_ERROR }));
        throw new Error(errorData.message || ERRORS.UNKNOWN_ERROR);
    }

    private async tryRefreshSession(): Promise<boolean> {
        if (!this.agent.session?.refreshJwt) return false;
        try {
            // The agent exposes a method for session refresh if you've implemented it.
            await (this.agent as any).sessionManager.refreshSession();
            // If no error was thrown, refresh succeeded
            return true;
        } catch {
            // Refresh failed
            return false;
        }
    }

    public async reportAccount(userDid: string, reasonType: string, reason: string = ""): Promise<void> {
        const subject = {
            $type: "com.atproto.admin.defs#repoRef",
            did: userDid,
            type: "account",
        };

        const body = {
            reason: reason,
            reasonType: reasonType,
            subject: subject,
        };

        const result = await this.fetchWithAuth("https://bsky.social/xrpc/com.atproto.moderation.createReport", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        return result;
    }

    public destroy(): void {
        this.didToHandleCache.clear();
        this.handleToDidCache.clear();
        this.removeAllListeners();
    }
}
