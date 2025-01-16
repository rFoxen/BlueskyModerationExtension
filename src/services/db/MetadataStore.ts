/** File: MetadataStore.ts */
import Logger from '@src/utils/logger/Logger';
import { MonitorPerformance } from '@src/utils/performance/MonitorPerformance';

export interface IListMetadata {
    listUri: string;
    count: number;
    maxOrder: number;
}

/**
 * Manages read/write operations on the "listMetadata" store.
 */
export class MetadataStore {
    constructor(
        private readonly db: IDBDatabase,
        private readonly metadataStoreName: string
    ) {} 

    /**
     * Retrieves the metadata record for a given listUri; returns defaults if none exist.
     */
    @MonitorPerformance
    public getListMetadata(listUri: string): Promise<IListMetadata> {
        Logger.debug(
            `[DEBUG-IDB] getListMetadata => listUri="${listUri}" => O(1) read from metadata store`
        );
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.metadataStoreName, 'readonly');
            const store = tx.objectStore(this.metadataStoreName);
            const req = store.get(listUri);

            req.onsuccess = () => {
                if (!req.result) {
                    resolve({ listUri, count: 0, maxOrder: 0 });
                } else {
                    resolve(req.result as IListMetadata);
                }
            };
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Saves a metadata record for a given listUri, overwriting any existing one.
     */
    @MonitorPerformance
    public setListMetadata(listUri: string, meta: IListMetadata): Promise<void> {
        Logger.debug(
            `[DEBUG-IDB] setListMetadata => listUri="${listUri}", count=${meta.count}, maxOrder=${meta.maxOrder}`
        );
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.metadataStoreName, 'readwrite');
            const store = tx.objectStore(this.metadataStoreName);
            const req = store.put(meta);

            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Clears all metadata records for all listUris.
     */
    @MonitorPerformance
    public clearAllMetadata(): Promise<void> {
        Logger.debug('[DEBUG-IDB] clearAllMetadata => removing all data from "listMetadata"');
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.metadataStoreName, 'readwrite');
            const store = tx.objectStore(this.metadataStoreName);
            const req = store.clear();

            req.onsuccess = () => {
                Logger.debug('[DEBUG-IDB] clearAllMetadata => store cleared successfully');
                resolve();
            };
            req.onerror = () => {
                Logger.error('[DEBUG-IDB] clearAllMetadata => request.onerror:', req.error);
                reject(req.error);
            };
        });
    }
}
