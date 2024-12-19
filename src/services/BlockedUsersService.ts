import { EventEmitter } from '@src/utils/events/EventEmitter';
import { BlueskyService, NotFoundError } from '@src/services/BlueskyService';
import { STORAGE_KEYS, ERRORS, LABELS } from '@src/constants/Constants';

declare var chrome: any;

export class BlockedUsersService extends EventEmitter {
    private blockedUsersData: any[] = [];
    // NEW: Introduce a Map for O(1) lookups
    private blockedUsersMap: Map<string, any> = new Map();

    constructor(private blueskyService: BlueskyService) {
        super();
    }

    public async getBlockListName(listUri: string): Promise<string> {
        if (!this.blueskyService)
            throw new Error(ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
        const response = await this.blueskyService.getBlockListName(listUri);
        return response || LABELS.UNNAMED_LIST;
    }

    public async loadBlockedUsers(listUri: string): Promise<void> {
        try {
            const cachedData = await this.getBlockedUsersFromStorage(listUri);
            if (cachedData) {
                this.blockedUsersData = cachedData;
            } else {
                const blockedUsers = await this.blueskyService.getBlockedUsers(listUri);
                this.blockedUsersData = blockedUsers;
                await this.saveBlockedUsersToStorage(listUri, blockedUsers);
            }
            this.buildBlockedUsersMap();
            this.emit('blockedUsersLoaded', this.blockedUsersData);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_LOAD_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_LOAD_BLOCKED_USERS);
        }
    }

    public async refreshBlockedUsers(listUri: string): Promise<void> {
        try {
            const blockedUsers = await this.blueskyService.getBlockedUsers(listUri);
            this.blockedUsersData = blockedUsers;
            this.buildBlockedUsersMap();
            await this.saveBlockedUsersToStorage(listUri, blockedUsers);
            this.emit('blockedUsersRefreshed', this.blockedUsersData);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS);
        }
    }

    // Build the map after fetching or refreshing
    private buildBlockedUsersMap(): void {
        this.blockedUsersMap.clear();
        for (const user of this.blockedUsersData) {
            const handle = user.subject.handle || user.subject.did;
            this.blockedUsersMap.set(handle, user);
        }
    }

    public isUserBlocked(userHandle: string): boolean {
        return this.blockedUsersMap.has(userHandle);
    }

    public async addBlockedUser(userHandle: string, listUri: string): Promise<void> {
        try {
            const did = await this.blueskyService.resolveDidFromHandle(userHandle);
            const newItem = { subject: { handle: userHandle, did } };
            this.blockedUsersData.unshift(newItem);
            this.blockedUsersMap.set(userHandle, newItem);
            await this.saveBlockedUsersToStorage(listUri, this.blockedUsersData);
            this.emit('blockedUserAdded', newItem);
        } catch (error) {
            console.error('Failed to add blocked user:', error);
            this.emit('error', 'Failed to add blocked user.');
        }
    }

    public async removeBlockedUser(userHandle: string, listUri: string): Promise<void> {
        if (!this.isUserBlocked(userHandle)) {
            console.warn(`User ${userHandle} is not in the block list.`);
            return;
        }
        try {
            await this.blueskyService.unblockUser(userHandle, listUri);
            this.blockedUsersMap.delete(userHandle);
            this.blockedUsersData = this.blockedUsersData.filter(
                (item) => (item.subject.handle || item.subject.did) !== userHandle
            );
            await this.saveBlockedUsersToStorage(listUri, this.blockedUsersData);
            this.emit('blockedUserRemoved', userHandle);
        } catch (error) {
            if (error instanceof NotFoundError) {
                // User already unblocked
                this.blockedUsersMap.delete(userHandle);
                this.blockedUsersData = this.blockedUsersData.filter(
                    (item) => (item.subject.handle || item.subject.did) !== userHandle
                );
                await this.saveBlockedUsersToStorage(listUri, this.blockedUsersData);
                this.emit('blockedUserRemoved', userHandle);
            } else {
                console.error('Failed to remove blocked user:', error);
                this.emit('error', 'Failed to remove blocked user.');
            }
        }
    }

    public async resolveHandleFromDid(did: string): Promise<string> {
        return this.blueskyService.resolveHandleFromDid(did);
    }

    public async resolveDidFromHandle(handle: string): Promise<string> {
        return this.blueskyService.resolveDidFromHandle(handle);
    }

    public async reportAccount(userDid: string, reasonType: string, reason: string = ""): Promise<void> {
        await this.blueskyService.reportAccount(userDid, reasonType, reason);
    }

    public getBlockedUsersData(): any[] {
        return this.blockedUsersData;
    }

    public clearBlockedUsersData(): void {
        chrome.storage.local.get(null, (items: any) => {
            const keysToRemove = Object.keys(items).filter((key) =>
                key.startsWith(STORAGE_KEYS.BLOCKED_USERS_PREFIX)
            );
            if (keysToRemove.length > 0) {
                chrome.storage.local.remove(keysToRemove);
            }
        });
    }

    private getBlockedUsersFromStorage(listUri: string): Promise<any[] | null> {
        return new Promise((resolve) => {
            chrome.storage.local.get([`${STORAGE_KEYS.BLOCKED_USERS_PREFIX}${listUri}`], (result: any) => {
                if (result[`${STORAGE_KEYS.BLOCKED_USERS_PREFIX}${listUri}`]) {
                    resolve(result[`${STORAGE_KEYS.BLOCKED_USERS_PREFIX}${listUri}`]);
                } else {
                    resolve(null);
                }
            });
        });
    }

    private saveBlockedUsersToStorage(listUri: string, blockedUsers: any[]): Promise<void> {
        return new Promise((resolve) => {
            chrome.storage.local.set(
                {
                    [`${STORAGE_KEYS.BLOCKED_USERS_PREFIX}${listUri}`]: blockedUsers,
                },
                () => {
                    resolve();
                }
            );
        });
    }

    public destroy(): void {
        this.blockedUsersData = [];
        this.blockedUsersMap.clear();
        this.removeAllListeners();
    }
}
