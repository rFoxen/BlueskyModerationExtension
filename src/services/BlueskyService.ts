import { BskyAgent } from '@atproto/api';
import { IBlueskyService } from '@src/services/interfaces/IBlueskyService';
import { API_ENDPOINTS, ERRORS } from '@src/constants/Constants';
import { AppBskyGraphDefs } from '@atproto/api';

import { SessionService } from '@src/services/session/SessionService';
import { ApiService } from '@src/services/api/ApiService';
import { CacheService } from '@src/services/cache/CacheService';
import { ErrorService } from '@src/services/errors/ErrorService';
import { EventService } from '@src/services/events/EventService';

import { AuthenticationError, NotFoundError } from '@src/services/errors/CustomErrors';
import { FetchListResponse, BlockedUser } from 'types/ApiResponses';

/**
 * BlueskyService is now a facade that implements IBlueskyService,
 * delegating responsibilities to the smaller, focused services.
 */
export class BlueskyService extends EventService implements IBlueskyService {
    private sessionService: SessionService;
    private apiService: ApiService;
    private cacheService: CacheService;
    private errorService: ErrorService;

    constructor() {
        super();
        // 1) Create an ErrorService instance
        this.errorService = new ErrorService();

        // 2) Create the underlying BskyAgent
        const agent = new BskyAgent({
            service: API_ENDPOINTS.SERVICE,
            // Tell agent how to persist session
            persistSession: this.handlePersistSession.bind(this),
        });

        // 3) SessionService manages session logic
        this.sessionService = new SessionService(agent, this.errorService);
        // Attempt to resume any stored session from localStorage
        this.sessionService.resumeSessionFromStorage();

        // 4) Create ApiService that uses SessionService + ErrorService
        this.apiService = new ApiService(this.sessionService, this.errorService);

        // 5) Create CacheService for DID <-> Handle caching
        this.cacheService = new CacheService();
    }

    /**
     * Hooked into BskyAgent's persistSession. We emit 'sessionUpdated'
     * whenever a session is saved or cleared.
     */
    private handlePersistSession(evt: string, session?: any): void {
        this.sessionService.persistSession(evt, session);
        this.emit('sessionUpdated', session);
    }

    // -------------------
    // IBlueskyService API
    // -------------------

    public isLoggedIn(): boolean {
        return this.sessionService.isLoggedIn();
    }

    public getLoggedInUsername(): string | null {
        return this.sessionService.getLoggedInUsername();
    }

    public async login(username: string, password: string): Promise<boolean> {
        try {
            const success = await this.sessionService.login(username, password);
            if (!success) {
                this.emit('loginFailed');
                return false;
            }
            // Otherwise, successful
            return true;
        } catch (error) {
            this.emit('loginFailed', error);
            return false;
        }
    }

    public async logout(): Promise<boolean> {
        try {
            const success = await this.sessionService.logout();
            if (!success) {
                this.emit('logoutFailed');
                return false;
            }
            return true;
        } catch (error) {
            this.emit('logoutFailed', error);
            return false;
        }
    }

