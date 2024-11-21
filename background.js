/* /background.js */
class ApiClient {
    async fetchWithAuth(url, options = {}) {
        const data = await browser.storage.local.get(["accessJwt"]);
        const accessJwt = data.accessJwt;

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
            await browser.storage.local.remove(["accessJwt", "did", "handle"]);
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

    async getUserRepoDid() {
        const data = await browser.storage.local.get(["did"]);
        return data.did;
    }
}

class NotificationManager {
    static notificationBuffer = [];
    static notificationTimer = null;
    static NOTIFICATION_DELAY = 10000;

    static showBatchedNotification(message, title = "Bluesky Moderation") {
        NotificationManager.notificationBuffer.push(message);

        if (!NotificationManager.notificationTimer) {
            NotificationManager.notificationTimer = setTimeout(() => {
                const fullMessage = NotificationManager.notificationBuffer.join("\n");
                browser.notifications.create({
                    type: "basic",
                    iconUrl: browser.runtime.getURL("icons/icon-48.png"),
                    title: title,
                    message: fullMessage,
                });
                NotificationManager.notificationBuffer.length = 0;
                NotificationManager.notificationTimer = null;
            }, NotificationManager.NOTIFICATION_DELAY);
        }
    }

    static showNotification(message, title = "Bluesky Moderation") {
        NotificationManager.showBatchedNotification(message, title);
    }
}

class BlockListManager {
    constructor(apiClient) {
        this.apiClient = apiClient;
        // No longer using in-memory cache
    }

    async _reportSubject(userHandle, reasonType, subject, reason = "") {
        try {
            const body = {
                reason: reason,
                reasonType: reasonType,
                subject: subject,
            };
            await this.apiClient.fetchWithAuth(
                "https://bsky.social/xrpc/com.atproto.moderation.createReport",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }
            );
        } catch (error) {
            console.error(`Failed to report ${subject.type}:`, error);
            NotificationManager.showNotification(
                `Failed to report @${userHandle}: ${error.message}`,
                "Error"
            );
        }
    }

    async reportPost(userHandle, post_cid, post_uri, reason = "") {
        const subject = {
            $type: "com.atproto.repo.strongRef",
            cid: post_cid,
            type: "post",
            uri: post_uri,
        };
        await this._reportSubject(
            userHandle,
            "com.atproto.moderation.defs#reasonMisleading",
            subject,
            reason
        );
    }

    async reportAccount(userHandle, user_did, reason = "") {
        const subject = {
            $type: "com.atproto.admin.defs#repoRef",
            did: user_did,
            type: "account",
        };
        await this._reportSubject(
            userHandle,
            "com.atproto.moderation.defs#reasonSpam",
            subject,
            reason
        );
    }

