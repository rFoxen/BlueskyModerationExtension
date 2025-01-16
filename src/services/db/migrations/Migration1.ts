import { IMigration } from './Migration';
import Logger from '@src/utils/logger/Logger';

export class Migration1 implements IMigration {
    version = 1;

    migrate(db: IDBDatabase, transaction: IDBTransaction): void {
        Logger.debug('[Migration1] Creating initial object stores');
        if (!db.objectStoreNames.contains('blockedUsers')) {
            const blockedUsersStore = db.createObjectStore('blockedUsers', { keyPath: 'id' });
            blockedUsersStore.createIndex('listUriIndex', 'listUri', { unique: false });
            blockedUsersStore.createIndex('userHandleIndex', 'userHandle', { unique: false });
            // Add additional indexes as needed
            Logger.debug('[Migration1] Created "blockedUsers" store with indexes');
        }

        if (!db.objectStoreNames.contains('listMetadata')) {
            const metadataStore = db.createObjectStore('listMetadata', { keyPath: 'listUri' });
            Logger.debug('[Migration1] Created "listMetadata" store');
        }
    }
}
