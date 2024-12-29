// src\services\BlockedUsersService.ts

import { EventEmitter } from '@src/utils/events/EventEmitter';
import { BlueskyService } from '@src/services/BlueskyService';
import { NotFoundError } from '@src/services/errors/CustomErrors';
import { STORAGE_KEYS, ERRORS, LABELS } from '@src/constants/Constants';

// Adjust the interface as needed, ensuring `uri` is always present
interface BlockedUser {
    subject: {
        handle?: string;
        did: string;
    };
    uri: string; // Must contain the final record key or full URI
}

declare var chrome: any;

export class BlockedUsersService extends EventEmitter {
    private blockedUsersData: BlockedUser[] = [];
    private blockedUsersMap: Map<string, BlockedUser> = new Map();

    constructor(private blueskyService: BlueskyService) {
        super();
    }

    public async getBlockListName(listUri: string): Promise<string> {
        if (!this.blueskyService) throw new Error(ERRORS.FAILED_TO_RESOLVE_HANDLE_FROM_DID);
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

    /**
     * Rebuilds the in-memory map after fetch or refresh.
     */
    private buildBlockedUsersMap(): void {
        this.blockedUsersMap.clear();
        for (const user of this.blockedUsersData) {
            const handle = user.subject.handle || user.subject.did;
            const rkey = this.extractRKey(user.uri);
            // Store only the rkey in "uri" if you prefer, to avoid re-fetch
            this.blockedUsersMap.set(handle, {
                ...user,
                uri: rkey || '',
            });
        }
    }

    private extractRKey(uri: string): string | null {
        if (!uri) return null;
        const parts = uri.split('/');
        return parts.length > 0 ? parts.pop() || null : null;
    }

    public isUserBlocked(userHandle: string): boolean {
        return this.blockedUsersMap.has(userHandle);
    }

    /**
     * Called from the inline "Block" button after receiving the block API response
     * from BlueskyService. This ensures we store the user's uri/did in local data.
     */
    public async addBlockedUserFromResponse(
        apiResponse: any,
        userHandle: string,
        listUri: string
    ): Promise<void> {
        try {
            // The blockUser response no longer returns 'subject.did'
            // but it does return 'uri'
            const { uri } = apiResponse;
            if (!uri) {
                throw new Error('API response missing uri');
            }
            // If we still need DID, let's resolve it from userHandle
            const did = await this.resolveDidFromHandle(userHandle);

            // Before adding, remove any old record if it exists
            this.blockedUsersData = this.blockedUsersData.filter((item) => {
                const handle = item.subject.handle || item.subject.did;
                return handle !== userHandle;
            });

            const newItem: BlockedUser = {
                subject: { handle: userHandle, did },
                uri, // from the API (full record URI or partial)
            };

            // Insert new item at the top
            this.blockedUsersData.unshift(newItem);
            this.blockedUsersMap.set(userHandle, newItem);

            await this.saveBlockedUsersToStorage(listUri, this.blockedUsersData);
            this.emit('blockedUserAdded', newItem);
        } catch (error) {
            console.error(`Failed to add blocked user from API response for ${userHandle}:`, error);
            this.emit('error', `Failed to add blocked user ${userHandle}.`);
        }
    }

    /**
     * @deprecated Not used directly from action buttons anymore, but we can keep or remove.
     * This was used in older flows to block a user by handle without reusing the API response.
     */
    public async addBlockedUser(userHandle: string, listUri: string): Promise<void> {
        try {
            // Just keep it if other flows still use it, or remove if not needed.
            if (this.isUserBlocked(userHandle)) {
                return; // Already blocked, do nothing
            }
            const did = await this.blueskyService.resolveDidFromHandle(userHandle);

            const newItem = {
                subject: { handle: userHandle, did },
                uri: '',
            };

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

        const blockedUser = this.blockedUsersMap.get(userHandle);
        const rkey = blockedUser?.uri;

        if (!rkey) {
            console.warn(`rkey for user ${userHandle} not found locally. Falling back to full API unblock.`);

            try {
                await this.blueskyService.unblockUser(userHandle, listUri);
            } catch (error) {
                if (error instanceof NotFoundError) {
                    // Already unblocked
                    this.cleanupAfterUnblock(userHandle, listUri);
                } else {
                    console.error('Failed to remove blocked user via fallback:', error);
                    this.emit('error', 'Failed to remove blocked user.');
                }
            }

            return;
        }

        // If we do have an RKey, we can call unblockUserWithRKey
        try {
            await this.blueskyService.unblockUserWithRKey(rkey, listUri);
            this.cleanupAfterUnblock(userHandle, listUri);
        } catch (error) {
            if (error instanceof NotFoundError) {
                // Already unblocked
                this.cleanupAfterUnblock(userHandle, listUri);
            } else {
                console.error('Failed to remove blocked user:', error);
                this.emit('error', 'Failed to remove blocked user.');
            }
        }
    }

    /**
     * Shared logic for removing user from local structures.
     */
    private async cleanupAfterUnblock(userHandle: string, listUri: string): Promise<void> {
        this.blockedUsersMap.delete(userHandle);
        this.blockedUsersData = this.blockedUsersData.filter((item) => {
            const handle = item.subject.handle || item.subject.did;
            return handle !== userHandle;
        });

        await this.saveBlockedUsersToStorage(listUri, this.blockedUsersData);
        this.emit('blockedUserRemoved', userHandle);
    }

    public async resolveHandleFromDid(did: string): Promise<string> {
        return this.blueskyService.resolveHandleFromDid(did);
    }

    public async resolveDidFromHandle(handle: string): Promise<string> {
        return this.blueskyService.resolveDidFromHandle(handle);
    }

    public async reportAccount(userDid: string, reasonType: string, reason: string = ''): Promise<void> {
        await this.blueskyService.reportAccount(userDid, reasonType, reason);
    }

    public getBlockedUsersData(): BlockedUser[] {
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

    private getBlockedUsersFromStorage(listUri: string): Promise<BlockedUser[] | null> {
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

    private saveBlockedUsersToStorage(listUri: string, blockedUsers: BlockedUser[]): Promise<void> {
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