    async blockUser(userDid, userHandle, tabId, position) {
        try {
            const selectedBlockList = await this.getSelectedBlockList();
            const blockListName = await this.getBlockListName(selectedBlockList);

            const body = {
                repo: await this.apiClient.getUserRepoDid(),
                writes: [
                    {
                        $type: "com.atproto.repo.applyWrites#create",
                        collection: "app.bsky.graph.listitem",
                        value: {
                            list: selectedBlockList,
                            subject: userDid,
                            createdAt: new Date().toISOString(),
                        },
                    },
                ],
            };

            await this.apiClient.fetchWithAuth(
                "https://bsky.social/xrpc/com.atproto.repo.applyWrites",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                }
            );

            console.log(
                `Successfully added @${userHandle} to the block list "${blockListName}".`
            );

            if (tabId && position) {
                browser.tabs
                    .sendMessage(tabId, {
                        action: "showEffect",
                        data: { blockListName, position },
                    })
                    .catch((error) => {
                        console.error(
                            `Failed to send showEffect message to tab ${tabId}:`,
                            error
                        );
                    });
            }
        } catch (error) {
            console.error("Failed to block user:", error);
            NotificationManager.showNotification(
                `Failed to block @${userHandle}: ${error.message}`,
                "Error"
            );
        }
    }

    async getSelectedBlockList() {
        const { selectedBlockList } = await browser.storage.local.get(
            "selectedBlockList"
        );
        if (!selectedBlockList) {
            NotificationManager.showNotification(
                "Please select a block list before blocking.",
                "Error"
            );
            throw new Error("No block list selected.");
        }
        return selectedBlockList;
    }

    async getBlockListName(blockListUri) {
        try {
            const userDid = await this.apiClient.getUserRepoDid();
            const response = await this.apiClient.fetchWithAuth(
                `https://bsky.social/xrpc/app.bsky.graph.getLists?actor=${encodeURIComponent(
                    userDid
                )}`
            );

            const blockList = response.lists.find(
                (list) => list.uri === blockListUri
            );
            return blockList ? blockList.name : "Unknown List";
        } catch (error) {
            console.error("Failed to fetch block list name:", error);
            return "Unknown List";
        }
    }

    async getBlockLists() {
        try {
            const userDid = await this.apiClient.getUserRepoDid();
            if (!userDid) {
                throw new Error("User DID not found. Please log in.");
            }

            const response = await this.apiClient.fetchWithAuth(
                `https://bsky.social/xrpc/app.bsky.graph.getLists?actor=${encodeURIComponent(
                    userDid
                )}`
            );

            const blockLists = response.lists.filter(
                (list) => list.purpose === "app.bsky.graph.defs#modlist"
            );

            return blockLists.map((list) => ({
                name: list.name,
                uri: list.uri,
            }));
        } catch (error) {
            console.error("Failed to fetch block lists:", error);
            throw error;
        }
    }

    async getBlockListCount(blockListUri) {
        const CACHE_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour
        const now = Date.now();

        // Retrieve the entire cache from storage
        const data = await browser.storage.local.get("blockListCounts");
        const blockListCounts = data.blockListCounts || {};

        // Check if the count is cached and not expired
        if (
            blockListCounts[blockListUri] &&
            now - blockListCounts[blockListUri].timestamp < CACHE_EXPIRATION_MS
        ) {
            return blockListCounts[blockListUri].count;
        }

        // If not cached or expired, fetch the count
        try {
            let itemsCount = 0;
            let cursor = null;
            let hasMore = true;
            const MAX_LIMIT = 100; // Maximum allowed limit per request

            while (hasMore) {
                const url = `https://bsky.social/xrpc/app.bsky.graph.getList?list=${encodeURIComponent(
                    blockListUri
                )}&limit=${MAX_LIMIT}${
                    cursor ? "&cursor=" + encodeURIComponent(cursor) : ""
                }`;
                const response = await this.apiClient.fetchWithAuth(url);
                itemsCount += (response.items || []).length;
                cursor = response.cursor;
                hasMore = !!cursor;
            }

            // Update the cache in storage
            blockListCounts[blockListUri] = {
                count: itemsCount,
                timestamp: now,
            };
            await browser.storage.local.set({ blockListCounts });

            return itemsCount;
        } catch (error) {
            console.error("Failed to fetch block list items:", error);
            throw error;
        }
    }

    async exportBlockLists() {
        try {
            const userDid = await this.apiClient.getUserRepoDid();
            if (!userDid) {
                throw new Error("User DID not found. Please log in.");
            }

            const response = await this.apiClient.fetchWithAuth(
                `https://bsky.social/xrpc/app.bsky.graph.getLists?actor=${encodeURIComponent(
                    userDid
                )}`
            );
            const blockLists = response.lists.filter(
                (list) => list.purpose === "app.bsky.graph.defs#modlist"
            );

            if (blockLists.length === 0) {
                NotificationManager.showNotification(
                    "No block lists to export.",
                    "Export Failed"
                );
                return;
            }

            const blockListData = [];
            for (const list of blockLists) {
                let items = [];
                let cursor = null;
                let hasMore = true;
                const MAX_LIMIT = 100;

                while (hasMore) {
                    const url = `https://bsky.social/xrpc/app.bsky.graph.getList?list=${encodeURIComponent(
                        list.uri
                    )}&limit=${MAX_LIMIT}${
                        cursor ? "&cursor=" + encodeURIComponent(cursor) : ""
                    }`;
                    const itemsResponse = await this.apiClient.fetchWithAuth(url);
                    items = items.concat(itemsResponse.items || []);
                    cursor = itemsResponse.cursor;
                    hasMore = !!cursor;
                }

                blockListData.push({
                    name: list.name,
                    uri: list.uri,
                    items: items,
                });
            }

            const json = JSON.stringify(blockListData, null, 2);
            const blob = new Blob([json], { type: "application/json" });

            const url = URL.createObjectURL(blob);

            browser.downloads
                .download({
                    url,
                    filename: `bluesky-block-lists-${new Date()
                        .toISOString()
                        .slice(0, 10)}.json`,
                    saveAs: true,
                })
                .then(() => {
                    NotificationManager.showNotification(
                        "Block lists exported successfully.",
                        "Export Success"
                    );
                })
                .catch((err) => {
                    console.error("Download error:", err);
                    NotificationManager.showNotification(
                        "Failed to download block lists.",
                        "Export Failed"
                    );
                });
        } catch (error) {
            console.error("Failed to export block lists:", error);
            NotificationManager.showNotification(
                `Failed to export block lists: ${error.message}`,
                "Export Failed"
            );
        }
    }
}

