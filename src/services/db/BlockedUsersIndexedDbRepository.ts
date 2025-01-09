import Logger from '@src/utils/logger/Logger';
import { IndexedDbBlockedUser } from'types/IndexedDbBlockedUser';

export class BlockedUsersIndexedDbRepository {
    private dbName = 'BlueskyModerationDB';
    private storeName = 'blockedUsers';
    private dbVersion = 3; // Incremented from 2 to 3
    private dbInstance!: IDBDatabase;

    constructor() {
        this.initDB();
    }
    
    private initDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = this.handleUpgrade.bind(this);
            request.onsuccess = this.handleSuccess.bind(this, resolve);
            request.onerror = this.handleError.bind(this, reject);
        });
    }

    private handleUpgrade(event: IDBVersionChangeEvent): void {
        const db = (event.target as IDBOpenDBRequest).result;
        this.setupObjectStore(db);
    }

    private handleSuccess(resolve: () => void): void {
        this.dbInstance = (event?.target as IDBOpenDBRequest).result;
        resolve();
    }

    private handleError(reject: (reason?: any) => void, event: Event): void {
        const request = event.target as IDBOpenDBRequest;
        Logger.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
    }

    private setupObjectStore(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(this.storeName)) {
            this.createObjectStore(db);
        } else {
            this.updateExistingObjectStore(db);
        }
    }

    private createObjectStore(db: IDBDatabase): void {
        const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
        this.createIndexes(store);
    }

    private createIndexes(store: IDBObjectStore): void {
        store.createIndex('listUriIndex', 'listUri', { unique: false });
        store.createIndex('userHandleIndex', 'userHandle', { unique: false });
        store.createIndex('userHandleListUriIndex', ['userHandle', 'listUri'], { unique: false });
    }

    private updateExistingObjectStore(db: IDBDatabase): void {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        if (!store.indexNames.contains('userHandleListUriIndex')) {
            store.createIndex('userHandleListUriIndex', ['userHandle', 'listUri'], { unique: false });
        }
    }

    public async getAllByListUri(listUri: string): Promise<IndexedDbBlockedUser[]> {
        if (!this.isDbInitialized()) {
            return [];
        }

        try {
            const blockedUsers = await this.queryIndexedDB(listUri);
            return this.sortBlockedUsersDescending(blockedUsers);
        } catch (error) {
            Logger.error('Failed to getAllByListUri:', error);
            throw error;
        }
    }

    private sortBlockedUsersDescending(blockedUsers: IndexedDbBlockedUser[]): IndexedDbBlockedUser[] {
        return blockedUsers.sort((a, b) => b.timestamp - a.timestamp);
    }

    private queryIndexedDB(listUri: string): Promise<IndexedDbBlockedUser[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.dbInstance!.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('listUriIndex');
            const request = index.getAll(IDBKeyRange.only(listUri));

            request.onsuccess = () => {
                resolve(request.result as IndexedDbBlockedUser[]);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    private sortBlockedUsers(blockedUsers: IndexedDbBlockedUser[]): IndexedDbBlockedUser[] {
        return blockedUsers.sort((a, b) => b.timestamp - a.timestamp);
    }
    
    /**
     * Checks if a userHandle is blocked within the specified listUris.
     * @param userHandle The user handle to check.
     * @param listUris An array of list URIs to restrict the check.
     * @returns Promise resolving to true if blocked in any of the specified lists, else false.
     */
    public async isUserHandleBlocked(userHandle: string, listUris: string[]): Promise<boolean> {
        if (this.shouldAssumeUserNotBlocked(listUris)) {
            return false;
        }

        try {
            return await this.checkUserHandleInLists(userHandle, listUris);
        } catch (error) {
            Logger.error('Error checking if user handle is blocked:', error);
            throw error;
        }
    }

    private shouldAssumeUserNotBlocked(listUris: string[]): boolean {
        if (listUris.length === 0) {
            Logger.warn('No list URIs provided. Assuming user is not blocked.');
            return true;
        }
        return false;
    }

    private async checkUserHandleInLists(userHandle: string, listUris: string[]): Promise<boolean> {
        if (!this.isDbInitialized()) {
            Logger.warn('IndexedDB instance not initialized. Assuming user is not blocked.');
            return false;
        }

        const transaction = this.dbInstance.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('userHandleListUriIndex');

        const checkPromises = this.buildCheckPromises(index, userHandle, listUris);
        const results = await Promise.all(checkPromises);
        return results.includes(true);
    }

    private buildCheckPromises(
        index: IDBIndex,
        userHandle: string,
        listUris: string[]
    ): Promise<boolean>[] {
        return listUris.map(listUri => this.queryUserHandleListUri(index, userHandle, listUri));
    }

    private queryUserHandleListUri(index: IDBIndex, userHandle: string, listUri: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const range = IDBKeyRange.only([userHandle, listUri]);
            const request = index.openCursor(range);

            request.onsuccess = () => {
                const cursor = request.result;
                resolve(!!cursor);
            };

            request.onerror = () => {
                Logger.error('Failed to query userHandleListUriIndex:', request.error);
                reject(request.error);
            };
        });
    }

    public async addOrUpdate(
        listUri: string,
        userHandle: string,
        did: string,
        recordUri: string,
        timestamp: number
    ): Promise<void> {
        Logger.time(`addOrUpdate => ${userHandle}`);
        if (!this.dbInstance) {
            Logger.warn('IndexedDB instance not initialized. Skipping addOrUpdate.');
            Logger.timeEnd(`addOrUpdate => ${userHandle}`);
            return;
        }

        try {
            const data = this.constructIndexedDbBlockedUser(listUri, userHandle, did, recordUri, timestamp);
            await this.putDataInStore(data);
            Logger.timeEnd(`addOrUpdate => ${userHandle}`);
        } catch (error) {
            Logger.error('Failed to add/update blocked user:', error);
            Logger.timeEnd(`addOrUpdate => ${userHandle}`);
            throw error;
        }
    }

    private constructIndexedDbBlockedUser(
        listUri: string,
        userHandle: string,
        did: string,
        recordUri: string,
        timestamp: number
    ): IndexedDbBlockedUser {
        return {
            id: this.constructId(listUri, userHandle),
            listUri: listUri,
            userHandle: userHandle,
            did: did,
            recordUri: recordUri,
            timestamp: timestamp,
        };
    }

    private putDataInStore(data: IndexedDbBlockedUser): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.createTransaction('readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(data);

            this.handleRequest(request, resolve, reject);
        });
    }

    private createTransaction(mode: IDBTransactionMode): IDBTransaction {
        return this.dbInstance!.transaction(this.storeName, mode);
    }

    private handleRequest(
        request: IDBRequest<any>,
        resolve: () => void,
        reject: (reason?: any) => void
    ): void {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    }

    public async addOrUpdateBulk(
        listUri: string,
        items: { userHandle: string; did: string; recordUri: string; timestamp: number }[]
    ): Promise<void> {
        if (!this.isDbInitialized()) return;
        if (this.isBulkOperationEmpty(items)) return;

        Logger.time('addOrUpdateBulk');

        try {
            const dataItems = this.transformBulkItems(listUri, items);
            await this.putBulkDataInStore(dataItems);
            Logger.timeEnd('addOrUpdateBulk');
        } catch (error) {
            Logger.error('Failed in addOrUpdateBulk transaction:', error);
            Logger.timeEnd('addOrUpdateBulk');
            throw error;
        }
    }

    private isDbInitialized(): boolean {
        if (!this.dbInstance) {
            Logger.warn('IndexedDB instance not initialized. Skipping addOrUpdateBulk.');
            return false;
        }
        return true;
    }

    private isBulkOperationEmpty(items: any[]): boolean {
        if (items.length === 0) {
            Logger.info('No items provided for addOrUpdateBulk.');
            return true;
        }
        return false;
    }

    private transformBulkItems(
        listUri: string,
        items: { userHandle: string; did: string; recordUri: string; timestamp: number }[]
    ): IndexedDbBlockedUser[] {
        return items.map(item => this.constructIndexedDbBlockedUserBulk(listUri, item));
    }


    private constructIndexedDbBlockedUserBulk(
        listUri: string,
        item: { userHandle: string; did: string; recordUri: string; timestamp: number }
    ): IndexedDbBlockedUser {
        return {
            id: this.constructId(listUri, item.userHandle),
            listUri: listUri,
            userHandle: item.userHandle,
            did: item.did,
            recordUri: item.recordUri,
            timestamp: item.timestamp,
        };
    }


    private putBulkDataInStore(dataItems: IndexedDbBlockedUser[]): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.dbInstance!.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);

            dataItems.forEach(data => {
                store.put(data);
            });
        });
    }
    
    public async remove(listUri: string, userHandle: string): Promise<void> {
        if (!this.isDbInitialized()) return;

        try {
            const id = this.constructId(listUri, userHandle);
            await this.deleteFromStore(id);
        } catch (error) {
            Logger.error('Failed to remove blocked user:', error);
            throw error;
        }
    }

    private constructId(listUri: string, userHandle: string): string {
        return `${listUri}#${userHandle}`;
    }

    private deleteFromStore(id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.dbInstance!.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    public async clearAll(): Promise<void> {
        if (!this.isDbInitialized()) return;

        try {
            await this.clearEntireStore();
        } catch (error) {
            Logger.error('Failed to clear blocked users:', error);
            throw error;
        }
    }
    
        private clearEntireStore(): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.dbInstance!.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    public clearStoreByListUri(listUri: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.createTransaction('readwrite');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('listUriIndex');
            const openCursorReq = index.openCursor(IDBKeyRange.only(listUri));

            openCursorReq.onsuccess = this.handleCursorSuccess.bind(this, store, resolve);
            openCursorReq.onerror = this.handleCursorError.bind(this, reject);
        });
    }
    
    private handleCursorSuccess(
        store: IDBObjectStore,
        resolve: () => void,
        event: Event
    ): void {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
            store.delete(cursor.primaryKey);
            cursor.continue();
        } else {
            resolve();
        }
    }
    
    private handleCursorError(
        reject: (reason?: any) => void,
        event: Event
    ): void {
        const request = event.target as IDBRequest;
        reject(request.error);
    }

}
