/** File: BlockedUsersStore.ts */
import Logger from '@src/utils/logger/Logger';
import { IndexedDbBlockedUser } from 'types/IndexedDbBlockedUser';
import { IListMetadata, MetadataStore } from './MetadataStore';
import { BaseStore } from './BaseStore';
import { MonitorPerformance } from '@src/utils/performance/MonitorPerformance';

/**
 * Manages read/write operations on the "blockedUsers" store.
 */
export class BlockedUsersStore extends BaseStore<IndexedDbBlockedUser> {
    constructor(
        db: IDBDatabase,
        storeName: string,
        private readonly metadataStore: MetadataStore
    ) {
        super(db, storeName);
    }

    // ------------------------
    // Public Store Operations
    // ------------------------

    /**
     * Retrieves all blocked users for a specific list URI, sorted in descending order.
     * @param listUri The URI of the block list.
     */
    @MonitorPerformance
    public async getAllByListUri(listUri: string): Promise<IndexedDbBlockedUser[]> {
        Logger.debug(`[DEBUG-IDB] getAllByListUri => listUri="${listUri}"`);
        const blockedUsers = await this.queryByListUri(listUri);
        return this.sortBlockedUsersDescending(blockedUsers);
        Logger.debug(`[DEBUG-IDB] getAllByListUri => Finished"`);
    }

    /**
     * Retrieves all blocked users across all lists, sorted in descending order.
     */
    @MonitorPerformance
    public async getAll(): Promise<IndexedDbBlockedUser[]> {
        Logger.debug('[DEBUG-IDB] getAll => fetching all records');
        const blockedUsers = await super.getAll(); // Correctly calling the parent method
        const sortedUsers = this.sortBlockedUsersDescending(blockedUsers);
        Logger.debug(`[DEBUG-IDB] getAll => Finished`);
        return sortedUsers;
    }

    /**
     * Retrieves a blocked user by their handle within a specific list.
     * @param listUri The URI of the block list.
     * @param userHandle The handle of the user.
     */
    @MonitorPerformance
    public async getByUserHandle(
        listUri: string,
        userHandle: string
    ): Promise<IndexedDbBlockedUser | null> {
        Logger.debug(
            `[DEBUG-IDB] getByUserHandle => listUri="${listUri}", userHandle="${userHandle}"`
        );
        const normalizedHandle = userHandle.toLowerCase();
        const id = this.constructId(listUri, normalizedHandle);
        // @ts-ignore
        return this.get(id) || null;
    }

