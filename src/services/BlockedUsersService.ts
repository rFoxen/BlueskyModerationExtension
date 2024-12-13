// src/services/BlockedUsersService.ts

import { EventEmitter } from '@src/utils/EventEmitter';
import { BlueskyService } from '@src/services/BlueskyService';
import { STORAGE_KEYS, ERRORS, LABELS } from '@src/constants/Constants';

declare var chrome: any;

export class BlockedUsersService extends EventEmitter {
    private blockedUsersData: any[] = [];

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
            await this.saveBlockedUsersToStorage(listUri, blockedUsers);
            this.emit('blockedUsersRefreshed', this.blockedUsersData);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS, error);
            this.emit('error', ERRORS.FAILED_TO_REFRESH_BLOCKED_USERS);
        }
    }

    public isUserBlocked(userHandle: string): boolean {
        return this.blockedUsersData.some(
            (item) => (item.subject.handle || item.subject.did) === userHandle
        );
    }

    public async addBlockedUser(userHandle: string, listUri: string): Promise<void> {
        try {
            const did = await this.blueskyService.resolveDidFromHandle(userHandle);
            const newItem = { subject: { handle: userHandle, did } };
            this.blockedUsersData.unshift(newItem);
            await this.saveBlockedUsersToStorage(listUri, this.blockedUsersData);
            this.emit('blockedUserAdded', newItem);
        } catch (error) {
            console.error('Failed to add blocked user:', error);
            this.emit('error', 'Failed to add blocked user.');
        }
    }

    public async removeBlockedUser(userHandle: string, listUri: string): Promise<void> {
        try {
            await this.blueskyService.unblockUser(userHandle, listUri);
            
            this.blockedUsersData = this.blockedUsersData.filter(
                (item) => (item.subject.handle || item.subject.did) !== userHandle
            );
            await this.saveBlockedUsersToStorage(listUri, this.blockedUsersData);
            this.emit('blockedUserRemoved', userHandle);
        } catch (error) {
            console.error('Failed to remove blocked user:', error);
            this.emit('error', 'Failed to remove blocked user.');
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
                { [`${STORAGE_KEYS.BLOCKED_USERS_PREFIX}${listUri}`]: blockedUsers },
                () => { resolve(); }
            );
        });
    }

    public destroy(): void {
        this.blockedUsersData = [];
        this.removeAllListeners();
    }
}
