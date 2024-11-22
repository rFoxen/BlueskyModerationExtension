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
                    id: "report-user",
                    title: "Report User",
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
                if (info.menuItemId === "block-user" || info.menuItemId === "report-user") {
                    try {
                        const response = await browser.tabs.sendMessage(tab.id, {
                            action: "getUserHandleFromContext",
                            info,
                        });
                        if (response && response.userHandle) {
                            const sanitizedHandle = Utilities.sanitizeInput(response.userHandle);
                            const userDid = await this.blockListManager.identityService.resolveDidFromHandle(sanitizedHandle);

                            if (info.menuItemId === "block-user") {
                                await this.blockListManager.blockUser(
                                    userDid,
                                    sanitizedHandle,
                                    tab.id,
                                    null // Pass null or adjusted as needed
                                );
                            } else if (info.menuItemId === "report-user") {
                                await this.blockListManager.reportAccount(
                                    sanitizedHandle,
                                    userDid,
                                    "Reason for reporting" // You might want to prompt for a reason
                                );
                            }
                        } else {
                            console.error("User handle not found from context menu.");
                            NotificationManager.showNotification(
                                "User handle not found from context menu."
                            );
                        }
                    } catch (error) {
                        console.error("Error handling context menu click:", error);
                        NotificationManager.showNotification(
                            "An error occurred while processing the action.",
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

// Expose to global scope
window.ContextMenuManager = ContextMenuManager;
