// File: BlockedUsersIndexedDbRepository.ts

interface IndexedDbBlockedUser {
    id: string;          // "listUri#userHandle"
    listUri: string;
    userHandle: string;
    did: string;
    recordUri: string;   // the record URI (or partial rkey) from the Bluesky record
    timestamp: number;   // position to maintain order
}

export class BlockedUsersIndexedDbRepository {
    private dbName = 'BlueskyModerationDB';
    private storeName = 'blockedUsers';
    private dbVersion = 3; // Incremented from 2 to 3
    private dbInstance: IDBDatabase | null = null;

    constructor() {
        this.initDB();
    }

    private initDB(): void {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(this.storeName)) {
                // Create object store if it doesn't exist
                const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
                store.createIndex('listUriIndex', 'listUri', { unique: false });
                store.createIndex('userHandleIndex', 'userHandle', { unique: false });
                // Create composite index
                store.createIndex('userHandleListUriIndex', ['userHandle', 'listUri'], { unique: false });
            } else {
                const store = request.transaction?.objectStore(this.storeName);
                if (store) {
                    // Check if 'userHandleListUriIndex' exists, if not, create it
                    if (!store.indexNames.contains('userHandleListUriIndex')) {
                        store.createIndex('userHandleListUriIndex', ['userHandle', 'listUri'], { unique: false });
                    }
                }
            }
        };

        request.onsuccess = () => {
            this.dbInstance = request.result;
        };

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
        };
    }

    public getAllByListUri(listUri: string): Promise<IndexedDbBlockedUser[]> {
        return new Promise((resolve, reject) => {
            if (!this.dbInstance) {
                return resolve([]); // Gracefully return empty if DB isn't ready
            }

            const transaction = this.dbInstance.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('listUriIndex');
            const request = index.getAll(IDBKeyRange.only(listUri));

            request.onsuccess = () => {
                const result = request.result as IndexedDbBlockedUser[];
                // Sort by timestamp in descending order to have newest first
                result.sort((a, b) => b.timestamp - a.timestamp);
                resolve(result);
            };

            request.onerror = () => {
                console.error('Failed to getAllByListUri:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Checks if a userHandle is blocked within the specified listUris.
     * @param userHandle The user handle to check.
     * @param listUris An array of list URIs to restrict the check.
     * @returns Promise resolving to true if blocked in any of the specified lists, else false.
     */
    public async isUserHandleBlocked(userHandle: string, listUris: string[]): Promise<boolean> {

        return new Promise((resolve, reject) => {
            if (!this.dbInstance || listUris.length === 0) return resolve(false);
            
            const transaction = this.dbInstance.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const index = store.index('userHandleListUriIndex');

            const range = IDBKeyRange.bound([userHandle, listUris[0]], [userHandle, listUris[listUris.length - 1]]);
            const request = index.openCursor(range);
            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                while (cursor) {
                    const [handle, uri] = cursor.key as [string, string];
                    if (handle === userHandle && listUris.includes(uri)) {
                        resolve(true);
                        return;
                    }
                    cursor.continue();
                }
                resolve(false);
            };
            request.onerror = () => {
                console.error('Failed to query userHandleListUriIndex:', request.error);
                reject(request.error);
            };
        });
    }


    public addOrUpdate(
        listUri: string,
        userHandle: string,
        did: string,
        recordUri: string,
        timestamp: number
    ): Promise<void> {
        console.time(`[DEBUG] addOrUpdate => ${userHandle}`);
        return new Promise((resolve, reject) => {
            if (!this.dbInstance) {
                return resolve();
            }

            const transaction = this.dbInstance.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const id = `${listUri}#${userHandle}`; // Ensure the ID format is correct
            const data: IndexedDbBlockedUser = {
                id,
                listUri,
                userHandle,
                did,
                recordUri,
                timestamp,
            };

            const request = store.put(data);

            request.onsuccess = () => {
                console.timeEnd(`[DEBUG] addOrUpdate => ${userHandle}`);
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to add/update blocked user:', request.error);
                console.timeEnd(`[DEBUG] addOrUpdate => ${userHandle}`);
                reject(request.error);
            };
        });
    }

    public addOrUpdateBulk(
        listUri: string,
        items: { userHandle: string; did: string; recordUri: string; timestamp: number }[]
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.dbInstance) {
                return resolve();
            }

            console.time('[DEBUG] addOrUpdateBulk');
            const transaction = this.dbInstance.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);

            transaction.oncomplete = () => {
                console.timeEnd('[DEBUG] addOrUpdateBulk');
                resolve();
            };

            transaction.onerror = () => {
                console.error('Failed in addOrUpdateBulk transaction:', transaction.error);
                console.timeEnd('[DEBUG] addOrUpdateBulk');
                reject(transaction.error);
            };

            // Bulk put each user
            for (const item of items) {
                const { userHandle, did, recordUri, timestamp } = item;
                const id = `${listUri}#${userHandle}`;
                const data: IndexedDbBlockedUser = {
                    id,
                    listUri,
                    userHandle,
                    did,
                    recordUri,
                    timestamp,
                };
                store.put(data);
            }
        });
    }

    public remove(listUri: string, userHandle: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.dbInstance) {
                return resolve();
            }

            const transaction = this.dbInstance.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const id = `${listUri}#${userHandle}`;
            const request = store.delete(id);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                console.error('Failed to remove blocked user:', request.error);
                reject(request.error);
            };
        });
    }

    public clearAll(listUri?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.dbInstance) {
                return resolve();
            }

            const transaction = this.dbInstance.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);

            if (!listUri) {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } else {
                // Remove all records that match this listUri using the index
                const index = store.index('listUriIndex');
                const openCursorReq = index.openCursor(IDBKeyRange.only(listUri));

                openCursorReq.onsuccess = (event) => {
                    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                    if (cursor) {
                        store.delete(cursor.primaryKey);
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };

                openCursorReq.onerror = () => {
                    reject(openCursorReq.error);
                };
            }
        });
    }
}
