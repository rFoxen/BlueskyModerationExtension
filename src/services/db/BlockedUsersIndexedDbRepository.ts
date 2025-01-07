/**
 * A simple IndexedDB repository to store blocked users by listUri.
 * Each blocked user is stored as a separate record with a position to maintain order.
 *
 * Keys:
 *   primaryKey: id (string) -> a combination of listUri + '#' + userHandle
 *   Index: listUriIndex on 'listUri' to fetch all users in a list.
 *   Position is used to maintain the order as received from the API.
 */

interface IndexedDbBlockedUser {
    id: string;          // "listUri#userHandle"
    listUri: string;
    userHandle: string;
    did: string;
    recordUri: string;   // the record URI (or partial rkey) from the Bluesky record
    timestamp: number;    // position to maintain order
}


export class BlockedUsersIndexedDbRepository {
    private dbName = 'BlueskyModerationDB';
    private storeName = 'blockedUsers';
    private dbVersion = 1;
    private dbInstance: IDBDatabase | null = null;

    constructor() {
        this.initDB();
    }

    /**
     * Opens (or upgrades) the IndexedDB database and creates the object store if needed.
     */
    private initDB(): void {
        const request = indexedDB.open(this.dbName, this.dbVersion);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(this.storeName)) {
                const store = db.createObjectStore(this.storeName, {
                    keyPath: 'id', // "listUri#userHandle"
                });
                // Index on listUri for fetching users by list
                store.createIndex('listUriIndex', 'listUri', { unique: false });
            }
        };

        request.onsuccess = () => {
            this.dbInstance = request.result;
        };

        request.onerror = () => {
            console.error('Failed to open IndexedDB:', request.error);
        };
    }

    /**
     * Retrieves all blocked users for a specific listUri, sorted by position.
     */
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
                result.sort((a, b) => a.timestamp - b.timestamp);
                resolve(result);
            };
            request.onerror = () => {
                console.error('Failed to getAllByListUri:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Adds (or updates) a single blocked user record with position.
     */
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
            const id = `${listUri}#${userHandle}`; // Corrected ID construction
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

    /**
     * Inserts or updates multiple users in one transaction to reduce overhead.
     */
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

    /**
     * Removes a single blocked user record by listUri and userHandle.
     */
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

    /**
     * Removes all records from the store that match the given listUri.
     * If no listUri is provided, clears the entire store.
     */
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