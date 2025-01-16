import Logger from '@src/utils/logger/Logger';
import { MonitorPerformance } from '@src/utils/performance/MonitorPerformance';
import { TransactionManager } from './TransactionManager';

/**
 * A generic base class for IndexedDB stores.
 * @template T The type of the records stored.
 */
export class BaseStore<T> {
    private transactionManager: TransactionManager;
    
    constructor(
        protected readonly db: IDBDatabase,
        protected readonly storeName: string
    ) {
        this.transactionManager = new TransactionManager(db);
    }
    
    protected async performRequest<R>(
        mode: IDBTransactionMode,
        operation: (store: IDBObjectStore) => IDBRequest<R>
    ): Promise<R> {
        try {
            const store = this.transactionManager.getObjectStore(
                this.storeName,
                mode
            );
            const request = operation(store);
            const result = await this.transactionManager.wrapRequest(request);
            return result;
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
        return this.performRequest('readonly', (store) => store.get(key));
    }

    /**
     * Retrieves all records from the store.
     */
    @MonitorPerformance
    public async getAll(): Promise<T[]> {
        return this.performRequest('readonly', (store) => store.getAll());
    }

    /**
     * Adds or updates a record in the store.
     * @param record The record to add or update.
     */
    @MonitorPerformance
    public async put(record: T): Promise<void> {
        await this.performRequest('readwrite', (store) => store.put(record));
    }

    /**
     * Deletes a record by its primary key.
     * @param key The primary key of the record to delete.
     */
    @MonitorPerformance
    public async delete(key: IDBValidKey): Promise<void> {
        await this.performRequest('readwrite', (store) => store.delete(key));
    }

    /**
     * Clears all records from the store.
     */
    @MonitorPerformance
    public async clear(): Promise<void> {
        await this.performRequest('readwrite', (store) => store.clear());
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
        return this.performRequest('readonly', (store) =>
            store.index(indexName).openCursor(range, direction)
        );
    }
} 
