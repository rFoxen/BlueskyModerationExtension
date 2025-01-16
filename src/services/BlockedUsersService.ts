import {EventEmitter} from '@src/utils/events/EventEmitter';
import {BlueskyService} from '@src/services/BlueskyService';
import {NotFoundError} from '@src/services/errors/CustomErrors';
import {ERRORS, LABELS} from '@src/constants/Constants';
import {BlockedUsersIndexedDbRepository} from '@src/services/db/BlockedUsersIndexedDbRepository';
import Logger from '@src/utils/logger/Logger';
import {BlockedUser} from 'types/ApiResponses';
import {IndexedDbBlockedUser} from 'types/IndexedDbBlockedUser';

export class BlockedUsersService extends EventEmitter {
    public blockedUsersRepo: BlockedUsersIndexedDbRepository;

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

    /**
     * Called by UI when a user selects a block list to load.
     */
    public async loadBlockedUsers(listUri: string): Promise<void> {
        try {
            // 1) Check local DB first
            const listCount = await this.blockedUsersRepo.getCountByListUri(listUri);
            if (listCount > 0) {
                // We have some data in IndexedDB
                this.emit('blockedUsersLoaded', /* pass anything if needed */);
            } else {
                // 2) If no local data, fetch from network then persist
                await this.fetchAndPersistBlockedUsers(listUri);
                this.emit('blockedUsersLoaded');
            }
        } catch (error) {
            Logger.error(ERRORS.FAILED_TO_LOAD_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
        }
    }

    /**
     * Manually fetch from API and store in IDB, overwriting existing data for the listUri.
     */
    private async fetchAndPersistBlockedUsers(listUri: string): Promise<void> {
        // 1) Force a fresh fetch from network
        const blockedUsers = await this.blueskyService.getBlockedUsers(listUri);
        // 2) Overwrite existing in IDB
        await this.blockedUsersRepo.clearStoreByListUri(listUri);
        const bulkItems = blockedUsers.slice().reverse().map((user, index) => ({
            userHandle: user.subject.handle || user.subject.did,
            did: user.subject.did,
            recordUri: user.uri,
            order: index, // Assign order based on API response index
        }));
        await this.blockedUsersRepo.addOrUpdateBulk(listUri, bulkItems);
    }

    public async refreshBlockedUsers(listUri: string): Promise<void> {
        try {
            // 1) Force a fresh fetch from network
            const blockedUsers = await this.blueskyService.getBlockedUsers(listUri);
            // 2) Overwrite existing in IDB
            await this.blockedUsersRepo.clearStoreByListUri(listUri);
            const bulkItems = blockedUsers.slice().reverse().map((user, index) => ({
                userHandle: user.subject.handle || user.subject.did,
                did: user.subject.did,
                recordUri: user.uri,
                order: index, // Assign order based on API response index
            }));
            await this.blockedUsersRepo.addOrUpdateBulk(listUri, bulkItems);

            this.emit('blockedUsersRefreshed');
        } catch (error) {
            Logger.error(ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS);
        }
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
