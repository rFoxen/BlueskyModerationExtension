/** File: BaseStore.ts */
import Logger from '@src/utils/logger/Logger';
import { MonitorPerformance } from '@src/utils/performance/MonitorPerformance';

/**
 * A generic base class for IndexedDB stores.
 * @template T The type of the records stored.
 */
export class BaseStore<T> {
    constructor(
        protected readonly db: IDBDatabase,
        protected readonly storeName: string
    ) {}

    /**
     * Retrieves a record by its primary key.
     * @param key The primary key of the record.
     */
    @MonitorPerformance
    public get(key: IDBValidKey): Promise<T | undefined> {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = () => {
                resolve(request.result as T | undefined);
            };

            request.onerror = () => {
                Logger.error(`[DEBUG-IDB] get => Error fetching key=${key}:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Retrieves all records from the store.
     */
    @MonitorPerformance
    public getAll(): Promise<T[]> {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const request = store.getAll();

            request.onsuccess = () => {
                resolve(request.result as T[]);
            };

            request.onerror = () => {
                Logger.error(`[DEBUG-IDB] getAll => Error fetching all records:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Adds or updates a record in the store.
     * @param record The record to add or update.
     */
    @MonitorPerformance
    public put(record: T): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.put(record);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                Logger.error(`[DEBUG-IDB] put => Error putting record:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Deletes a record by its primary key.
     * @param key The primary key of the record to delete.
     */
    @MonitorPerformance
    public delete(key: IDBValidKey): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.delete(key);

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                Logger.error(`[DEBUG-IDB] delete => Error deleting key=${key}:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Clears all records from the store.
     */
    @MonitorPerformance
    public clear(): Promise<void> {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                resolve();
            };

            request.onerror = () => {
                Logger.error(`[DEBUG-IDB] clear => Error clearing store:`, request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Executes a query with a given IDBKeyRange and direction.
     * @param indexName The name of the index to query.
     * @param range The IDBKeyRange to apply.
     * @param direction The direction of the cursor ('next', 'prev', etc.).
     */
    @MonitorPerformance
    public openCursor(
        indexName: string,
        range: IDBKeyRange,
        direction: IDBCursorDirection = 'next'
    ): Promise<IDBCursorWithValue | null> {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const index = store.index(indexName);
            const request = index.openCursor(range, direction);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                Logger.error(`[DEBUG-IDB] openCursor => Error opening cursor on index=${indexName}:`, request.error);
                reject(request.error);
            };
        });
    }
} 
