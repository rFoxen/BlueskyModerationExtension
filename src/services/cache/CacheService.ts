/**
 * CacheService handles caching logic for DID <-> handle resolution or other data.
 */

export class CacheService {
    private didToHandleCache: Map<string, string> = new Map();
    private handleToDidCache: Map<string, string> = new Map();

    public getHandleFromDid(did: string): string | undefined {
        return this.didToHandleCache.get(did);
    }

    public setHandleForDid(did: string, handle: string): void {
        this.didToHandleCache.set(did, handle);
        this.handleToDidCache.set(handle, did);
    }

    public getDidFromHandle(handle: string): string | undefined {
        return this.handleToDidCache.get(handle);
    }
}
