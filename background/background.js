// Instantiate services
const storageService = new StorageService();
const authenticationService = new AuthenticationService(storageService);
const apiClient = new ApiClient(authenticationService);
const identityService = new IdentityService(apiClient);
const blockListManager = new BlockListManager(apiClient, authenticationService, identityService);
const contextMenuManager = new ContextMenuManager(blockListManager);

// Storage change listener
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.accessJwt && !changes.accessJwt.newValue) {
        NotificationManager.showNotification(
            "You have been logged out. Please log in again.",
            "Session Expired"
        );
    }
});

// Listener for messages from content scripts
browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === "loginUser") {
        const { identifier, password } = message;
        try {
            const data = await authenticationService.login(identifier, password);
            return { success: true, data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else if (message.action === "logoutUser") {
        await authenticationService.logout();
        return { success: true };
    } else if (message.action === "getAuthenticationStatus") {
        const isAuthenticated = await authenticationService.isAuthenticated();
        let handle = null;
        if (isAuthenticated) {
            handle = await authenticationService.getHandle();
        }
        return { isAuthenticated, handle };
    } else if (message.action === "getBlockLists") {
        try {
            const blockLists = await blockListManager.getBlockLists();
            const { selectedBlockList } = await storageService.get("selectedBlockList");
            return { blockLists, selectedBlockList };
        } catch (error) {
            console.error("Error getting block lists:", error);
            return { blockLists: [], selectedBlockList: null };
        }
    } else if (message.action === "updateSelectedBlockList") {
        try {
            await storageService.set({
                selectedBlockList: message.selectedBlockList,
            });
            console.log("Selected block list updated to:", message.selectedBlockList);
            return { success: true };
        } catch (error) {
            console.error("Error updating selected block list:", error);
            return { success: false };
        }
    } else if (message.action === "getBlockListCount") {
        try {
            const count = await blockListManager.getBlockListCount(
                message.blockListUri
            );
            return { count };
        } catch (error) {
            console.error("Error getting block list count:", error);
            return { count: null };
        }
    } else if (message.action === "blockUserFromContentScript") {
        const userHandle = Utilities.sanitizeInput(message.userHandle);
        const position = message.position;
        try {
            const userDid = await identityService.resolveDidFromHandle(userHandle);
            await blockListManager.blockUser(
                userDid,
                userHandle,
                sender.tab.id,
                position
            );
        } catch (error) {
            console.error("Error blocking user from content script:", error);
            NotificationManager.showNotification(
                "An error occurred while blocking the user.",
                "Error"
            );
        }
    } else if (message.action === "reportUserFromContentScript") {
        const userHandle = Utilities.sanitizeInput(message.userHandle);
        const reason = message.reason || "";
        const reasonType = message.reasonType || "com.atproto.moderation.defs#reasonSpam";
        const position = message.position;
        try {
            const userDid = await identityService.resolveDidFromHandle(userHandle);
            await blockListManager.reportAccount(userHandle, userDid, reasonType, reason, position);
        } catch (error) {
            console.error("Error reporting user from content script:", error);
            NotificationManager.showNotification(
                "An error occurred while reporting the user.",
                "Error"
            );
        }
    }
});
