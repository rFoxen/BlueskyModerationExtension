import Logger from '@src/utils/logger/Logger';
import { IListMetadata } from 'types/IndexedDbBlockedUser';
import { MonitorPerformance } from '@src/utils/performance/MonitorPerformance';
import { BaseStore } from './BaseStore';



export class MetadataStore extends BaseStore<IListMetadata> {
    constructor(
        db: IDBDatabase,
        private readonly metadataStoreName: string
    ) {
        super(db, metadataStoreName);
    }

    @MonitorPerformance
    public async getListMetadata(listUri: string): Promise<IListMetadata> {
        Logger.debug(
            `[DEBUG-IDB] getListMetadata => listUri="${listUri}" => O(1) read from metadata store`
        );
        const meta = await this.get(listUri);
        return (
            meta || {
                listUri,
                count: 0,
                maxOrder: 0,
                isComplete: false,
                nextCursor: undefined,
            }
        );
    }

    @MonitorPerformance
    public async setListMetadata(listUri: string, meta: IListMetadata): Promise<void> {
        // Ensure defaults for new fields if missing
        if (typeof meta.isComplete !== 'boolean') {
            meta.isComplete = false;
        }
        if (!('nextCursor' in meta)) {
            meta.nextCursor = undefined;
        }
        await this.put(meta);
    }

    @MonitorPerformance
    public async clearAllMetadata(): Promise<void> {
        Logger.debug('[DEBUG-IDB] clearAllMetadata => removing all data from "listMetadata"');
        await this.clear();
    }
}
