// File: CacheService.ts
export interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

export class CacheService {
    private caches: Map<string, Map<string, CacheEntry<any>>> = new Map();
    private defaultTTL: number; // in milliseconds

    constructor(defaultTTL: number = 5 * 60 * 1000) { // default TTL: 5 minutes
        this.defaultTTL = defaultTTL;
    }

    /**
     * Retrieves data from the specified cache.
     * @param namespace The cache namespace.
     * @param key The key for the cached data.
     * @param ttl Optional TTL for this specific entry.
     * @returns The cached data if valid, otherwise undefined.
     */
    public get<T>(namespace: string, key: string, ttl?: number): T | undefined {
        const cache = this.getCache(namespace);
        const entry = cache.get(key);
        if (entry) {
            const currentTime = Date.now();
            const entryTTL = ttl !== undefined ? ttl : this.defaultTTL;
            if (currentTime - entry.timestamp < entryTTL) {
                return entry.data as T;
            } else {
                cache.delete(key); // Remove expired entry
            }
        }
        return undefined;
    }

    /**
     * Sets data in the specified cache.
     * @param namespace The cache namespace.
     * @param key The key for the cached data.
     * @param data The data to cache.
     * @param ttl Optional TTL for this specific entry.
     */
    public set<T>(namespace: string, key: string, data: T, ttl?: number): void {
        const cache = this.getCache(namespace);
        const entryTTL = ttl !== undefined ? ttl : this.defaultTTL;
        // Optionally implement cache size limits per namespace here
        cache.set(key, { data, timestamp: Date.now() });
    }

    /**
     * Clears all entries in the specified cache namespace.
     * @param namespace The cache namespace to clear.
     */
    public clear(namespace: string): void {
        const cache = this.caches.get(namespace);
        if (cache) {
            cache.clear();
        }
    }

    /**
     * Clears all caches.
     */
    public clearAll(): void {
        this.caches.forEach(cache => cache.clear());
    }

    /**
     * Removes expired entries from all caches.
     */
    public clearExpired(): void {
        const currentTime = Date.now();
        this.caches.forEach((cache, namespace) => {
            cache.forEach((entry, key) => {
                if (currentTime - entry.timestamp >= this.defaultTTL) {
                    cache.delete(key);
                }
            });
        });
    }

    /**
     * Retrieves the cache map for a given namespace, creating it if it doesn't exist.
     * @param namespace The cache namespace.
     * @returns The cache map.
     */
    private getCache(namespace: string): Map<string, CacheEntry<any>> {
        if (!this.caches.has(namespace)) {
            this.caches.set(namespace, new Map());
        }
        return this.caches.get(namespace)!;
    }
}
