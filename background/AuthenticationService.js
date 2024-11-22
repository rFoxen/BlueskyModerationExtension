class AuthenticationService {
    constructor(storageService) {
        this.storageService = storageService;
    }

    async login(identifier, password) {
        try {
            const response = await fetch(
                "https://bsky.social/xrpc/com.atproto.server.createSession",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ identifier, password }),
                }
            );
            const data = await response.json();

            if (data.accessJwt && data.did && data.handle) {
                await this.storageService.set({
                    accessJwt: data.accessJwt,
                    did: data.did,
                    handle: data.handle,
                });
                return data;
            } else {
                throw new Error(data.message || "Unknown error during login.");
            }
        } catch (error) {
            console.error("Login Error:", error);
            throw error;
        }
    }

    async logout() {
        await this.storageService.remove(["accessJwt", "did", "handle"]);
    }

    async getAccessToken() {
        const data = await this.storageService.get(["accessJwt"]);
        return data.accessJwt;
    }

    async isAuthenticated() {
        const accessJwt = await this.getAccessToken();
        return !!accessJwt;
    }

    async getUserDid() {
        const data = await this.storageService.get(["did"]);
        return data.did;
    }

    async getHandle() {
        const data = await this.storageService.get(["handle"]);
        return data.handle;
    }
}

// Expose to global scope
window.AuthenticationService = AuthenticationService;
