class BlockListManager {
    constructor(apiClient, authenticationService, identityService) {
        this.apiClient = apiClient;
        this.authenticationService = authenticationService;
        this.identityService = identityService;
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

    async reportAccount(userHandle, userDid, reasonType, reason = "", position) {
        const subject = {
            $type: "com.atproto.admin.defs#repoRef",
            did: userDid,
            type: "account",
        };
        try {
            await this._reportSubject(
                userHandle,
                reasonType,
                subject,
                reason
            );

            // Send message to show report effect
            const tabs = await browser.tabs.query({ active: true, currentWindow: true });
            if (tabs.length > 0) {
                const tab = tabs[0];
                browser.tabs
                    .sendMessage(tab.id, {
                        action: "showEffect",
                        data: { type: "report", userHandle, position, reason },
                    })
                    .catch((error) => {
                        console.error(
                            `Failed to send showEffect message to tab ${tab.id}:`,
                            error
                        );
                    });
            }
        } catch (error) {
            console.error(`Failed to report ${subject.type}:`, error);
            NotificationManager.showNotification(
                `Failed to report @${userHandle}: ${error.message}`,
                "Error"
            );
        }
    }

    async blockUser(userDid, userHandle, tabId, position) {
        try {
            const selectedBlockList = await this.getSelectedBlockList();
            const blockListName = await this.getBlockListName(selectedBlockList);

            const body = {
                repo: await this.authenticationService.getUserDid(),
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
                        data: { type: "block", userHandle, blockListName, position },
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
        const { selectedBlockList } = await this.authenticationService.storageService.get(
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
            const userDid = await this.authenticationService.getUserDid();
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
            const userDid = await this.authenticationService.getUserDid();
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
        const data = await this.authenticationService.storageService.get("blockListCounts");
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
            await this.authenticationService.storageService.set({ blockListCounts });

            return itemsCount;
        } catch (error) {
            console.error("Failed to fetch block list items:", error);
            throw error;
        }
    }

    async exportBlockLists() {
        try {
            const userDid = await this.authenticationService.getUserDid();
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

// Expose to global scope
window.BlockListManager = BlockListManager;
