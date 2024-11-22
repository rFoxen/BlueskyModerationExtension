class ApiClient {
    constructor(authenticationService) {
        this.authenticationService = authenticationService;
    }

    async fetchWithAuth(url, options = {}) {
        const accessJwt = await this.authenticationService.getAccessToken();

        if (!accessJwt) {
            throw new Error("User not authenticated.");
        }

        options.headers = {
            ...options.headers,
            Authorization: `Bearer ${accessJwt}`,
        };

        let response;
        try {
            response = await fetch(url, options);
        } catch (error) {
            console.error("Network error:", error);
            throw new Error("Network error occurred.");
        }

        if (response.status === 401) {
            NotificationManager.showNotification(
                "Session expired. Please log in again.",
                "Session Expired"
            );
            await this.authenticationService.logout();
            throw new Error("Session expired.");
        }

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { message: "Unknown error" };
            }
            throw new Error(errorData.message || "Unknown error");
        }

        return response.json();
    }
}

// Expose to global scope
window.ApiClient = ApiClient;
