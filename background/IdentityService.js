class IdentityService {
    constructor(apiClient) {
        this.apiClient = apiClient;
    }

    async resolveDidFromHandle(handle) {
        try {
            const data = await fetch(
                `https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(
                    handle
                )}`
            );
            const result = await data.json();

            if (result.did) {
                console.log(`Resolved DID for @${handle}: ${result.did}`);
                return result.did;
            } else {
                throw new Error("Failed to resolve DID");
            }
        } catch (error) {
            console.error("Error resolving DID:", error);
            throw error;
        }
    }
}

// Expose to global scope
window.IdentityService = IdentityService;
