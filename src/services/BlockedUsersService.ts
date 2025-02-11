import {EventEmitter} from '@src/utils/events/EventEmitter';
import {BlueskyService} from '@src/services/BlueskyService';
import {NotFoundError} from '@src/services/errors/CustomErrors';
import {ERRORS, LABELS, MESSAGES} from '@src/constants/Constants';
import {BlockedUsersIndexedDbRepository} from '@src/services/db/BlockedUsersIndexedDbRepository';
import Logger from '@src/utils/logger/Logger';
import {BlockedUser} from 'types/ApiResponses';
import {IndexedDbBlockedUser} from 'types/IndexedDbBlockedUser';

export class BlockedUsersService extends EventEmitter {
    public blockedUsersRepo: BlockedUsersIndexedDbRepository;
    private currentLoadCancelToken: { canceled: boolean } | null = null;

    constructor(private blueskyService: BlueskyService) {
        super();
        // Initialize the IndexedDB repository
        this.blockedUsersRepo = new BlockedUsersIndexedDbRepository();
    }

    // Returns display-friendly name for the modlist
    public async getBlockListName(listUri: string): Promise<string> {
        this.ensureBlueskyService();
        const response = await this.blueskyService.getBlockListName(listUri);
        return response || LABELS.UNNAMED_LIST;
    }

