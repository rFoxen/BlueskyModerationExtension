import Logger from '@src/utils/logger/Logger';
import { IndexedDbBlockedUser } from 'types/IndexedDbBlockedUser';
import { DbInitializer } from './DbInitializer';
import { MetadataStore } from './MetadataStore';
import { BlockedUsersStore } from './BlockedUsersStore';

export class BlockedUsersIndexedDbRepository {
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

    public async importAllData(data: any): Promise<void> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return;

        // Example of structure we expect:
        // data = {
        //   blockedUsers: IndexedDbBlockedUser[],
        //   metadata: IListMetadata[],
        // }

        // 1) Clear existing
        await this.clearAll(); // clears blockedUsers & metadata

        // 2) Re-insert all blocked users
        if (Array.isArray(data.blockedUsers)) {
            await this.blockedUsersStore.bulkPutRecords(data.blockedUsers);
        }

        // 3) Re-insert all metadata
        if (Array.isArray(data.metadata)) {
            for (const meta of data.metadata) {
                await this.metadataStore.setListMetadata(meta.listUri, meta);
            }
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

    public async getMaxOrder(listUri: string): Promise<number> {
        await this.ensureDbReady();
        if (!this.isDbInitialized()) return 0;
        return this.blockedUsersStore.getMaxOrder(listUri);
    }
}