    /**
     * Searches blocked users by partial handle within a specific list.
     * @param listUri The URI of the block list.
     * @param partialHandle The partial handle to search for.
     * @param page The page number for pagination.
     * @param pageSize The number of results per page.
     */
    @MonitorPerformance
    public async searchByHandle(
        listUri: string,
        partialHandle: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<{ users: IndexedDbBlockedUser[]; total: number }> {
        Logger.debug(
            `[DEBUG-IDB] searchByHandle => listUri="${listUri}", partialHandle="${partialHandle}", page=${page}, pageSize=${pageSize}`
        );
        const normalizedHandle = partialHandle.toLowerCase();
        const total = await this.getSearchCount(listUri, normalizedHandle);
        if (total === 0) {
            return { users: [], total: 0 };
        }
        const users = await this.getSearchResults(listUri, normalizedHandle, page, pageSize);
        return { users, total };
    }

    /**
     * Checks if a user handle is blocked in any of the provided lists.
     * @param userHandle The handle of the user.
     * @param listUris An array of list URIs to check against.
     */
    @MonitorPerformance
    public async isUserHandleBlocked(
        userHandle: string,
        listUris: string[]
    ): Promise<boolean> {
        Logger.debug(
            `[DEBUG-IDB] isUserHandleBlocked => userHandle="${userHandle}", listUris=${JSON.stringify(
                listUris
            )}`
        );
        if (listUris.length === 0) {
            Logger.warn('[DEBUG-IDB] No list URIs provided, returning not blocked => false.');
            return false;
        }
        return this.checkUserHandleInLists(userHandle, listUris);
    }

    /**
     * Adds or updates a blocked user in the store.
     * @param listUri The URI of the block list.
     * @param userHandle The handle of the user.
     * @param did The DID of the user.
     * @param recordUri The record URI from the Bluesky API.
     * @param order The order position of the user.
     */
    @MonitorPerformance
    public async addOrUpdate(
        listUri: string,
        userHandle: string,
        did: string,
        recordUri: string,
        order: number
    ): Promise<void> {
        Logger.time(`addOrUpdate => handle="${userHandle}", listUri="${listUri}"`);
        try {
            const data = this.constructBlockedUser(listUri, userHandle, did, recordUri, order);
            Logger.debug(`[DEBUG-IDB] addOrUpdate => ${JSON.stringify(data)}`);

            const existing = await this.getByUserHandle(listUri, userHandle);
            await this.put(data);
            await this.updateMetadataAfterAddOrUpdate(listUri, existing, order);
        } finally {
            Logger.timeEnd(`addOrUpdate => handle="${userHandle}", listUri="${listUri}"`);
        }
    }

    /**
     * Adds or updates multiple blocked users in bulk.
     * @param listUri The URI of the block list.
     * @param items An array of blocked user items.
     */
    @MonitorPerformance
    public async addOrUpdateBulk(
        listUri: string,
        items: {
            userHandle: string;
            did: string;
            recordUri: string;
            order: number;
        }[]
    ): Promise<void> {
        Logger.debug(
            `[DEBUG-IDB] addOrUpdateBulk => listUri="${listUri}", items.length=${items.length}`
        );
        if (items.length === 0) {
            Logger.info('[DEBUG-IDB] addOrUpdateBulk => no items provided for bulk.');
            return;
        }

        Logger.time('addOrUpdateBulk');
        try {
            const dataItems = items.map((i) =>
                this.constructBlockedUser(
                    listUri,
                    i.userHandle,
                    i.did,
                    i.recordUri,
                    i.order
                )
            );
            const newInserts = await this.filterNewInserts(listUri, dataItems);

            await this.bulkPutRecords(dataItems);
            await this.updateMetadataAfterBulk(listUri, newInserts, dataItems);
        } finally {
            Logger.timeEnd('addOrUpdateBulk');
        }
    }

    /**
     * Removes a blocked user from the store.
     * @param listUri The URI of the block list.
     * @param userHandle The handle of the user to remove.
     */
    @MonitorPerformance
    public async remove(listUri: string, userHandle: string): Promise<void> {
        Logger.debug(`[DEBUG-IDB] remove => userHandle="${userHandle}", listUri="${listUri}"`);
        const existing = await this.getByUserHandle(listUri, userHandle);
        if (!existing) {
            Logger.debug(`[DEBUG-IDB] remove => user not found, skipping => ${userHandle}`);
            return;
        }

        await this.delete(existing.id);
        await this.updateMetadataAfterRemove(listUri, existing);
    }

    /**
     * Clears all blocked users from the store and metadata.
     */
    @MonitorPerformance
    public async clearAll(): Promise<void> {
        Logger.warn('[DEBUG-IDB] clearAll => clearing entire "blockedUsers" store...');
        await this.clear();
        await this.metadataStore.clearAllMetadata();
    }

    /**
     * Clears all blocked users from a specific list URI and resets its metadata.
     * @param listUri The URI of the block list to clear.
     */
    @MonitorPerformance
    public async clearStoreByListUri(listUri: string): Promise<void> {
        Logger.debug(`[DEBUG-IDB] clearStoreByListUri => listUri="${listUri}"`);
        await this.deleteByListUriRange(listUri);
        // Reset metadata
        await this.metadataStore.setListMetadata(listUri, {
            listUri,
            count: 0,
            maxOrder: 0,
        });
    }

    /**
     * Retrieves a paginated list of blocked users for a specific list URI.
     * @param listUri The URI of the block list.
     * @param page The page number.
     * @param pageSize The number of users per page.
     */
    @MonitorPerformance
    public async getPageByListUri(
        listUri: string,
        page: number,
        pageSize: number
    ): Promise<IndexedDbBlockedUser[]> {
        Logger.debug(
            `[DEBUG-PAGINATION] getPageByListUri => listUri="${listUri}", page=${page}, pageSize=${pageSize}`
        );
        return this.paginateByListUri(listUri, page, pageSize);
    }

    /**
     * Retrieves the count of blocked users in a specific list URI.
     * @param listUri The URI of the block list.
     */
    @MonitorPerformance
    public async getCountByListUri(listUri: string): Promise<number> {
        Logger.debug(`[DEBUG-IDB] getCountByListUri => listUri="${listUri}"`);
        const meta = await this.metadataStore.getListMetadata(listUri);
        return meta.count;
    }

    /**
     * Retrieves the maximum order value in a specific list URI.
     * @param listUri The URI of the block list.
     */
    @MonitorPerformance
    public async getMaxOrder(listUri: string): Promise<number> {
        Logger.debug(`[DEBUG-IDB] getMaxOrder => listUri="${listUri}"`);
        const meta = await this.metadataStore.getListMetadata(listUri);
        return meta.maxOrder;
    }

    // ------------------------
    // Internals
    // ------------------------

    /**
     * Queries blocked users by list URI using the 'listUriIndex'.
     * @param listUri The URI of the block list.
     */
    @MonitorPerformance
    private async queryByListUri(listUri: string): Promise<IndexedDbBlockedUser[]> {
        return new Promise((resolve, reject) => {
            const index = 'listUriIndex';
            const range = IDBKeyRange.only(listUri);
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const idx = store.index(index);
            const request = idx.getAll(range);

            request.onsuccess = () => {
                const results = request.result as IndexedDbBlockedUser[];
                resolve(results);
            };

            request.onerror = () => {
                Logger.error('[DEBUG-IDB] queryByListUri =>', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Counts the number of blocked users matching the partial handle within a specific list URI.
     * @param listUri The URI of the block list.
     * @param normalizedPartialHandle The normalized (lowercase) partial handle.
     */
    @MonitorPerformance
    private async getSearchCount(
        listUri: string,
        normalizedPartialHandle: string
    ): Promise<number> {
        const index = 'listUriHandleIndex';
        const range = this.buildPartialHandleRange(listUri, normalizedPartialHandle);

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const idx = store.index(index);
            const countRequest = idx.count(range);

            countRequest.onsuccess = () => {
                resolve(countRequest.result);
            };
            countRequest.onerror = () => {
                Logger.error('[DEBUG-IDB] getSearchCount =>', countRequest.error);
                reject(countRequest.error);
            };
        });
    }

    /**
     * Retrieves search results for blocked users by partial handle within a specific list URI.
     * @param listUri The URI of the block list.
     * @param normalizedPartialHandle The normalized (lowercase) partial handle.
     * @param page The page number.
     * @param pageSize The number of users per page.
     */
    @MonitorPerformance
    private async getSearchResults(
        listUri: string,
        normalizedPartialHandle: string,
        page: number,
        pageSize: number
    ): Promise<IndexedDbBlockedUser[]> {
        const index = 'listUriHandleIndex';
        const range = this.buildPartialHandleRange(listUri, normalizedPartialHandle);
        const offset = (page - 1) * pageSize;

        return new Promise((resolve, reject) => {
            const results: IndexedDbBlockedUser[] = [];
            let skipped = 0;
            let taken = 0;

            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const idx = store.index(index);
            const request = idx.openCursor(range, 'next');

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(results);
                    return;
                }
                if (skipped < offset) {
                    skipped++;
                    cursor.continue();
                } else if (taken < pageSize) {
                    results.push(cursor.value as IndexedDbBlockedUser);
                    taken++;
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = () => {
                Logger.error('[DEBUG-IDB] getSearchResults =>', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Builds an IDBKeyRange for partial handle searches.
     * @param listUri The URI of the block list.
     * @param handle The partial handle.
     */
    @MonitorPerformance
    private buildPartialHandleRange(listUri: string, handle: string): IDBKeyRange {
        const lowerBound = [listUri, handle];
        const upperBound = [listUri, handle + '\uffff'];
        return IDBKeyRange.bound(lowerBound, upperBound);
    }

    /**
     * Checks if a user handle is blocked in any of the provided list URIs.
     * @param userHandle The handle of the user.
     * @param listUris An array of list URIs to check against.
     */
    @MonitorPerformance
    private async checkUserHandleInLists(
        userHandle: string,
        listUris: string[]
    ): Promise<boolean> {
        const normalizedHandle = userHandle.toLowerCase();
        const index = 'userHandleListUriIndex';
        const checks = listUris.map((uri) => {
            return new Promise<boolean>((resolve, reject) => {
                const range = IDBKeyRange.only([normalizedHandle, uri]);
                const cursorRequest = this.openCursor(index, range, 'next');

                cursorRequest
                    .then((cursor) => {
                        resolve(!!cursor);
                    })
                    .catch((error) => {
                        reject(error);
                    });
            });
        });

        const results = await Promise.all(checks);
        return results.includes(true);
    }

    // ---- Insertion/Updates ----

    /**
     * Adds or updates multiple blocked user records in bulk.
     * @param dataItems An array of blocked user data items.
     */
    @MonitorPerformance
    private async bulkPutRecords(dataItems: IndexedDbBlockedUser[]): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);

            tx.oncomplete = () => resolve();
            tx.onerror = () => {
                Logger.error('[DEBUG-IDB] bulkPutRecords => Transaction error:', tx.error);
                reject(tx.error);
            };

            dataItems.forEach((data) => {
                store.put(data);
            });
        });
    }

    /**
     * Deletes all blocked user records within a specific list URI range.
     * @param listUri The URI of the block list.
     */
    @MonitorPerformance
    private async deleteByListUriRange(listUri: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const lowerBound = `${listUri}#`;
            const upperBound = `${listUri}#\uffff`;
            const range = IDBKeyRange.bound(lowerBound, upperBound);
            const request = store.delete(range);
            request.onsuccess = () => resolve();
            request.onerror = () => {
                Logger.error('[DEBUG-IDB] deleteByListUriRange =>', request.error);
                reject(request.error);
            };
        });
    }


    // ---- Pagination ----

    /**
     * Retrieves a paginated list of blocked users for a specific list URI.
     * @param listUri The URI of the block list.
     * @param page The page number.
     * @param pageSize The number of users per page.
     */
    @MonitorPerformance
    private async paginateByListUri(
        listUri: string,
        page: number,
        pageSize: number
    ): Promise<IndexedDbBlockedUser[]> {
        const index = 'listUriOrderIndex';
        const range = IDBKeyRange.bound(
            [listUri, Number.MIN_SAFE_INTEGER],
            [listUri, Number.MAX_SAFE_INTEGER]
        );
        const offset = (page - 1) * pageSize;

        return new Promise((resolve, reject) => {
            const results: IndexedDbBlockedUser[] = [];
            let skipped = 0;
            let taken = 0;

            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const idx = store.index(index);
            const request = idx.openCursor(range, 'prev');

            request.onsuccess = () => {
                const cursor = request.result;
                if (!cursor) {
                    resolve(results);
                    return;
                }
                if (skipped < offset) {
                    skipped++;
                    cursor.continue();
                } else if (taken < pageSize) {
                    results.push(cursor.value as IndexedDbBlockedUser);
                    taken++;
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = () => {
                Logger.error('[DEBUG-IDB] paginateByListUri =>', request.error);
                reject(request.error);
            };
        });
    }

    // ------------------------
    // Metadata Updates
    // ------------------------

    /**
     * Updates metadata after adding or updating a blocked user.
     * @param listUri The URI of the block list.
     * @param existing The existing blocked user record, if any.
     * @param order The order value of the new or updated record.
     */
    @MonitorPerformance
    private async updateMetadataAfterAddOrUpdate(
        listUri: string,
        existing: IndexedDbBlockedUser | null,
        order: number
    ): Promise<void> {
        const meta = await this.metadataStore.getListMetadata(listUri);

        if (!existing) {
            meta.count += 1; // New record
        }
        if (order > meta.maxOrder) {
            meta.maxOrder = order;
        }
        await this.metadataStore.setListMetadata(listUri, meta);
    }

    /**
     * Updates metadata after bulk adding or updating blocked users.
     * @param listUri The URI of the block list.
     * @param newInserts The number of new inserts.
     * @param dataItems The array of blocked user data items.
     */
    @MonitorPerformance
    private async updateMetadataAfterBulk(
        listUri: string,
        newInserts: number,
        dataItems: IndexedDbBlockedUser[]
    ): Promise<void> {
        const meta = await this.metadataStore.getListMetadata(listUri);
        meta.count += newInserts;

        const highestNewOrder = Math.max(...dataItems.map((d) => d.order), 0);
        if (highestNewOrder > meta.maxOrder) {
            meta.maxOrder = highestNewOrder;
        }
        await this.metadataStore.setListMetadata(listUri, meta);
    }

    /**
     * Updates metadata after removing a blocked user.
     * @param listUri The URI of the block list.
     * @param removedUser The blocked user that was removed.
     */
    @MonitorPerformance
    private async updateMetadataAfterRemove(
        listUri: string,
        removedUser: IndexedDbBlockedUser
    ): Promise<void> {
        const meta = await this.metadataStore.getListMetadata(listUri);
        meta.count = Math.max(0, meta.count - 1);

        // If the removed user had the maxOrder, recalculate
        if (removedUser.order === meta.maxOrder) {
            const remaining = await this.getAllByListUri(listUri);
            meta.maxOrder = remaining.length
                ? Math.max(...remaining.map((u) => u.order))
                : 0;
        }

        await this.metadataStore.setListMetadata(listUri, meta);
    }

    // ------------------------
    // Helper Methods
    // ------------------------

    /**
     * Constructs a blocked user object.
     * @param listUri The URI of the block list.
     * @param userHandle The handle of the user.
     * @param did The DID of the user.
     * @param recordUri The record URI from the Bluesky API.
     * @param order The order position.
     */
    @MonitorPerformance
    private constructBlockedUser(
        listUri: string,
        userHandle: string,
        did: string,
        recordUri: string,
        order: number
    ): IndexedDbBlockedUser {
        const normalizedHandle = userHandle.toLowerCase();
        const id = this.constructId(listUri, normalizedHandle);
        return { id, listUri, userHandle: normalizedHandle, did, recordUri, order };
    }

    /**
     * Constructs the primary key ID for a blocked user.
     * @param listUri The URI of the block list.
     * @param userHandle The normalized (lowercase) handle of the user.
     */
    private constructId(listUri: string, userHandle: string): string {
        return `${listUri}#${userHandle}`;
    }

    /**
     * Filters out new inserts by checking existing records.
     * @param listUri The URI of the block list.
     * @param dataItems The array of blocked user data items.
     */
    @MonitorPerformance
    private async filterNewInserts(
        listUri: string,
        dataItems: IndexedDbBlockedUser[]
    ): Promise<number> {
        const existing = await this.getAllByListUri(listUri);
        const existingHandles = new Set(existing.map((r) => r.userHandle));
        const newInserts = dataItems.filter((x) => !existingHandles.has(x.userHandle)).length;
        Logger.debug(`[DEBUG-IDB] filterNewInserts => newInserts=${newInserts}`);
        return newInserts;
    }

    /**
     * Sorts blocked users in descending order based on their 'order' value.
     * @param blockedUsers The array of blocked users to sort.
     */
    @MonitorPerformance
    private sortBlockedUsersDescending(
        blockedUsers: IndexedDbBlockedUser[]
    ): IndexedDbBlockedUser[] {
        return blockedUsers.sort((a, b) => b.order - a.order);
    }
}
