// =============================== //
// src/services/BlueskyService.ts

import {APP_BSKY_GRAPH, AppBskyGraphDefs, BskyAgent,} from '@atproto/api';
import {API_ENDPOINTS, ERRORS, STORAGE_KEYS,} from '@src/constants/Constants';

interface FetchWithAuthOptions extends RequestInit {
    headers?: HeadersInit;
}

export class BlueskyService {
    private agent: BskyAgent;

    constructor(sessionData: any = null) {
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
            try {
                localStorage.setItem(
                    STORAGE_KEYS.BLUESKY_SESSION,
                    JSON.stringify(session)
                );
            } catch (error) {
                console.error(ERRORS.FAILED_TO_SAVE_SESSION, error);
            }
        } else {
            localStorage.removeItem(STORAGE_KEYS.BLUESKY_SESSION);
        }
    }

    private loadSessionData(): any {
        try {
            const sessionData = localStorage.getItem(
                STORAGE_KEYS.BLUESKY_SESSION
            );
            return sessionData ? JSON.parse(sessionData) : null;
        } catch (error) {
            console.error(ERRORS.FAILED_TO_LOAD_SESSION, error);
            return null;
        }
    }

    public isLoggedIn(): boolean {
        return !!this.agent.session;
    }

    public getLoggedInUsername(): string | null {
        return this.agent.session?.handle || null;
    }

    public async login(username: string, password: string): Promise<boolean> {
        try {
            await this.agent.login({
                identifier: username,
                password: password,
            });
            console.log('Login successful');
            return true;
        } catch (error) {
            console.error('Login failed:', error);
            return false;
        }
    }

    public async logout(): Promise<boolean> {
        try {
            await this.agent.logout();
            console.log('Logout successful');
            return true;
        } catch (error) {
            console.error('Logout failed:', error);
            return false;
        }
    }

    public async getBlockLists(): Promise<AppBskyGraphDefs.ListView[]> {
        if (!this.agent.session) return [];

        try {
            const response = await this.fetchWithAuth(
                `${API_ENDPOINTS.GET_LISTS}?actor=${encodeURIComponent(
                    this.agent.session.did
                )}`
            );

            const blockLists = response.lists.filter(
                (list: AppBskyGraphDefs.ListView) =>
                    list.purpose === APP_BSKY_GRAPH.DefsModlist
            );
            return blockLists;
        } catch (error) {
            throw error;
        }
    }

    public async getBlockListName(listUri: string): Promise<string> {
        try {
            if (!this.agent.session) return '';

            const response = await this.fetchWithAuth(
                `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`
            );

            return response.list.name || 'Unnamed List';
        } catch (error) {
            console.error('Error fetching block list name:', error);
            return 'Unnamed List';
        }
    }

    public async getBlockedUsers(listUri: string): Promise<any[]> {
        try {
            if (!this.agent.session) return [];

            let items: any[] = [];
            let cursor: string | null = null;
            const MAX_LIMIT = 100;

            do {
                // @ts-ignore
                const response = await this.fetchWithAuth(
                    `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(
                        listUri
                    )}&limit=${MAX_LIMIT}${
                        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
                    }`
                );

                items = items.concat(response.items || []);
                cursor = response.cursor || null;
            } while (cursor);

            return items;
        } catch (error) {
            console.error('Error fetching blocked users:', error);
            throw error;
        }
    }

    public async resolveHandleFromDid(did: string): Promise<string> {
        try {
            const response = await this.fetchWithAuth(
                `${API_ENDPOINTS.RESOLVE_DID}?did=${encodeURIComponent(did)}`
            );

            if (response.handle) {
                console.log(`Resolved handle for DID ${did}: ${response.handle}`);
                return response.handle;
            } else {
                throw new Error(ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
            }
        } catch (error) {
            console.error('Error resolving handle from DID:', error);
            throw error;
        }
    }

    public async blockUser(userHandle: string, listUri: string): Promise<any> {
        try {
            if (!this.agent.session) return;

            const userDid = await this.resolveDidFromHandle(userHandle);
            if (userDid === this.agent.session.did)
                throw new Error('Cannot block yourself.');

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

            const response = await this.fetchWithAuth(
                API_ENDPOINTS.CREATE_RECORD,
                {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(body),
                }
            );

            console.log(`User ${userDid} blocked on list ${listUri}.`);
            return response;
        } catch (error) {
            console.error('Error blocking user:', error);
            throw error;
        }
    }

    public async unblockUser(
        userHandle: string,
        listUri: string
    ): Promise<any> {
        try {
            if (!this.agent.session) return;

            const userDid = await this.resolveDidFromHandle(userHandle);

            const listItemsResponse = await this.fetchWithAuth(
                `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`
            );

            const listItems = listItemsResponse.items;
            const itemToDelete = listItems.find(
                (item: any) => item.subject.did === userDid
            );

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

            const response = await this.fetchWithAuth(
                API_ENDPOINTS.DELETE_RECORD,
                {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(body),
                }
            );

            console.log(`User ${userDid} unblocked from list ${listUri}.`);
            return response;
        } catch (error) {
            console.error('Error unblocking user:', error);
            throw error;
        }
    }

    public async resolveDidFromHandle(handle: string): Promise<string> {
        try {
            const response = await this.fetchWithAuth(
                `${API_ENDPOINTS.RESOLVE_HANDLE}?handle=${encodeURIComponent(
                    handle
                )}`
            );

            if (response.did) {
                console.log(`Resolved DID for @${handle}: ${response.did}`);
                return response.did;
            } else {
                throw new Error('Failed to resolve DID');
            }
        } catch (error) {
            console.error('Error resolving DID:', error);
            throw error;
        }
    }

    private async fetchWithAuth(
        url: string,
        options: FetchWithAuthOptions = {}
    ): Promise<any> {
        const accessJwt = this.agent.session?.accessJwt || '';

        if (!accessJwt) {
            throw new Error(ERRORS.USER_NOT_AUTHENTICATED);
        }

        options.headers = {
            ...options.headers,
            Authorization: `Bearer ${accessJwt}`,
        };

        let response;
        try {
            response = await fetch(url, options);
        } catch (error) {
            console.error('Network error:', error);
            throw new Error('Network error occurred.');
        }

        if (response.status === 401) {
            throw new Error(ERRORS.SESSION_EXPIRED);
        }

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = {message: ERRORS.UNKNOWN_ERROR};
            }
            throw new Error(errorData.message || ERRORS.UNKNOWN_ERROR);
        }

        return response.json();
    }

    async _reportSubject(userHandle: string, reasonType: string, subject: { $type?: string; did?: string; type: any; }, reason: string = "") {
        try {
            const body = {
                reason: reason,
                reasonType: reasonType,
                subject: subject,
            };
            await this.fetchWithAuth(
                "https://bsky.social/xrpc/com.atproto.moderation.createReport",
                {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify(body),
                }
            );
        } catch (error) {
            console.error(`Failed to report ${subject.type}:`, error);
        }
    }

    async reportAccount(userHandle: string, userDid: string, reasonType: string, reason: string = "") {
        const subject = {
            $type: "com.atproto.admin.defs#repoRef",
            did: userDid,
            type: "account",
        };
        try {
            await this._reportSubject(
                userHandle,
                reasonType,
                subject,
                reason
            );

        } catch (error) {
            console.error(`Failed to report ${subject.type}:`, error);
        }
    }
}
