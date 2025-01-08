import { EventEmitter } from '@src/utils/events/EventEmitter';
import { BlueskyService } from '@src/services/BlueskyService';
import { NotFoundError } from '@src/services/errors/CustomErrors';
import { ERRORS, LABELS } from '@src/constants/Constants';
import { BlockedUsersIndexedDbRepository } from '@src/services/db/BlockedUsersIndexedDbRepository';

interface BlockedUser {
    subject: { handle?: string; did: string };
    uri: string; // "record URI" or rkey
}

interface IndexedDbBlockedUser {
    id: string;          // "listUri#userHandle"
    listUri: string;
    userHandle: string;
    did: string;
    recordUri: string;   // the record URI (or partial rkey) from the Bluesky record
    position: number;    // position to maintain order
}

/**
 * The BlockedUsersService now uses an in-memory array (`blockedUsersData`) as a
 * quick read cache. All persistent reads/writes go through the IndexedDb repository.
 */
export class BlockedUsersService extends EventEmitter {
    private blockedUsersData: BlockedUser[] = [];
    private blockedUsersMap: Map<string, BlockedUser> = new Map();
    private blockedUsersRepo: BlockedUsersIndexedDbRepository;

    constructor(private blueskyService: BlueskyService) {
        super();
        // Initialize the IndexedDB repository
        this.blockedUsersRepo = new BlockedUsersIndexedDbRepository();
    }

    public async getBlockListName(listUri: string): Promise<string> {
        if (!this.blueskyService) {
            throw new Error(ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
        }
        const response = await this.blueskyService.getBlockListName(listUri);
        return response || LABELS.UNNAMED_LIST;
    }

    /**
     * Loads blocked users from either IndexedDB (if available) or via fallback to the API.
     */
    public async loadBlockedUsers(listUri: string): Promise<void> {
        try {
            // 1) Attempt to load from IndexedDB
            let localData = await this.blockedUsersRepo.getAllByListUri(listUri);
            if (localData && localData.length > 0) {
                // Build our in-memory data from these records
                this.blockedUsersData = localData.map((item) => ({
                    subject: { handle: item.userHandle, did: item.did },
                    uri: item.recordUri,
                }));
            } else {
                // 2) If nothing in IDB, fetch from the Bluesky API
                const blockedUsers = await this.blueskyService.getBlockedUsers(listUri);

                this.blockedUsersData = blockedUsers;

                // ### Use bulk method here ###
                // Build an array of objects for bulk add
                const bulkItems = blockedUsers.map((user, index) => {
                    const handle = user.subject.handle || user.subject.did;
                    return {
                        userHandle: handle,
                        did: user.subject.did,
                        recordUri: user.uri,
                        timestamp: index,
                    };
                });

                await this.blockedUsersRepo.addOrUpdateBulk(listUri, bulkItems);
            }

            // (Re)build the map in memory
            this.buildBlockedUsersMap();

            // Emit success
            this.emit('blockedUsersLoaded', this.blockedUsersData);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_LOAD_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
        }
    }

    /**
     * Refresh blocked users from server. Then clear local and bulk write again.
     */
    public async refreshBlockedUsers(listUri: string): Promise<void> {
        try {
            const blockedUsers = await this.blueskyService.getBlockedUsers(listUri);
            this.blockedUsersData = blockedUsers;

            this.buildBlockedUsersMap();
            // Clear old data from this list in IDB
            await this.blockedUsersRepo.clearAll(listUri);

            // ### Also do bulk here ###
            const bulkItems = blockedUsers.map((user, index) => {
                const handle = user.subject.handle || user.subject.did;
                return {
                    userHandle: handle,
                    did: user.subject.did,
                    recordUri: user.uri,
                    timestamp: index,
                };
            });
            await this.blockedUsersRepo.addOrUpdateBulk(listUri, bulkItems);

            this.emit('blockedUsersRefreshed', this.blockedUsersData);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS);
        }
    }

    /**
     * Check if a given user handle is currently blocked (in memory).
     */
    public async isUserBlocked(userHandle: string, listUris: string[]): Promise<boolean> {
        try {
            if (this.blockedUsersMap.has(userHandle)){
                return true;
            }
            else{
                // Query the repo directly
                return await this.blockedUsersRepo.isUserHandleBlocked(userHandle, listUris);
            }
        } catch (error) {
            console.error('Error checking if user is blocked:', error);
            // If an error occurs, default to not blocked
            return false;
        }
    } 

    /**
     * Used after a successful block API call, to add the blocked user
     * record into our memory + IDB, and emit events so UI can update.
     */
    public async addBlockedUserFromResponse(apiResponse: any, userHandle: string, listUri: string): Promise<void> {
        try {
            console.time(`[DEBUG] addBlockedUserFromResponse => ${userHandle}`);
            const { uri } = apiResponse;
            if (!uri) {
                throw new Error('API response missing record uri');
            }
            console.log(`[DEBUG] Resolving DID for handle="${userHandle}"...`);
            const did = await this.resolveDidFromHandle(userHandle);
            console.log(`[DEBUG] Resolved DID for handle="${userHandle}": ${did}`);

            const newItem: BlockedUser = {
                subject: { handle: userHandle, did },
                uri,
            };

            // Insert at the top of the array
            this.blockedUsersData.unshift(newItem);
            this.blockedUsersMap.set(userHandle, newItem);

            // Persist to IndexedDB with current timestamp
            await this.blockedUsersRepo.addOrUpdate(listUri, userHandle, did, uri, Date.now());

            this.emit('blockedUserAdded', newItem);
            console.timeEnd(`[DEBUG] addBlockedUserFromResponse => ${userHandle}`);
        } catch (error) {
            console.timeEnd(`[DEBUG] addBlockedUserFromResponse => ${userHandle}`);
            console.error(`Failed to add blocked user from API for ${userHandle}:`, error);
            this.emit('error', `Failed to add blocked user ${userHandle}.`);
        }
    }



