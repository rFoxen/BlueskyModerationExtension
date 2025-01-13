import { BskyAgent } from '@atproto/api';
import { IBlueskyService } from '@src/services/interfaces/IBlueskyService';
import { API_ENDPOINTS, ERRORS } from '@src/constants/Constants';
import { AppBskyGraphDefs } from '@atproto/api';

import { SessionService } from '@src/services/session/SessionService';
import { ApiService } from '@src/services/api/ApiService';
import { CacheService } from '@src/services/cache/CacheService';
import { ErrorService } from '@src/services/errors/ErrorService';
import { EventEmitter } from '@src/utils/events/EventEmitter';

import { AuthenticationError, NotFoundError } from '@src/services/errors/CustomErrors';
import { FetchListResponse, BlockedUser } from 'types/ApiResponses';
import Logger from '@src/utils/logger/Logger';

/**
 * BlueskyService is now a facade that implements IBlueskyService,
 * delegating responsibilities to the smaller, focused services.
 */
export class BlueskyService extends EventEmitter implements IBlueskyService {
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

        // Listen to ApiService's rateLimitExceeded event and re-emit it
        this.apiService.on('rateLimitExceeded', (data: { waitTime: number }) => {
            this.emit('rateLimitExceeded', data);
        });
        
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

    /**
     * Enhanced getBlockedUsers with retry and partial data handling.
     * @param listUri The URI of the block list to fetch.
     * @param maxRetries Maximum number of retries per chunk.
     * @returns An array of BlockedUser objects.
     */
    public async getBlockedUsers(listUri: string, maxRetries: number = 3): Promise<BlockedUser[]> {
        if (!this.sessionService.isLoggedIn()) return [];
        const items: BlockedUser[] = [];
        let cursor: string | null = null;
        const MAX_LIMIT = 100;

        try {
            while (true) {
                let attempt = 0;
                let success = false;
                let response: FetchListResponse | null = null;

                // Retry mechanism for each chunk
                while (attempt < maxRetries && !success) {
                    try {
                        response = await this.apiService.fetchList(listUri, cursor, MAX_LIMIT);
                        Logger.debug(response);
                        success = true;
                    } catch (error) {
                        attempt++;
                        Logger.warn(`Attempt ${attempt} failed for cursor ${cursor}. Retrying...`);
                        if (attempt >= maxRetries) {
                            this.errorService.handleError(error as Error);
                            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
                            break; // Exit retry loop
                        }
                    }
                }

                if (!success || !response) {
                    // Exit the main loop if fetching this chunk failed after retries
                    break;
                }

                items.push(...(response.items || []));
                this.emit('blockedUsersProgress', items.length);
                
                cursor = response.cursor || null;

                if (!cursor) break; // No more pages
            }

            return items;
        } catch (error) {
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
            return items; // Return whatever has been fetched so far
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
        const did = await this.apiService.resolveHandle(handle);
        return did;
    }


    public async blockUser(userHandle: string, listUri: string): Promise<any> {
        Logger.time(`blockUser => ${userHandle}`);
        this.sessionService.ensureAuthenticated();
        try {
            Logger.debug(`blockUser: Resolving DID for handle="${userHandle}"...`);
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

            Logger.debug(`blockUser: Creating record for ${userHandle} at listUri=${listUri}`);
            // Time the actual API call
            Logger.time(`blockUser -> apiService.postCreateRecord`);
            const response = await this.apiService.postCreateRecord(body);
            Logger.timeEnd(`blockUser -> apiService.postCreateRecord`);

            return response;
        } catch (error) {
            Logger.error(`blockUser => error:`, error);
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_BLOCK_USER);
            throw error;
        } finally {
            Logger.timeEnd(`blockUser => ${userHandle}`);
        }
    }

    public async unblockUser(userHandle: string, listUri: string): Promise<any> {
        Logger.time(`unblockUser => ${userHandle}`);
        this.sessionService.ensureAuthenticated();
        try {
            Logger.debug(`unblockUser: Resolving DID for handle="${userHandle}"...`);
            const userDid = await this.resolveDidFromHandle(userHandle);

            Logger.debug(`unblockUser: Searching in listUri=${listUri} for userDid=${userDid}`);
            const listResponse = await this.apiService.fetchWithAuth(
                `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}`
            );

            const itemToDelete = listResponse.items.find((item: any) => item.subject.did === userDid);
            if (!itemToDelete) {
                throw new NotFoundError('User is not in the block list.');
            }
            const rkey = this.extractRKey(itemToDelete.uri);
            if (!rkey) throw new Error('Invalid record key.');

            // Time the actual “unblockUserWithRKey” call
            Logger.time(`unblockUser -> unblockUserWithRKey`);
            const result = await this.unblockUserWithRKey(rkey, listUri);
            Logger.timeEnd(`unblockUser -> unblockUserWithRKey`);
            return result;
        } catch (error) {
            Logger.error(`unblockUser => error:`, error);
            this.errorService.handleError(error as Error);
            this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
            throw error;
        } finally {
            Logger.timeEnd(`unblockUser => ${userHandle}`);
        }
    }

    /**
     * Helper for calls that already know the `rkey`.
     */
    public async unblockUserWithRKey(rkey: string, listUri: string): Promise<any> {
        Logger.debug(`unblockUserWithRKey: rkey=${rkey}, listUri=${listUri}`);
        this.sessionService.ensureAuthenticated();
        try {
            const agent = this.sessionService.getAgent();
            const body = {
                repo: agent.session?.did,
                collection: "app.bsky.graph.listitem",
                rkey,
            };

            // Time the createRecord -> deleteRecord call
            Logger.time(`unblockUserWithRKey -> apiService.postDeleteRecord`);
            const response = await this.apiService.postDeleteRecord(body);
            Logger.timeEnd(`unblockUserWithRKey -> apiService.postDeleteRecord`);

            return response;
        } catch (error) {
            Logger.error(`unblockUserWithRKey => error:`, error);
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
            this.emit('error', ERRORS.FAILED_TO_LOAD_FRESHNESS_DATA(userDidOrHandle));
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