    public async getBlockLists(): Promise<AppBskyGraphDefs.ListView[]> {
        if (!this.sessionService.isLoggedIn()) return [];
        try {
            const agent = this.sessionService.getAgent();
            const response = await this.apiService.fetchLists(agent.session?.did!);
            // Filter modlists
            return response.lists.filter(
                (list: AppBskyGraphDefs.ListView) => list.purpose === 'app.bsky.graph.defs#modlist'
            );
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCK_LISTS);
            return [];
        }
    }

    public async getBlockListName(listUri: string): Promise<string> {
        if (!this.sessionService.isLoggedIn()) return '';
        try {
            const response = await this.apiService.fetchWithAuth(
                `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`
            );
            return response.list?.name || 'Unnamed List';
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCK_LISTS);
            return 'Unnamed List';
        }
    }

    public async getBlockedUsers(listUri: string): Promise<BlockedUser[]> {
        if (!this.sessionService.isLoggedIn()) return [];
        try {
            let items: BlockedUser[] = [];
            let cursor: string | null = null;
            const MAX_LIMIT = 100;

            do {
                const response: FetchListResponse = await this.apiService.fetchList(listUri, cursor, MAX_LIMIT);
                items = items.concat(response.items || []);
                cursor = response.cursor || null;
            } while (cursor);

            return items;
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
            return [];
        }
    }

    public async resolveHandleFromDid(did: string): Promise<string> {
        // Check cache first
        const cachedHandle = this.cacheService.getHandleFromDid(did);
        if (cachedHandle) return cachedHandle;

        // If not found in cache, call the ApiService
        try {
            const response = await this.apiService.resolveDid(did);
            if (response.handle) {
                this.cacheService.setHandleForDid(did, response.handle);
                return response.handle;
            } else {
                throw this.errorService.createNotFoundError();
            }
        } catch (error) {
            this.errorService.handleError(error as Error);
            throw error;
        }
    }

    public async resolveDidFromHandle(handle: string): Promise<string> {
        const cachedDid = this.cacheService.getDidFromHandle(handle);
        if (cachedDid) return cachedDid;

        try {
            const response = await this.apiService.resolveHandle(handle);
            if (response.did) {
                this.cacheService.setHandleForDid(response.did, handle);
                return response.did;
            } else {
                throw this.errorService.createNotFoundError();
            }
        } catch (error) {
            this.errorService.handleError(error as Error);
            throw error;
        }
    }

    public async blockUser(userHandle: string, listUri: string): Promise<any> {
        this.sessionService.ensureAuthenticated();
        try {
            const userDid = await this.resolveDidFromHandle(userHandle);
            const agent = this.sessionService.getAgent();

            if (userDid === agent.session?.did) {
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
                repo: agent.session?.did,
            };
            return this.apiService.postCreateRecord(body);
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_BLOCK_USER);
            throw error;
        }
    }

    public async unblockUser(userHandle: string, listUri: string): Promise<any> {
        this.sessionService.ensureAuthenticated();
        try {
            // We try to find the correct rkey for the user in the list
            const userDid = await this.resolveDidFromHandle(userHandle);
            const listResponse = await this.apiService.fetchWithAuth(
                `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`
            );
            const itemToDelete = listResponse.items.find((item: any) => item.subject.did === userDid);
            if (!itemToDelete) {
                // not found in block list
                throw new NotFoundError('User is not in the block list.');
            }
            const rkey = this.extractRKey(itemToDelete.uri);
            if (!rkey) throw new Error('Invalid record key.');

            return this.unblockUserWithRKey(rkey, listUri);
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
            throw error;
        }
    }

    /**
     * Helper for calls that already know the `rkey`.
     */
    public async unblockUserWithRKey(rkey: string, listUri: string): Promise<any> {
        this.sessionService.ensureAuthenticated();
        try {
            const agent = this.sessionService.getAgent();
            const body = {
                collection: 'app.bsky.graph.listitem',
                repo: agent.session?.did,
                rkey,
            };
            return this.apiService.postDeleteRecord(body);
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
            throw error;
        }
    }

    public async reportAccount(userDid: string, reasonType: string, reason?: string): Promise<void> {
        this.sessionService.ensureAuthenticated();
        try {
            const subject = {
                $type: 'com.atproto.admin.defs#repoRef',
                did: userDid,
                type: 'account',
            };
            const body = { reason, reasonType, subject };
            await this.apiService.reportAccount(body);
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_REPORT_USER);
            throw error;
        }
    }

    public async getAccountProfile(userDidOrHandle: string): Promise<{ creationDate: Date | null; postsCount: number | null }> {
        try {
            const profile = await this.apiService.fetchProfile(userDidOrHandle);
            const creationDate = profile.createdAt ? new Date(profile.createdAt) : null;
            const postsCount = profile.postsCount ?? null;
            return { creationDate, postsCount };
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
            return { creationDate: null, postsCount: null };
        }
    }

    public destroy(): void {
        // Clear caches, remove event listeners, etc.
        this.cacheService = new CacheService();
        this.removeAllListeners();
    }

    // ------------
    // Helpers
    // ------------
    private extractRKey(uri: string): string | null {
        const parts = uri.split('/');
        return parts.length > 0 ? parts.pop() || null : null;
    }
}
