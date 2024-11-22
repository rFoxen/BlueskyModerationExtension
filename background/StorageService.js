class StorageService {
    async get(keys) {
        return await browser.storage.local.get(keys);
    }

    async set(items) {
        return await browser.storage.local.set(items);
    }

    async remove(keys) {
        return await browser.storage.local.remove(keys);
    }
}

// Expose to global scope
window.StorageService = StorageService;
