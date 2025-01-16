import Logger from '@src/utils/logger/Logger';

export class TransactionManager {
    private transaction!: IDBTransaction;

    constructor(private readonly db: IDBDatabase) {}

    public getObjectStore(
        storeName: string,
        mode: IDBTransactionMode
    ): IDBObjectStore {
        this.transaction = this.db.transaction(storeName, mode);
        return this.transaction.objectStore(storeName);
    }

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
