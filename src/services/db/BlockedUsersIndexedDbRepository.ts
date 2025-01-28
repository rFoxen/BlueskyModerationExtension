import Logger from '@src/utils/logger/Logger';
import { IndexedDbBlockedUser, IListMetadata } from 'types/IndexedDbBlockedUser';
import { DbInitializer } from './DbInitializer';
import { MetadataStore } from './MetadataStore';
import { BlockedUsersStore } from './BlockedUsersStore';
import {EventEmitter} from "../../utils/events/EventEmitter";

export class BlockedUsersIndexedDbRepository extends EventEmitter {
    private dbInstance!: IDBDatabase;
    private readyPromise: Promise<void>;
    private metadataStore!: MetadataStore;
    private blockedUsersStore!: BlockedUsersStore;

    constructor(
        private readonly dbName: string = 'BlueskyModerationDB',
        private readonly storeName: string = 'blockedUsers',
        private readonly metadataStoreName: string = 'listMetadata',
        private readonly dbVersion: number = 1
    ) {
        super();
        const initializer = new DbInitializer(
            this.dbName,
            this.dbVersion,
            this.storeName,
            this.metadataStoreName
        );

        this.readyPromise = initializer
            .initDB()
            .then((db) => {
                this.dbInstance = db;
                this.metadataStore = new MetadataStore(
                    this.dbInstance,
                    this.metadataStoreName
                );
                this.blockedUsersStore = new BlockedUsersStore(
                    this.dbInstance,
                    this.storeName,
                    this.metadataStore
                );
            })
            .catch((error) => {
                Logger.error('Failed to initialize IndexedDB:', error);
                throw error;
            });
    }

    // ------------------------- //
    // Utility / Lifecycle
    // ------------------------- //

    private async ensureDbReady(): Promise<void> {
        return this.readyPromise;
    }

    private isDbInitialized(): boolean {
        if (!this.dbInstance) {
            Logger.warn('[DEBUG-IDB] DB is not initialized, skipping operation.');
            return false;
        }
        return true;
    }

    // ------------------------- //
    // Public API
    // ------------------------- //

    public async exportAllData(): Promise<any> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return {};

        // 1) Retrieve blocked users
        const blockedUsers = await this.getAll();

        // 2) Retrieve metadata
        // If you want all metadata, you'll need a dedicated method:
        const listUris = await this.getAllListUris();
        const metadata = [];
        for (const listUri of listUris) {
            const meta = await this.metadataStore.getListMetadata(listUri);
            metadata.push(meta);
        }

