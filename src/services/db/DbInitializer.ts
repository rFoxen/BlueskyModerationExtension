// src/services/db/DbInitializer.ts
import Logger from '@src/utils/logger/Logger';
import { IMigration } from './migrations/Migration';
import { MigrationManager } from './migrations/MigrationManager';

export interface IDbInitializer {
    initDB(): Promise<IDBDatabase>;
}

export class DbInitializer implements IDbInitializer {
    private migrationManager: MigrationManager;

    constructor(
        private readonly dbName: string,
        private readonly dbVersion: number,
        private readonly storeName: string,
        private readonly metadataStoreName: string
    ) {
        this.migrationManager = new MigrationManager();
    }

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
                const db = request.result;
                const transaction = request.transaction;
                if (!transaction) {
                    Logger.warn('[DEBUG-IDB] No transaction available during upgrade.');
                    return;
                }
                this.migrationManager.applyMigrations(db, event.oldVersion, event.newVersion!, transaction).catch((error) => {
                    Logger.error('[DEBUG-IDB] Migration failed:', error);
                    throw error;
                });
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
                    Logger.warn(`[DEBUG-IDB] A new version of the database is available. Closing current connection.`);
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
                Logger.warn(`[DEBUG-IDB] Opening IndexedDB "${this.dbName}" is blocked. Please close other connections.`);
            };
        });
    }
}
