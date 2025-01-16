import Logger from '@src/utils/logger/Logger';

export class TransactionManager {
    constructor(private readonly db: IDBDatabase) {}

    /**
     * Executes a series of operations within a single transaction.
     * Supports multiple object stores within the same transaction.
     *
     * @param storeNames - Array of object store names involved in the transaction.
     * @param mode - The mode of the transaction ('readonly' or 'readwrite').
     * @param operations - A callback function that receives the object stores and performs operations.
     * @returns A promise that resolves with the result of the operations or rejects with an error.
     */
    public executeTransaction<R>(
        storeNames: string[],
        mode: IDBTransactionMode,
        operations: (stores: { [key: string]: IDBObjectStore }) => Promise<R>
    ): Promise<R> {
        return new Promise<R>((resolve, reject) => {
            const transaction = this.db.transaction(storeNames, mode);
            const stores: { [key: string]: IDBObjectStore } = {};

            storeNames.forEach((storeName) => {
                stores[storeName] = transaction.objectStore(storeName);
            });

            transaction.oncomplete = () => {
                Logger.debug(
                    `[DEBUG-IDB] Transaction completed successfully for stores: ${storeNames.join(
                        ', '
                    )}.`
                );
            };

            transaction.onerror = () => {
                Logger.error(
                    `[DEBUG-IDB] Transaction error for stores: ${storeNames.join(
                        ', '
                    )} -`,
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
                    // Note: Do not resolve here; wait for transaction to complete to ensure all operations succeeded.
                    // The result will be resolved in transaction.oncomplete if no errors occur.
                    // However, to propagate the result, we can store it temporarily.
                    (transaction as any)._result = result;
                })
                .catch((error) => {
                    Logger.error(
                        `[DEBUG-IDB] Operations within transaction failed -`,
                        error
                    );
                    transaction.abort();
                    reject(error);
                });

            transaction.oncomplete = () => {
                if ((transaction as any)._result !== undefined) {
                    resolve((transaction as any)._result);
                } else {
                    resolve(undefined as unknown as R);
                }
            };
        });
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
}