        return {
            blockedUsers,
            metadata
        };
    }
    
    private static readonly CHUNK_SIZE = 100; // Tweak as desired

    public async importAllData(data: any): Promise<void> {
            await this.ensureDbReady();
            if (!this.isDbInitialized()) return;

        try {
            // 1) Start
            this.emit('dbRestoreProgress', 'Starting database restoration...');

            // 2) Clear existing data
            this.emit('dbRestoreProgress', 'Clearing existing data...');
            await this.clearAll();

            // 3) Insert blocked users in chunks
            if (Array.isArray(data.blockedUsers) && data.blockedUsers.length > 0) {
                const total = data.blockedUsers.length;
                this.emit('dbRestoreProgress', `Found ${total} blocked user(s). Starting insertion...`);

                const chunkCount = Math.ceil(total / BlockedUsersIndexedDbRepository.CHUNK_SIZE);
                let insertedSoFar = 0;

                for (let i = 0; i < total; i += BlockedUsersIndexedDbRepository.CHUNK_SIZE) {
                    const chunkIndex = Math.floor(i / BlockedUsersIndexedDbRepository.CHUNK_SIZE) + 1;
                    const chunk = data.blockedUsers.slice(i, i + BlockedUsersIndexedDbRepository.CHUNK_SIZE);

                    // 3a) "Line update" for chunk info
                    this.emit('dbRestoreProgressUpdate', {
                        lineKey: 'CHUNK_INFO',
                        text: `Inserting chunk ${chunkIndex}/${chunkCount}... (size=${chunk.length})`
                    });

                    await this.blockedUsersStore.bulkPutRecords(chunk);

                    insertedSoFar += chunk.length;
                    // 3b) "Line update" for total inserted so far
                    this.emit('dbRestoreProgressUpdate', {
                        lineKey: 'INSERT_PROGRESS',
                        text: `Inserted ${insertedSoFar}/${total} blocked user(s) so far.`
                    });

                    // (Optional) Small yield to let UI refresh:
                    await new Promise(res => setTimeout(res, 0));
                }
            } else {
                this.emit('dbRestoreProgress', 'No blockedUsers found in JSON');
            }

            // 4) Insert metadata
            if (Array.isArray(data.metadata) && data.metadata.length > 0) {
                this.emit('dbRestoreProgress', `Inserting ${data.metadata.length} metadata record(s)...`);
                for (let j = 0; j < data.metadata.length; j++) {
                    const meta = data.metadata[j];
                    meta.isComplete = true;
                    meta.nextCursor = undefined;
                    await this.metadataStore.setListMetadata(meta.listUri, meta);

                    // "Line update" for metadata record count
                    this.emit('dbRestoreProgressUpdate', {
                        lineKey: 'METADATA_PROGRESS',
                        text: `Metadata item ${j + 1}/${data.metadata.length} inserted.`
                    });
                }
            } else {
                this.emit('dbRestoreProgress', 'No metadata found in JSON');
            }

            // 5) Done
            this.emit('dbRestoreProgress', 'All data imported successfully. Refreshing UI...');
            this.emit('blockedUsersLoaded'); // or similar event
        } catch (error) {
            this.emit('dbRestoreProgress', `Error during restoration: ${(error as Error).message}`);
            throw error;
        }
    }
    
    /**
     * Example helper to find all listUris from blockedUsers.
     */
    private async getAllListUris(): Promise<string[]> {
        const allBlockedUsers = await this.getAll();
        const uris = new Set<string>(allBlockedUsers.map(u => u.listUri));
        return Array.from(uris);
    }
    
    public async getAllByListUri(listUri: string): Promise<IndexedDbBlockedUser[]> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return [];
        return this.blockedUsersStore.getAllByListUriDescending(listUri);
    }

    public async getAll(): Promise<IndexedDbBlockedUser[]> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return [];
        return this.blockedUsersStore.getAll();
    }

    public async getByUserHandle(
        listUri: string,
        userHandle: string
    ): Promise<IndexedDbBlockedUser | null> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return null;
        return this.blockedUsersStore.getByUserHandle(listUri, userHandle);
    }

    public async searchByHandle(
        listUri: string,
        partialHandle: string,
        page: number = 1,
        pageSize: number = 10
    ): Promise<{ users: IndexedDbBlockedUser[]; total: number }> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return { users: [], total: 0 };
        return this.blockedUsersStore.searchByHandle(
            listUri,
            partialHandle,
            page,
            pageSize
        );
    }

    public async getPageByListUri(
        listUri: string,
        page: number,
        pageSize: number
    ): Promise<IndexedDbBlockedUser[]> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return [];
        return this.blockedUsersStore.getPageByListUri(listUri, page, pageSize);
    }

    public async isUserHandleBlocked(
        userHandle: string,
        listUris: string[]
    ): Promise<boolean> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return false;
        return this.blockedUsersStore.isUserHandleBlocked(userHandle, listUris);
    }

    public async addOrUpdate(
        listUri: string,
        userHandle: string,
        did: string,
        recordUri: string,
        order: number
    ): Promise<void> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return;
        return this.blockedUsersStore.addOrUpdate(
            listUri,
            userHandle,
            did,
            recordUri,
            order
        );
    }

    public async addOrUpdateBulk(
        listUri: string,
        items: {
            userHandle: string;
            did: string;
            recordUri: string;
            order: number;
        }[]
    ): Promise<void> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return;
        return this.blockedUsersStore.addOrUpdateBulk(listUri, items);
    }

    public async remove(
        listUri: string,
        userHandle: string
    ): Promise<void> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return;
        return this.blockedUsersStore.remove(listUri, userHandle);
    }

    public async clearAll(): Promise<void> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return;
        Logger.warn('[DEBUG-IDB] clearAll => clearing entire DB data...');
        await this.blockedUsersStore.clearAll();
    }

    public async clearStoreByListUri(listUri: string): Promise<void> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return;
        return this.blockedUsersStore.clearStoreByListUri(listUri);
    }

    // -------------------------------- //
    // Metadata (delegated)
    // -------------------------------- //

    public async getCountByListUri(listUri: string): Promise<number> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return 0;
        return this.blockedUsersStore.getCountByListUri(listUri);
    }

    public async getMetadataForList(listUri: string): Promise<IListMetadata> {
        return this.metadataStore.getListMetadata(listUri);
    }
    public async setMetadataForList(listUri: string, meta: IListMetadata): Promise<void> {
        return this.metadataStore.setListMetadata(listUri, meta);
    }

    public async getMaxOrder(listUri: string): Promise<number> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return 0;
        return this.blockedUsersStore.getMaxOrder(listUri);
    }
}