class ContextMenuManager {
    constructor(blockListManager) {
        this.blockListManager = blockListManager;
        this.setupContextMenus();
    }

    setupContextMenus() {
        if (browser.contextMenus) {
            browser.runtime.onInstalled.addListener(() => {
                browser.contextMenus.create({
                    id: "block-user",
                    title: "Block User",
                    contexts: ["link", "selection"],
                });

                browser.contextMenus.create({
                    id: "export-block-lists",
                    title: "Export Block Lists",
                    contexts: ["browser_action"],
                });
            });

            browser.contextMenus.onClicked.addListener(async (info, tab) => {
                if (info.menuItemId === "export-block-lists") {
                    await this.blockListManager.exportBlockLists();
                }
                if (info.menuItemId === "block-user") {
                    try {
                        const response = await browser.tabs.sendMessage(tab.id, {
                            action: "getUserHandleFromContext",
                            info,
                        });
                        if (response && response.userHandle) {
                            const sanitizedHandle = Utilities.sanitizeInput(
                                response.userHandle
                            );
                            const userDid =
                                await this.blockListManager.apiClient.resolveDidFromHandle(
                                    sanitizedHandle
                                );
                            await this.blockListManager.blockUser(
                                userDid,
                                sanitizedHandle,
                                tab.id,
                                null // Pass null or adjust as needed
                            );
                        } else {
                            console.error("User handle not found from context menu.");
                            NotificationManager.showNotification(
                                "User handle not found from context menu."
                            );
                        }
                    } catch (error) {
                        console.error("Error handling context menu click:", error);
                        NotificationManager.showNotification(
                            "An error occurred while blocking the user.",
                            "Error"
                        );
                    }
                }
            });
        } else {
            console.warn(
                "contextMenus API is not available. Context menu functionality will be disabled."
            );
        }
    }
}

// Instantiate classes
const apiClient = new ApiClient();
const blockListManager = new BlockListManager(apiClient);
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
    if (message.action === "getBlockLists") {
        try {
            const blockLists = await blockListManager.getBlockLists();
            const { selectedBlockList } = await browser.storage.local.get(
                "selectedBlockList"
            );
            return { blockLists, selectedBlockList };
        } catch (error) {
            console.error("Error getting block lists:", error);
            return { blockLists: [], selectedBlockList: null };
        }
    } else if (message.action === "updateSelectedBlockList") {
        try {
            await browser.storage.local.set({
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
            const userDid = await apiClient.resolveDidFromHandle(userHandle);
            await blockListManager.blockUser(
                userDid,
                userHandle,
                sender.tab.id,
                position
            );
            await blockListManager.reportAccount(userHandle, userDid, "");
        } catch (error) {
            console.error("Error blocking user from content script:", error);
            NotificationManager.showNotification(
                "An error occurred while blocking the user.",
                "Error"
            );
        }
    }
});
