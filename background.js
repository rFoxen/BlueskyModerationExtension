﻿// background.js

let notificationBuffer = [];
let notificationTimer = null;
const NOTIFICATION_DELAY = 10000;

// Function to display batched notifications
function showBatchedNotification(message, title = 'Bluesky Moderation') {
    notificationBuffer.push(message);

    // If the timer is not already set, start it
    if (!notificationTimer) {
        notificationTimer = setTimeout(() => {
            const fullMessage = notificationBuffer.join("\n");
            browser.notifications.create({
                "type": "basic",
                "iconUrl": browser.runtime.getURL("icons/icon.png"),
                "title": title,
                "message": fullMessage
            });
            // Clear the buffer and reset the timer
            notificationBuffer = [];
            notificationTimer = null;
        }, NOTIFICATION_DELAY);
    }
}

// Utility function to display notifications
function showNotification(message, title = 'Bluesky Moderation') {
    showBatchedNotification(message, title);
}

// Function to fetch with authentication
async function fetchWithAuth(url, options = {}) {
    const data = await browser.storage.local.get(['accessJwt']);
    let accessJwt = data.accessJwt;

    if (!accessJwt) {
        throw new Error('User not authenticated.');
    }

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${accessJwt}`,
    };

    let response = await fetch(url, options);

    if (response.status === 401) { // Unauthorized, token might have expired
        showNotification('Session expired. Please log in again.', 'Session Expired');
        await browser.storage.local.remove(['accessJwt', 'did', 'handle']);
        throw new Error('Session expired.');
    }

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Unknown error');
    }

    return response.json();
}

// Function to block a user
async function blockUser(userDid, handle) {
    try {
        const { selectedBlockList } = await browser.storage.local.get('selectedBlockList');

        if (!selectedBlockList) {
            showNotification('Please select a block list before blocking.', 'Error');
            return;
        }

        const blockListName = await getBlockListName(selectedBlockList);

        const body = {
            repo: await getUserRepoDid(),
            writes: [
                {
                    "$type": "com.atproto.repo.applyWrites#create",
                    "collection": "app.bsky.graph.listitem",
                    "value": {
                        "list": selectedBlockList,
                        "subject": userDid,
                        "createdAt": new Date().toISOString()
                    }
                }
            ]
        };

        // Correctly blocks to user level block list
        // writes: [
        //     {
        //         "$type": "com.atproto.repo.applyWrites#create", // Action: Create
        //         "collection": "app.bsky.graph.block",
        //         "value": {
        //             "subject": userDid,
        //             "createdAt": new Date().toISOString()
        //         }
        //     }
        // ]

        console.log(`Preparing to Post: ${JSON.stringify(body, null, 2)}`);

        await fetchWithAuth('https://bsky.social/xrpc/com.atproto.repo.applyWrites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        // Get the position of the right-click
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const rightClickPosition = await browser.tabs.sendMessage(tabs[0].id, { action: 'getRightClickPosition' });

        // Trigger the animation
        browser.tabs.sendMessage(tabs[0].id, {
            action: 'showEffect',
            data: { ...rightClickPosition, blockListName }
        });

        console.log(`Successfully added @${handle} to the block list "${blockListName}".`);
    } catch (error) {
        console.error('Failed to block user:', error);
        showNotification(`Failed to block @${handle}: ${error.message}`, 'Error');
    }
}



// Helper function to get block list name
async function getBlockListName(blockListUri) {
    try {
        const userDid = await getUserRepoDid();
        const response = await fetchWithAuth(`https://bsky.social/xrpc/app.bsky.graph.getLists?actor=${encodeURIComponent(userDid)}`, {
            method: 'GET'
        });

        const blockList = response.lists.find(list => list.uri === blockListUri);
        return blockList ? blockList.name : 'Unknown List';
    } catch (error) {
        console.error('Failed to fetch block list name:', error);
        return 'Unknown List';
    }
}

// Function to resolve handle to DID
async function resolveDidFromHandle(handle) {
    try {
        const data = await fetch(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
        const result = await data.json();

        if (result.did) {
            console.log(`Resolved DID for @${handle}: ${result.did}`);
            return result.did;
        } else {
            throw new Error('Failed to resolve DID');
        }
    } catch (error) {
        console.error('Error resolving DID:', error);
        throw error;
    }
}

// Function to get the user's own DID (repo DID)
async function getUserRepoDid() {
    const data = await browser.storage.local.get(['did']);
    return data.did;
}

browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.accessJwt && !changes.accessJwt.newValue) {
        showNotification('You have been logged out. Please log in again.', 'Session Expired');
    }
});

// Create context menu item on extension install
browser.runtime.onInstalled.addListener(() => {
    browser.contextMenus.create({
        id: "block-user",
        title: "Block User",
        contexts: ["link", "selection"]
    });
});

// Listener for context menu clicks
browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "block-user") {
        try {
            const response = await browser.tabs.sendMessage(tab.id, { action: "getUserHandleFromContext", info });
            if (response && response.userHandle) {
                const userDid = await resolveDidFromHandle(response.userHandle);
                await blockUser(userDid, response.userHandle);
            } else {
                console.error('User handle not found from context menu.');
                showNotification('User handle not found from context menu.');
            }
        } catch (error) {
            console.error('Error handling context menu click:', error);
            showNotification('An error occurred while blocking the user.', 'Error');
        }
    }
});