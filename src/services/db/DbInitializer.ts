/** File: DbInitializer.ts */
import Logger from '@src/utils/logger/Logger';

export interface IDbInitializer {
    initDB(): Promise<IDBDatabase>;
}

/**
 * Responsible for setting up the IndexedDB database and handling upgrades.
 */
export class DbInitializer implements IDbInitializer {
    constructor(
        private readonly dbName: string,
        private readonly dbVersion: number,
        private readonly storeName: string,
        private readonly metadataStoreName: string
    ) {}

    /**
     * Opens the database and handles `onupgradeneeded`.
     */
    public initDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            Logger.debug(
                `[DEBUG-IDB] Attempting to open IndexedDB "${this.dbName}" with version ${this.dbVersion}.`
            );
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                Logger.debug(
                    `[DEBUG-IDB] onupgradeneeded fired. Old version: ${event.oldVersion}, New version: ${event.newVersion}`
                );
                this.handleUpgrade(event);
            };

            request.onsuccess = (event: Event) => {
                const db = (event.target as IDBOpenDBRequest).result as IDBDatabase;
                Logger.debug(
                    `[DEBUG-IDB] IndexedDB "${this.dbName}" opened successfully at version ${db.version}.`
                );
                Logger.debug(
                    `[DEBUG-IDB] Existing object stores: ${Array.from(db.objectStoreNames).join(', ')}`
                );

                db.onversionchange = () => {
                    Logger.warn(
                        `[DEBUG-IDB] A new version of the database is available. Closing current connection.`
                    );
                    db.close();
                };

                resolve(db);
            };

            request.onerror = (event: Event) => {
                const req = event.target as IDBOpenDBRequest;
                Logger.error(`[DEBUG-IDB] Failed to open IndexedDB "${this.dbName}":`, req.error);
                reject(req.error);
            };

            request.onblocked = () => {
                Logger.warn(
                    `[DEBUG-IDB] Opening IndexedDB "${this.dbName}" is blocked. Please close other connections.`
                );
            };
        });
    }

    /**
     * Runs when a new version of the DB is detected; ensures object stores and indexes exist.
     */
    private handleUpgrade(event: IDBVersionChangeEvent): void {
        const openRequest = event.target as IDBOpenDBRequest;
        const db = openRequest.result as IDBDatabase;
        Logger.debug(
            `[DEBUG-IDB] onupgradeneeded => oldVersion=${event.oldVersion}, newVersion=${event.newVersion}`
        );

        const upgradeTx = openRequest.transaction;
        if (!upgradeTx) {
            Logger.warn(
                '[DEBUG-IDB] No upgrade transaction available in onupgradeneeded. Skipping index checks...'
            );
            return;
        }

        this.ensureBlockedUsersStore(db, upgradeTx);
        this.ensureMetadataStore(db);
    }

    /**
     * Ensures or creates the "blockedUsers" store and its indexes.
     */
    private ensureBlockedUsersStore(db: IDBDatabase, upgradeTx: IDBTransaction): void {
        if (!db.objectStoreNames.contains(this.storeName)) {
            Logger.debug(`[DEBUG-IDB] Creating object store => "${this.storeName}"`);
            const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
            this.createBlockedUsersIndexes(store);
        } else {
            this.updateExistingObjectStore(db, upgradeTx);
        }
    }

    /**
     * Ensures or creates the "listMetadata" store.
     */
    private ensureMetadataStore(db: IDBDatabase): void {
        if (!db.objectStoreNames.contains(this.metadataStoreName)) {
            Logger.debug(`[DEBUG-IDB] Creating metadata store => "${this.metadataStoreName}"`);
            db.createObjectStore(this.metadataStoreName, { keyPath: 'listUri' });
        }
    }

    /**
     * Creates all necessary indexes on the "blockedUsers" store.
     */
    private createBlockedUsersIndexes(store: IDBObjectStore): void {
        store.createIndex('listUriIndex', 'listUri', { unique: false });
        store.createIndex('userHandleIndex', 'userHandle', { unique: false });
        store.createIndex('userHandleListUriIndex', ['userHandle', 'listUri'], {
            unique: false,
        });
        store.createIndex('orderIndex', 'order', { unique: false });
        store.createIndex('listUriHandleIndex', ['listUri', 'userHandle'], {
            unique: false,
        });
        store.createIndex('listUriOrderIndex', ['listUri', 'order'], { unique: false });
    }

    /**
     * Updates the existing "blockedUsers" store to ensure new indexes exist.
     */
    private updateExistingObjectStore(db: IDBDatabase, upgradeTx: IDBTransaction): void {
        Logger.debug('[DEBUG-IDB] updateExistingObjectStore => verifying indexes...');
        const store = upgradeTx.objectStore(this.storeName);

        if (!store.indexNames.contains('userHandleListUriIndex')) {
            Logger.debug('[DEBUG-IDB] Creating userHandleListUriIndex...');
            store.createIndex('userHandleListUriIndex', ['userHandle', 'listUri'], {
                unique: false,
            });
        }
        if (!store.indexNames.contains('orderIndex')) {
            Logger.debug('[DEBUG-IDB] Creating orderIndex...');
            store.createIndex('orderIndex', 'order', { unique: false });
        }
        if (!store.indexNames.contains('listUriOrderIndex')) {
            Logger.debug('[DEBUG-IDB] Creating listUriOrderIndex...');
            store.createIndex('listUriOrderIndex', ['listUri', 'order'], { unique: false });
        }
        if (!store.indexNames.contains('listUriHandleIndex')) {
            Logger.debug('[DEBUG-IDB] Creating listUriHandleIndex...');
            store.createIndex('listUriHandleIndex', ['listUri', 'userHandle'], {
                unique: false,
            });
        }
    }
}