    /**
     * Fallback method if you need to insert a user blocked record (no direct Bluesky API response).
     * Usually used for quick UI "optimistic" blocking. If the user is already blocked, skip.
     */
    public async addBlockedUser(userHandle: string, listUri: string): Promise<void> {
        try {
            const isUserBlocked = await this.isUserBlocked(userHandle, [listUri]);
            if (isUserBlocked) return;

            const did = await this.resolveDidFromHandle(userHandle);
            const newItem: BlockedUser = {
                subject: { handle: userHandle, did },
                uri: '',
            };

            // Insert into memory at the top
            this.blockedUsersData.unshift(newItem);
            this.blockedUsersMap.set(userHandle, newItem);

            // Persist to IDB with position 0
            await this.blockedUsersRepo.addOrUpdate(
                listUri,
                userHandle,
                did,
                '',
                Date.now()
            );

            this.emit('blockedUserAdded', newItem);
        } catch (error) {
            console.error('Failed to add blocked user:', error);
            this.emit('error', 'Failed to add blocked user.');
        }
    }

    /**
     * Unblock user. We look up the record's rkey (uri), call Bluesky's unblock, then
     * remove from memory + IDB, and emit events so the UI can refresh.
     */
    public async removeBlockedUser(userHandle: string, listUri: string): Promise<void> {
        const isUserBlocked = await this.isUserBlocked(userHandle, [listUri])
        if (!isUserBlocked) {
            console.warn(`User ${userHandle} is not in the block list.`);
            return;
        }

        const blockedUser = this.blockedUsersMap.get(userHandle);
        const fullUri = blockedUser?.uri;

        if (!fullUri) {
            // No URI available; attempt a full API-based unblock
            try {
                await this.blueskyService.unblockUser(userHandle, listUri);
                await this.cleanupAfterUnblock(userHandle, listUri);
            } catch (error) {
                if (error instanceof NotFoundError) {
                    await this.cleanupAfterUnblock(userHandle, listUri);
                } else {
                    console.error('Failed to remove blocked user via fallback:', error);
                    this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
                }
            }
            return;
        }

        // Extract the rkey from the full URI
        const rkey = this.extractRKey(fullUri);
        if (!rkey) {
            console.error('Invalid rkey extracted from URI:', fullUri);
            return;
        }

        try {
            await this.blueskyService.unblockUserWithRKey(rkey, listUri);
            await this.cleanupAfterUnblock(userHandle, listUri);
        } catch (error) {
            if (error instanceof NotFoundError) {
                await this.cleanupAfterUnblock(userHandle, listUri);
            } else {
                console.error('Failed to remove blocked user:', error);
                this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
            }
        }
    }

    private async cleanupAfterUnblock(userHandle: string, listUri: string): Promise<void> {
        // Remove from memory
        this.blockedUsersMap.delete(userHandle);
        const index = this.blockedUsersData.findIndex((item) => {
            const handle = item.subject.handle || item.subject.did;
            return handle === userHandle;
        });
        if (index !== -1) {
            this.blockedUsersData.splice(index, 1);
        }

        // Remove from IndexedDB
        await this.blockedUsersRepo.remove(listUri, userHandle);

        this.emit('blockedUserRemoved', userHandle);
    }

    public async resolveHandleFromDid(did: string): Promise<string> {
        return this.blueskyService.resolveHandleFromDid(did);
    }

    public async resolveDidFromHandle(handle: string): Promise<string> {
        return this.blueskyService.resolveDidFromHandle(handle);
    }

    public async reportAccount(userDid: string, reasonType: string, reason = ''): Promise<void> {
        await this.blueskyService.reportAccount(userDid, reasonType, reason);
    }

    public getBlockedUsersData(): BlockedUser[] {
        return this.blockedUsersData;
    }

    /**
     * Clears all blocked user data in IndexedDB. This should generally be called on logout.
     */
    public async clearBlockedUsersData(): Promise<void> {
        this.blockedUsersData = [];
        this.blockedUsersMap.clear();
        await this.blockedUsersRepo.clearAll(); // clears entire store
    }
    
    private extractRKey(uri: string): string | null {
        const parts = uri.split('/');
        return parts.length > 0 ? parts.pop() || null : null;
    }
    
    public destroy(): void {
        this.blockedUsersData = [];
        this.blockedUsersMap.clear();
        this.removeAllListeners();
    }

    private buildBlockedUsersMap(): void {
        this.blockedUsersMap.clear();
        for (const user of this.blockedUsersData) {
            const handle = user.subject.handle || user.subject.did;
            this.blockedUsersMap.set(handle, user);
        }
    }
}
