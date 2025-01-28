import Logger from '@src/utils/logger/Logger';

interface TransactionOptions<R> {
    storeNames: string[];
    mode: IDBTransactionMode;
    operations: (stores: { [key: string]: IDBObjectStore }) => Promise<R>;
    retries?: number;
    retryDelay?: number; // in milliseconds
}

export class TransactionManager {
    private maxRetries: number;
    private retryDelay: number;

    constructor(private readonly db: IDBDatabase, maxRetries = 3, retryDelay = 1000) {
        this.maxRetries = maxRetries;
        this.retryDelay = retryDelay;
    }

    /**
     * Executes a series of operations within a single transaction.
     * Supports multiple object stores within the same transaction.
     *
     * @param options - Configuration for the transaction execution.
     * @returns A promise that resolves with the result of the operations or rejects with an error.
     */
    public executeTransaction<R>(
        options: TransactionOptions<R>
    ): Promise<R> {
        const { storeNames, mode, operations, retries = this.maxRetries, retryDelay = this.retryDelay } = options;

        const attempt = (attemptNumber: number): Promise<R> => {
            return new Promise<R>((resolve, reject) => {
                const transaction = this.db.transaction(storeNames, mode);
                const stores: { [key: string]: IDBObjectStore } = {};

                storeNames.forEach((storeName) => {
                    stores[storeName] = transaction.objectStore(storeName);
                });

                let operationResult: R | undefined;
                let operationError: any = null;

                transaction.oncomplete = () => {
                    if (operationError) {
                        reject(operationError);
                    } else {
                        resolve(operationResult as R);
                    }
                };

                transaction.onerror = () => {
                    Logger.error(
                        `[DEBUG-IDB] Transaction error for stores: ${storeNames.join(', ')} -`,
                        transaction.error
                    );
                    reject(transaction.error);
                };

                transaction.onabort = () => {
                    Logger.warn(
                        `[DEBUG-IDB] Transaction aborted for stores: ${storeNames.join(', ')}.`
                    );
                    reject(new Error('Transaction aborted'));
                };

                operations(stores)
                    .then((result) => {
                        operationResult = result;
                    })
                    .catch((error) => {
                        operationError = error;
                        Logger.error(
                            `[DEBUG-IDB] Operations within transaction failed -`,
                            error
                        );
                        transaction.abort();
                    });
            }).catch((error) => {
                if (attemptNumber < retries) {
                    Logger.warn(
                        `[DEBUG-IDB] Transaction attempt ${attemptNumber} failed. Retrying in ${retryDelay}ms...`,
                        error
                    );
                    return this.delay(retryDelay).then(() => attempt(attemptNumber + 1));
                } else {
                    Logger.error(
                        `[DEBUG-IDB] Transaction failed after ${retries} attempts.`,
                        error
                    );
                    throw error;
                }
            });
        };

        return attempt(1);
    }

    /**
     * Retrieves an object store within a transaction.
     *
     * @param storeName - The name of the object store.
     * @param mode - The mode of the transaction ('readonly' or 'readwrite').
     * @returns The requested object store.
     */
    public getObjectStore(
        storeName: string,
        mode: IDBTransactionMode
    ): IDBObjectStore {
        const transaction = this.db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);

        transaction.oncomplete = () => {
            Logger.debug(
                `[DEBUG-IDB] Transaction completed successfully for store: ${storeName}.`
            );
        };

        transaction.onerror = () => {
            Logger.error(
                `[DEBUG-IDB] Transaction error for store: ${storeName} -`,
                transaction.error
            );
        };

        transaction.onabort = () => {
            Logger.warn(`[DEBUG-IDB] Transaction aborted for store: ${storeName}.`);
        };

        return store;
    }

    /**
     * Wraps an IDBRequest into a promise for easier async/await handling.
     *
     * @param request - The IDBRequest to wrap.
     * @returns A promise that resolves with the request result or rejects with an error.
     */
    public wrapRequest<R>(request: IDBRequest<R>): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => {
                Logger.error(
                    `[DEBUG-IDB] TransactionManager.wrapRequest => Error in request:`,
                    request.error
                );
                reject(request.error);
            };
        });
    }

    /**
     * Utility function to introduce a delay.
     *
     * @param ms - Milliseconds to delay.
     * @returns A promise that resolves after the specified delay.
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