    private ensureBlueskyService(): void {
        if (!this.blueskyService) {
            throw new Error(ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
        }
    }

    public async refreshBlockedUsers(listUri: string): Promise<void> {
        // Cancel any existing load in progress:
        if (this.currentLoadCancelToken) {
            this.currentLoadCancelToken.canceled = true;
        }
        // Create a fresh token for the new load
        const cancelToken = { canceled: false };
        this.currentLoadCancelToken = cancelToken;
        
        try {
            await this.blockedUsersRepo.clearStoreByListUri(listUri);
            
            const meta = await this.blockedUsersRepo.getMetadataForList(listUri);
            meta.processedCursors = 0;
            meta.isComplete = false;
            meta.nextCursor = undefined;
            await this.blockedUsersRepo.setMetadataForList(listUri, meta);
            
            await this.fetchAndPersistBlockedUsers(listUri, 'blockedUsersRefreshed', cancelToken, meta.processedCursors, meta.nextCursor);
        } catch (error) {
            Logger.error(ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS);
        }
    }

    /**
     * Called by UI when a user selects a block list to load.
     */
    public async loadBlockedUsers(listUri: string): Promise<void> {
        // Cancel any existing load in progress:
        if (this.currentLoadCancelToken) {
            this.currentLoadCancelToken.canceled = true;
        }
        // Create a fresh token for the new load
        const cancelToken = { canceled: false };
        this.currentLoadCancelToken = cancelToken;

        try {
            const listCount = await this.blockedUsersRepo.getCountByListUri(listUri);
            const meta = await this.blockedUsersRepo.getMetadataForList(listUri);
                        
            if (meta.isComplete) {
                // Already have local data, so we’re done:
                this.emit('blockedUsersAlreadyLoaded');
            } else {
                // Need to fetch from network:
                await this.fetchAndPersistBlockedUsers(listUri, 'blockedUsersLoaded', cancelToken, meta.processedCursors, meta.nextCursor);
            }
        } catch (error) {
            Logger.error(ERRORS.FAILED_TO_LOAD_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
        } finally {
            // If we are still the active load token, clear it now
            if (this.currentLoadCancelToken === cancelToken) {
                this.currentLoadCancelToken = null;
            }
        }
    }

    /**
     * Loads and persists blocked users in chunks.
     * @param listUri The URI of the block list.
     */
    private async fetchAndPersistBlockedUsers(
        listUri: string,
        completionEvent: string = 'blockedUsersLoaded',
        cancelToken: { canceled: boolean },
        processedCursors: number,
        resumeCursor: string | undefined,
    ): Promise<void> {
        try {
            let currentOrder = await this.blockedUsersRepo.getMaxOrder(listUri);
            let totalSeenSoFar = processedCursors * 100;
            let totalRemovedUsers = totalSeenSoFar - await this.blockedUsersRepo.getCountByListUri(listUri);

            // Time-tracking variables
            let chunkCount = 0;
            let totalChunkTime = 0;

            // onChunkFetched callback:
            const chunkCallback = async (
                chunk: BlockedUser[],
                newCursor: string | undefined,
                blockListTotal: number,
                fetchDurationMs: number   // network time
            ) => {
                // If canceled, stop right away
                if (cancelToken.canceled) {
                    return;
                }

                // Start measuring local processing
                const localStart = performance.now();

                // Compute how many suspended in this chunk
                const remaining = blockListTotal - totalSeenSoFar;
                const expectedChunkSize = Math.min(100, remaining);
                const removedInChunk = expectedChunkSize - chunk.length;
                totalRemovedUsers += Math.max(0, removedInChunk);
                totalSeenSoFar += chunk.length + Math.max(0, removedInChunk);

                // Local DB insertion
                const bulkItems = chunk.slice().reverse().map((user) => ({
                    userHandle: user.subject.handle || user.subject.did,
                    did: user.subject.did,
                    recordUri: user.uri,
                    order: currentOrder++,
                }));
                await this.blockedUsersRepo.addOrUpdateBulk(listUri, bulkItems);

                // Update metadata, etc.
                const meta = await this.blockedUsersRepo.getMetadataForList(listUri);
                meta.processedCursors++;
                meta.nextCursor = newCursor;
                await this.blockedUsersRepo.setMetadataForList(listUri, meta);

                // Stop measuring local processing
                const localEnd = performance.now();
                const localProcessingDuration = localEnd - localStart; // ms

                // Full chunk time = network + local
                const fullChunkDurationMs = fetchDurationMs + localProcessingDuration;

                // Update average
                chunkCount++;
                totalChunkTime += fullChunkDurationMs;
                const avgChunkTime = totalChunkTime / chunkCount; // ms per chunk

                // Estimate how many user-chunks remain
                const usersRemaining = blockListTotal - totalSeenSoFar;
                const chunkSize = 100;
                const remainingChunks = Math.ceil(usersRemaining / chunkSize);

                // ETA in ms => format to human string
                const estimatedTimeLeftMs = remainingChunks * avgChunkTime;
                const estimatedTimeLeftStr = this.formatEta(estimatedTimeLeftMs);

                // Current DB count
                const currentCount = await this.blockedUsersRepo.getCountByListUri(listUri);

                // Emit progress with new ETA
                this.emit(
                    'blockedUsersProgress',
                    currentCount,
                    totalRemovedUsers,
                    blockListTotal,
                    estimatedTimeLeftStr
                );
            };

            // Actually fetch in chunks
            const finished = await this.blueskyService.getBlockedUsers(
                listUri,
                3,
                chunkCallback,   // pass chunkCallback
                resumeCursor
            );

            if (!cancelToken.canceled && finished) {
                const meta = await this.blockedUsersRepo.getMetadataForList(listUri);
                meta.isComplete = true;
                meta.nextCursor = undefined;
                await this.blockedUsersRepo.setMetadataForList(listUri, meta);

                this.emit(completionEvent);
            }
        } catch (error) {
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
        }
    }

    /**
     * Helper to format milliseconds into a human-readable "mm:ss" or similar.
     */
    private formatEta(ms: number): string {
        if (ms <= 0) return '0s';

        const totalSeconds = Math.floor(ms / 1000);
        const days = Math.floor(totalSeconds / 86400); // 1 day = 86400 seconds
        const hours = Math.floor((totalSeconds % 86400) / 3600); // 1 hour = 3600 seconds
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        // Build parts
        const parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0 || days > 0) parts.push(`${hours}h`);
        if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
        if (seconds > 0 || (days === 0 && hours === 0 && minutes === 0)) parts.push(`${seconds}s`);

        return parts.join(' ');
    }

    /**
     * For the “Block” action flow.
     * - Usually called after an app.bsky.repo.createRecord POST
     */
    public async addBlockedUserFromResponse(
        apiResponse: any,
        userHandle: string,
        listUri: string
    ): Promise<void> {
        try {
            Logger.time(`addBlockedUserFromResponse => ${userHandle}`);
            const uri = this.extractUriFromResponse(apiResponse);
            const did = await this.resolveDidForUser(userHandle);

            // Check if we already have the user in IDB (from optimistic add)
            const existing = await this.blockedUsersRepo.getByUserHandle(listUri, userHandle);

            const maxOrder = await this.blockedUsersRepo.getMaxOrder(listUri);
            const newOrder = maxOrder + 1;

            if (existing) {
                // If the user is already in DB (optimistic add), just update their recordUri
                await this.blockedUsersRepo.addOrUpdate(
                    listUri,
                    userHandle,
                    did,
                    uri,          // real record URI from the server
                    existing.order // preserve the original order
                );

                // Optionally emit a different event to let the UI know we updated
                this.emit('blockedUserUpdated', {
                    subject: {handle: userHandle, did},
                    uri,
                });
            } else {
                // Otherwise, this is a brand-new user (no optimistic entry in DB)
                await this.blockedUsersRepo.addOrUpdate(listUri, userHandle, did, uri, newOrder);

                this.emit('blockedUserAdded', {
                    subject: {handle: userHandle, did},
                    uri,
                });
            }

            Logger.timeEnd(`addBlockedUserFromResponse => ${userHandle}`);
        } catch (error) {
            Logger.timeEnd(`addBlockedUserFromResponse => ${userHandle}`);
            Logger.error(`Failed to add blocked user from API for ${userHandle}:`, error);
            this.emit('error', `Failed to add blocked user ${userHandle}.`);
        }
    }

    public async searchBlockedUsers(
        listUri: string,
        partialHandle: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<{ users: IndexedDbBlockedUser[]; total: number }> {
        try {
            const result = await this.blockedUsersRepo.searchByHandle(listUri, partialHandle, page, pageSize);
            return result;
        } catch (error) {
            Logger.error('searchBlockedUsers => error:', error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
            return { users: [], total: 0 };
        }
    }

    public async addBlockedUser(userHandle: string, listUri: string): Promise<void> {
        try {
            // Optionally check if user is already blocked
            const alreadyBlocked = await this.isUserBlocked(userHandle, [listUri]);
            if (alreadyBlocked) {
                Logger.debug(`User ${userHandle} is already blocked in ${listUri}`);
                this.emit('error', ERRORS.USER_ALREADY_BLOCKED(userHandle));
                return;
            }
            const maxOrder = await this.blockedUsersRepo.getMaxOrder(listUri);
            const newOrder = maxOrder + 1;
            // We don’t have a recordUri yet, but we can store an empty or "pending"
            const did = await this.resolveDidForUser(userHandle);
            await this.blockedUsersRepo.addOrUpdate(listUri, userHandle, did, 'pending', newOrder);

            this.emit('blockedUserAdded', {
                subject: {handle: userHandle, did},
                uri: 'pending',
            });
        } catch (error) {
            Logger.error('Failed to add blocked user:', error);
            this.emit('error', 'Failed to add blocked user.');
        }
    }

    public async removeBlockedUser(userHandle: string, listUri: string): Promise<void> {
        try {
            // If we have a recordKey from somewhere, we can call blueskyService.unblockUserWithRKey
            // but as an example, we’ll just do the "no rkey" approach:
            const blockedUser = await this.blockedUsersRepo.getByUserHandle(listUri, userHandle);
            if(blockedUser){
                await this.blueskyService.unblockUser(blockedUser);
                // Then remove from IDB:
                await this.blockedUsersRepo.remove(blockedUser.listUri, blockedUser.userHandle);
            }

            this.emit('blockedUserRemoved', userHandle);
        } catch (error) {
            if (error instanceof NotFoundError) {
                // Maybe the user record wasn’t on server. Just remove from IDB
                await this.blockedUsersRepo.remove(listUri, userHandle);
                this.emit('blockedUserRemoved', userHandle);
            } else {
                Logger.error('Failed to remove blocked user:', error);
                this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
            }
        }
    }

    public async isUserBlocked(userHandle: string, listUris: string[]): Promise<boolean> {
        try {
            return await this.blockedUsersRepo.isUserHandleBlocked(userHandle, listUris);
        } catch (error) {
            Logger.error('Error checking if user is blocked:', error);
            return false;
        }
    }

    public async resolveHandleFromDid(did: string): Promise<string> {
        return await this.blueskyService.resolveHandleFromDid(did);
    }

    public async resolveDidFromHandle(handle: string): Promise<string> {
        return await this.blueskyService.resolveDidFromHandle(handle);
    }

    public async reportAccount(userDid: string, reasonType: string, reason = ''): Promise<void> {
        try {
            await this.blueskyService.reportAccount(userDid, reasonType, reason);
            Logger.debug(`Account reported: DID=${userDid}, ReasonType=${reasonType}`);
            this.emit('accountReported', {userDid, reasonType, reason});
        } catch (error) {
            Logger.error(`Failed to report account for DID ${userDid}.`, error);
            this.emit('error', `Failed to report account for DID ${userDid}.`);
        }
    }

    public async exportEntireDatabase(): Promise<any> {
        return this.blockedUsersRepo.exportAllData();
    }

    public async importEntireDatabase(data: any): Promise<void> {
        await this.blockedUsersRepo.importAllData(data);
        // Optionally emit an event so UI can re-render:
        this.emit('blockedUsersLoaded');
    }

    /**
     * Helper to parse the `uri` from an API response
     */
    private extractUriFromResponse(apiResponse: any): string {
        const uri = apiResponse.uri;
        if (!uri) {
            throw new Error('API response missing record uri');
        }
        return uri;
    }

    private async resolveDidForUser(userHandle: string): Promise<string> {
        Logger.debug(`Resolving DID for handle="${userHandle}"...`);
        const did = await this.resolveDidFromHandle(userHandle);
        Logger.debug(`Resolved DID for handle="${userHandle}": ${did}`);
        return did;
    }

    // --------------
    // (Optional) If you need a global “clear all”:
    // --------------

    public async clearBlockedUsersData(): Promise<void> {
        await this.blockedUsersRepo.clearAll();
    }
}
