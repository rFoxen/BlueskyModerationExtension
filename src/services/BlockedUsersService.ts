import { EventEmitter } from '@src/utils/events/EventEmitter';
import { BlueskyService } from '@src/services/BlueskyService';
import { NotFoundError } from '@src/services/errors/CustomErrors';
import { ERRORS, LABELS } from '@src/constants/Constants';
import { BlockedUsersIndexedDbRepository } from '@src/services/db/BlockedUsersIndexedDbRepository';
import Logger from '@src/utils/logger/Logger';
import { BlockedUser } from 'types/ApiResponses';
import { IndexedDbBlockedUser } from'types/IndexedDbBlockedUser';

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
     * Loads blocked users from either IndexedDB (if available) or via fallback to the API.
     */
    public async loadBlockedUsers(listUri: string): Promise<void> {
        try {
            const localData = await this.fetchBlockedUsersFromIndexedDB(listUri);
            if (localData.length > 0) {
                this.initializeBlockedUsersData(localData);
            } else {
                await this.fetchAndPersistBlockedUsers(listUri);
            }
            this.buildBlockedUsersMap();
            this.emit('blockedUsersLoaded', this.blockedUsersData);
        } catch (error) {
            Logger.error(ERRORS.FAILED_TO_LOAD_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
        }
    }

    private async fetchBlockedUsersFromIndexedDB(listUri: string): Promise<IndexedDbBlockedUser[]> {
        const localData = await this.blockedUsersRepo.getAllByListUri(listUri);
        return localData || [];
    }

    private initializeBlockedUsersData(localData: IndexedDbBlockedUser[]): void {
        this.blockedUsersData = localData.map((item) => ({
            subject: { handle: item.userHandle, did: item.did },
            uri: item.recordUri,
        }));
    }

    private async fetchAndPersistBlockedUsers(listUri: string): Promise<void> {
        const blockedUsers = await this.blueskyService.getBlockedUsers(listUri);
        this.blockedUsersData = blockedUsers;

        const bulkItems = this.transformBlockedUsersForBulk(listUri, blockedUsers);
        await this.blockedUsersRepo.addOrUpdateBulk(listUri, bulkItems);
    }

    private transformBlockedUsersForBulk(listUri: string, blockedUsers: BlockedUser[]): IndexedDbBlockedUser[] {
        return blockedUsers.map((user, index) => ({
            id: `${listUri}#${user.subject.handle || user.subject.did}`,
            listUri,
            userHandle: user.subject.handle || user.subject.did,
            did: user.subject.did,
            recordUri: user.uri,
            timestamp: Date.now(),
        }));
    }


    /**
     * Refresh blocked users from server. Then clear local and bulk write again.
     */
    public async refreshBlockedUsers(listUri: string): Promise<void> {
        try {
            const blockedUsers = await this.fetchBlockedUsersFromApi(listUri);
            this.blockedUsersData = blockedUsers;

            this.buildBlockedUsersMap();
            await this.clearAndPersistBlockedUsers(listUri, blockedUsers);

            this.emit('blockedUsersRefreshed', this.blockedUsersData);
        } catch (error) {
            Logger.error(ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS);
        }
    }

    private async fetchBlockedUsersFromApi(listUri: string): Promise<BlockedUser[]> {
        return await this.blueskyService.getBlockedUsers(listUri);
    }

    private async clearAndPersistBlockedUsers(listUri: string, blockedUsers: BlockedUser[]): Promise<void> {
        await this.blockedUsersRepo.clearStoreByListUri(listUri);
        const bulkItems = this.transformBlockedUsersForBulk(listUri, blockedUsers);
        await this.blockedUsersRepo.addOrUpdateBulk(listUri, bulkItems);
    }


    /**
     * Check if a given user handle is currently blocked (in memory).
     */
    public async isUserBlocked(userHandle: string, listUris: string[]): Promise<boolean> {
        try {
            return this.blockedUsersMap.has(userHandle) || await this.checkUserInRepository(userHandle, listUris);
        } catch (error) {
            Logger.error('Error checking if user is blocked:', error);
            // Default to not blocked on error
            return false;
        }
    }

    private async checkUserInRepository(userHandle: string, listUris: string[]): Promise<boolean> {
        return await this.blockedUsersRepo.isUserHandleBlocked(userHandle, listUris);
    }

    /**
     * Used after a successful block API call, to add the blocked user
     * record into our memory + IDB, and emit events so UI can update.
     */
    public async addBlockedUserFromResponse(apiResponse: any, userHandle: string, listUri: string): Promise<void> {
        try {
            Logger.time(`addBlockedUserFromResponse => ${userHandle}`);
            const uri = this.extractUriFromResponse(apiResponse);
            const did = await this.resolveDidForUser(userHandle);

            const newItem = this.createBlockedUser(userHandle, did, uri);

            this.addToInMemoryData(newItem);
            await this.persistBlockedUser(listUri, newItem);

            this.emit('blockedUserAdded', newItem);
            Logger.timeEnd(`addBlockedUserFromResponse => ${userHandle}`);
        } catch (error) {
            Logger.timeEnd(`addBlockedUserFromResponse => ${userHandle}`);
            Logger.error(`Failed to add blocked user from API for ${userHandle}:`, error);
            this.emit('error', `Failed to add blocked user ${userHandle}.`);
        }
    }

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

    private createBlockedUser(userHandle: string, did: string, uri: string): BlockedUser {
        return {
            subject: { handle: userHandle, did },
            uri,
        };
    }

    private addToInMemoryData(newItem: BlockedUser): void {
        this.blockedUsersData.unshift(newItem);
        this.blockedUsersMap.set(newItem.subject.handle || newItem.subject.did, newItem);
    }

    private async persistBlockedUser(listUri: string, blockedUser: BlockedUser): Promise<void> {
        const handle = blockedUser.subject.handle || blockedUser.subject.did;
        await this.blockedUsersRepo.addOrUpdate(listUri, handle, blockedUser.subject.did, blockedUser.uri, Date.now());
    }

    /**
     * Fallback method if you need to insert a user blocked record (no direct Bluesky API response).
     * Usually used for quick UI "optimistic" blocking. If the user is already blocked, skip.
     */
    public async addBlockedUser(userHandle: string, listUri: string): Promise<void> {
        try {
            if (await this.isUserAlreadyBlocked(userHandle, listUri)) {
                return;
            }

            const did = await this.resolveDidForUser(userHandle);
            const newItem = this.createBlockedUser(userHandle, did, '');

            this.addToInMemoryData(newItem);
            await this.persistBlockedUser(listUri, newItem);

            this.emit('blockedUserAdded', newItem);
        } catch (error) {
            Logger.error('Failed to add blocked user:', error);
            this.emit('error', 'Failed to add blocked user.');
        }
    }

    private async isUserAlreadyBlocked(userHandle: string, listUri: string): Promise<boolean> {
        return await this.isUserBlocked(userHandle, [listUri]);
    }


    /**
     * Unblock user. We look up the record's rkey (uri), call Bluesky's unblock, then
     * remove from memory + IDB, and emit events so the UI can refresh.
     */
    public async removeBlockedUser(userHandle: string, listUri: string): Promise<void> {
        const isUserBlocked = await this.isUserAlreadyBlocked(userHandle, listUri);
        if (!isUserBlocked) {
            Logger.warn(`User ${userHandle} is not in the block list.`);
            return;
        }

        const blockedUser = this.blockedUsersMap.get(userHandle);
        const fullUri = blockedUser?.uri;

        if (!fullUri) {
            await this.attemptUnblockWithoutUri(userHandle, listUri);
            return;
        }

        const rkey = this.extractRKey(fullUri);
        if (!rkey) {
            Logger.error('Invalid rkey extracted from URI:', fullUri);
            return;
        }

        await this.attemptUnblockWithRKey(rkey, userHandle, listUri);
    }

    private async attemptUnblockWithoutUri(userHandle: string, listUri: string): Promise<void> {
        try {
            await this.blueskyService.unblockUser(userHandle, listUri);
            await this.cleanupAfterUnblock(userHandle, listUri);
        } catch (error) {
            if (error instanceof NotFoundError) {
                await this.cleanupAfterUnblock(userHandle, listUri);
            } else {
                Logger.error('Failed to remove blocked user via fallback:', error);
                this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
            }
        }
    }

    private async attemptUnblockWithRKey(rkey: string, userHandle: string, listUri: string): Promise<void> {
        try {
            await this.blueskyService.unblockUserWithRKey(rkey, listUri);
            await this.cleanupAfterUnblock(userHandle, listUri);
        } catch (error) {
            if (error instanceof NotFoundError) {
                await this.cleanupAfterUnblock(userHandle, listUri);
            } else {
                Logger.error('Failed to remove blocked user:', error);
                this.emit('error', ERRORS.FAILED_TO_UNBLOCK_USER);
            }
        }
    }

    private async cleanupAfterUnblock(userHandle: string, listUri: string): Promise<void> {
        this.removeFromInMemoryData(userHandle);
        await this.removeFromIndexedDB(listUri, userHandle);
        this.emit('blockedUserRemoved', userHandle);
    }

    private removeFromInMemoryData(userHandle: string): void {
        this.blockedUsersMap.delete(userHandle);
        const index = this.blockedUsersData.findIndex((item) => {
            const handle = item.subject.handle || item.subject.did;
            return handle === userHandle;
        });
        if (index !== -1) {
            this.blockedUsersData.splice(index, 1);
        }
    }

    private async removeFromIndexedDB(listUri: string, userHandle: string): Promise<void> {
        await this.blockedUsersRepo.remove(listUri, userHandle);
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
            this.emit('accountReported', { userDid, reasonType, reason });
        } catch (error) {
            Logger.error(`Failed to report account: DID=${userDid}`, error);
            this.emit('error', `Failed to report account for DID ${userDid}.`);
        }
    }


    public getBlockedUsersData(): BlockedUser[] {
        return this.blockedUsersData;
    }

    /**
     * Clears all blocked user data in IndexedDB. This should generally be called on logout.
     */
    public async clearBlockedUsersData(): Promise<void> {
        this.resetInMemoryData();
        await this.clearIndexedDBData();
    }

    private resetInMemoryData(): void {
        this.blockedUsersData = [];
        this.blockedUsersMap.clear();
    }

    private async clearIndexedDBData(): Promise<void> {
        await this.blockedUsersRepo.clearAll(); // Clears entire store
    }

    private extractRKey(uri: string): string | null {
        if (!uri) {
            Logger.error('URI is empty or undefined.');
            return null;
        }
        const segments = uri.split('/');
        const rkey = segments.pop();
        if (!rkey) {
            Logger.error(`Failed to extract rkey from URI: ${uri}`);
        }
        return rkey || null;
    }


    public destroy(): void {
        this.resetInMemoryData();
        this.removeAllListeners();
    }


    private buildBlockedUsersMap(): void {
        this.blockedUsersMap = this.constructBlockedUsersMap(this.blockedUsersData);
    }

    private constructBlockedUsersMap(blockedUsers: BlockedUser[]): Map<string, BlockedUser> {
        return blockedUsers.reduce((map, user) => {
            const handle = user.subject.handle || user.subject.did;
            map.set(handle, user);
            return map;
        }, new Map<string, BlockedUser>());
    }

}
