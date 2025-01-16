// File: NgramStore.ts
// Path: C:/Users/benne/RiderProjects/BlueskyModerationExtension/src/services/db/NgramStore.ts

import Logger from '@src/utils/logger/Logger';
import { BaseStore } from './BaseStore';

export interface NgramEntry {
    ngram: string;
    handles: string[]; // Array of userHandle IDs associated with the ngram
}

export class NgramStore extends BaseStore<NgramEntry> {
    constructor(db: IDBDatabase, storeName: string) {
        super(db, storeName);
    }

    /**
     * Adds a user handle to the relevant n-grams.
     * @param userHandle The user handle to index.
     */
    public async addHandle(userHandle: string): Promise<void> {
        const ngrams = this.generateNGrams(userHandle);
        const transaction = this.db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);

        for (const ngram of ngrams) {
            const request = store.get(ngram);
            request.onsuccess = () => {
                const entry: NgramEntry = request.result;
                if (entry) {
                    if (!entry.handles.includes(userHandle)) {
                        entry.handles.push(userHandle);
                        store.put(entry);
                    }
                } else {
                    store.put({ ngram, handles: [userHandle] });
                }
            };
            request.onerror = () => {
                Logger.error(`[DEBUG-IDB] Failed to get ngram "${ngram}":`, request.error);
            };
        }

        return new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => {
                Logger.error('[DEBUG-IDB] addHandle transaction error:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * Removes a user handle from the relevant n-grams.
     * @param userHandle The user handle to remove from the index.
     */
    public async removeHandle(userHandle: string): Promise<void> {
        const ngrams = this.generateNGrams(userHandle);
        const transaction = this.db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);

        for (const ngram of ngrams) {
            const request = store.get(ngram);
            request.onsuccess = () => {
                const entry: NgramEntry = request.result;
                if (entry) {
                    const index = entry.handles.indexOf(userHandle);
                    if (index > -1) {
                        entry.handles.splice(index, 1);
                        if (entry.handles.length > 0) {
                            store.put(entry);
                        } else {
                            store.delete(ngram);
                        }
                    }
                }
            };
            request.onerror = () => {
                Logger.error(`[DEBUG-IDB] Failed to get ngram "${ngram}":`, request.error);
            };
        }

        return new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => {
                Logger.error('[DEBUG-IDB] removeHandle transaction error:', transaction.error);
                reject(transaction.error);
            };
        });
    }

    /**
     * Searches for user handles that match the partial handle using n-grams.
     * @param partialHandle The substring to search for.
     * @returns A Set of matching user handles.
     */
    public async searchHandles(partialHandle: string): Promise<Set<string>> {
        const ngrams = this.generateNGrams(partialHandle);
        if (ngrams.length === 0) return new Set();

        const transaction = this.db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const index = store.index('handlesIndex');

        const handleSets: Set<string>[] = [];

        for (const ngram of ngrams) {
            const request = index.getAllKeys(ngram);
            const handles: string[] = await new Promise<string[]>((resolve, reject) => {
                request.onsuccess = () => resolve(request.result as string[]);
                request.onerror = () => {
                    Logger.error(`[DEBUG-IDB] Failed to search ngram "${ngram}":`, request.error);
                    resolve([]);
                };
            });
            handleSets.push(new Set(handles));
        }

        // Intersection of all handle sets
        const intersection = handleSets.reduce((acc, set) => {
            return new Set([...acc].filter(x => set.has(x)));
        }, handleSets[0] || new Set());

        return intersection;
    }

    /**
     * Generates n-grams from a given text.
     * @param text The text to generate n-grams from.
     * @param n The length of each n-gram. Default is 3.
     * @returns An array of n-grams.
     */
    private generateNGrams(text: string, n: number = 3): string[] {
        const grams = [];
        const length = text.length;
        if (length < n) {
            grams.push(text);
            return grams;
        }
        for (let i = 0; i <= length - n; i++) {
            grams.push(text.substring(i, i + n));
        }
        return grams;
    }
}
