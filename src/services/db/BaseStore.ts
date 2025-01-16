import Logger from '@src/utils/logger/Logger';
import { MonitorPerformance } from '@src/utils/performance/MonitorPerformance';
import { TransactionManager } from './TransactionManager';

/**
 * A generic base class for IndexedDB stores.
 * @template T The type of the records stored.
 */
export class BaseStore<T> {
    protected transactionManager: TransactionManager;
    
    constructor(
        protected readonly db: IDBDatabase,
        protected readonly storeName: string
    ) {
        this.transactionManager = new TransactionManager(db);
    }

    protected async performRequest<R>(
        mode: IDBTransactionMode,
        operation: (store: IDBObjectStore) => Promise<R>
    ): Promise<R> {
        try {
            return await this.transactionManager.executeTransaction<R>(
                [this.storeName],
                mode,
                async (stores) => {
                    const store = stores[this.storeName];
                    return await operation(store);
                }
            );
        } catch (error) {
            Logger.error(
                `[DEBUG-IDB] performRequest => Error during operation on store="${this.storeName}":`,
                error
            );
            throw error;
        }
    }
    
    /**
     * Retrieves a record by its primary key.
     * @param key The primary key of the record.
     */
    @MonitorPerformance
    public async get(key: IDBValidKey): Promise<T | undefined> {
        return this.performRequest('readonly', async (store) => {
            const request = store.get(key);
            return this.transactionManager.wrapRequest(request);
        });
    }

    /**
     * Retrieves all records from the store.
     */
    @MonitorPerformance
    public async getAll(): Promise<T[]> {
        return this.performRequest('readonly', async (store) => {
            const request = store.getAll();
            return this.transactionManager.wrapRequest(request);
        });
    }

    /**
     * Adds or updates a record in the store.
     * @param record The record to add or update.
     */
    @MonitorPerformance
    public async put(record: T): Promise<void> {
        await this.performRequest('readwrite', async (store) => {
            const request = store.put(record);
            await this.transactionManager.wrapRequest(request);
        });
    }

    /**
     * Deletes a record by its primary key.
     * @param key The primary key of the record to delete.
     */
    @MonitorPerformance
    public async delete(key: IDBValidKey): Promise<void> {
        await this.performRequest('readwrite', async (store) => {
            const request = store.delete(key);
            await this.transactionManager.wrapRequest(request);
        });
    }

    /**
     * Clears all records from the store.
     */
    @MonitorPerformance
    public async clear(): Promise<void> {
        await this.performRequest('readwrite', async (store) => {
            const request = store.clear();
            await this.transactionManager.wrapRequest(request);
        });
    }

    /**
     * Executes a query with a given IDBKeyRange and direction.
     * @param indexName The name of the index to query.
     * @param range The IDBKeyRange to apply.
     * @param direction The direction of the cursor ('next', 'prev', etc.).
     */
    @MonitorPerformance
    public async openCursor(
        indexName: string,
        range: IDBKeyRange,
        direction: IDBCursorDirection = 'next'
    ): Promise<IDBCursorWithValue | null> {
        return this.performRequest('readonly', async (store) => {
            const request = store.index(indexName).openCursor(range, direction);
            return this.transactionManager.wrapRequest(request);
        });
    }
} 
