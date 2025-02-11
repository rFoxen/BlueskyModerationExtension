import { IMigration } from './Migration';
import Logger from '@src/utils/logger/Logger';

export class Migration1 implements IMigration {
    version = 1;

    migrate(db: IDBDatabase, transaction: IDBTransaction): void {
        Logger.debug('[Migration1] Creating initial object stores');

        if (!db.objectStoreNames.contains('blockedUsers')) {
            const blockedUsersStore = db.createObjectStore('blockedUsers', {
                keyPath: 'id',
            });
            blockedUsersStore.createIndex('listUriIndex', 'listUri', {
                unique: false,
            });
            blockedUsersStore.createIndex('userHandleIndex', 'userHandle', {
                unique: false,
            });
            // Create composite index for efficient pagination
            blockedUsersStore.createIndex('listUriOrderIndex', ['listUri', 'order'], {
                unique: false,
            });
            // Create composite index for efficient pagination
            blockedUsersStore.createIndex('listUriUserHandleIndex', ['listUri', 'userHandle'], {
                unique: false,
            });
            Logger.debug(
                '[Migration1] Created "blockedUsers" store with indexes including "listUriOrderIndex"'
            );
        }

        if (!db.objectStoreNames.contains('listMetadata')) {
            db.createObjectStore('listMetadata', { keyPath: 'listUri' });
            Logger.debug('[Migration1] Created "listMetadata" store');
        }
    }
}
