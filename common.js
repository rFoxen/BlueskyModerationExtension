// common.js

// Define cache expiration duration in milliseconds (e.g., 1 hour)
const CACHE_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour

// Function to fetch with authentication
async function fetchWithAuth(url, options = {}) {
    const data = await browser.storage.local.get(["accessJwt"]);
    const accessJwt = data.accessJwt;

    if (!accessJwt) {
        throw new Error("User not authenticated.");
    }

    options.headers = {
        ...options.headers,
        "Authorization": `Bearer ${accessJwt}`
    };

    let response;
    try {
        response = await fetch(url, options);
    } catch (error) {
        console.error("Network error:", error);
        throw new Error("Network error occurred.");
    }

    if (response.status === 401) {
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

// Function to handle user login
async function loginUser(identifierInputId, passwordInputId, updateStatusCallback, updateUICallback) {
    const identifier = document.getElementById(identifierInputId).value.trim();
    const password = document.getElementById(passwordInputId).value;

    if (!identifier || !password) {
        updateStatusCallback("Please enter both identifier and password.", "error");
        return;
    }

    updateStatusCallback("Logging in...");

    try {
        const response = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ identifier, password })
        });

        const data = await response.json();
        console.log("Login Response:", data);

        if (data.accessJwt && data.did && data.handle) {
            // Store access token directly
            await browser.storage.local.set({
                accessJwt: data.accessJwt,
                did: data.did,
                handle: data.handle
            });

            updateStatusCallback("Login successful!", "success");
            updateUICallback(true, data.handle);
            await loadBlockLists(updateStatusCallback);
        } else {
            const errorMsg = data.message || "Unknown error. Please check your credentials.";
            updateStatusCallback(`Login failed: ${errorMsg}`, "error");
        }
    } catch (error) {
        console.error("Login Error:", error);
        updateStatusCallback("An error occurred during login.", "error");
    }
}

// Function to handle user logout
async function logoutUser(updateStatusCallback, updateUICallback) {
    await browser.storage.local.remove(["accessJwt", "did", "handle"]);
    updateStatusCallback("Logged out successfully.", "success");
    updateUICallback(false);
    const blockListSelect = document.getElementById("block-list-select");
    if (blockListSelect) {
        blockListSelect.innerHTML = "";
    }
    const countElement = document.getElementById('block-list-count');
    if (countElement) {
        countElement.textContent = ''; // Clear the count
    }
}

// Function to get user's DID
async function getUserRepoDid() {
    const data = await browser.storage.local.get(["did"]);
    return data.did;
}

// Input sanitization function
function sanitizeInput(input) {
    const div = document.createElement("div");
    div.textContent = input;
    return div.innerHTML.trim();
}

// Function to update status messages
function updateStatus(message, type = "info") {
    const status = document.getElementById("status");
    status.textContent = message;
    status.classList.remove("status-success", "status-error", "status-info");

    switch (type) {
        case "success":
            status.classList.add("status-success");
            break;
        case "error":
            status.classList.add("status-error");
            break;
        default:
            status.classList.add("status-info");
    }
}

// Function to update the UI based on authentication status
function updateUI(isLoggedIn, handle = "") {
    const loggedInDiv = document.getElementById("logged-in");
    const loggedOutDiv = document.getElementById("logged-out");
    const userHandleSpan = document.getElementById("user-handle");
    const statusParagraph = document.getElementById("status");

    if (isLoggedIn) {
        loggedInDiv.classList.remove("hidden");
        loggedInDiv.classList.add("visible");
        loggedOutDiv.classList.remove("visible");
        loggedOutDiv.classList.add("hidden");
        userHandleSpan.textContent = sanitizeInput(handle);
        statusParagraph.textContent = "";
        statusParagraph.classList.remove("status-error", "status-info");
        statusParagraph.classList.add("status-success");
    } else {
        loggedInDiv.classList.remove("visible");
        loggedInDiv.classList.add("hidden");
        loggedOutDiv.classList.remove("hidden");
        loggedOutDiv.classList.add("visible");
        userHandleSpan.textContent = "";
        statusParagraph.textContent = "";
        statusParagraph.classList.remove("status-success", "status-error");
        statusParagraph.classList.add("status-info");
    }
}

// Function to load block lists
async function loadBlockLists(updateStatusCallback) {
    const blockListSelect = document.getElementById("block-list-select");
    blockListSelect.innerHTML = "";

    try {
        const userDid = await getUserRepoDid();
        if (!userDid) {
            throw new Error("User DID not found. Please log in.");
        }

        const response = await fetchWithAuth(`https://bsky.social/xrpc/app.bsky.graph.getLists?actor=${encodeURIComponent(userDid)}`);

        const blockLists = response.lists.filter(list => list.purpose === "app.bsky.graph.defs#modlist");
        blockLists.forEach(list => {
            const option = document.createElement("option");
            option.value = list.uri;
            option.textContent = sanitizeInput(list.name);
            blockListSelect.appendChild(option);
        });

        if (blockLists.length === 0) {
            const noListsOption = document.createElement("option");
            noListsOption.textContent = "No block lists available";
            noListsOption.disabled = true;
            blockListSelect.appendChild(noListsOption);
            updateStatusCallback("No block lists available. Please create one on Bluesky.", "info");
            document.getElementById('block-list-count').textContent = ''; // Clear the count
        } else {
            const { selectedBlockList } = await browser.storage.local.get("selectedBlockList");
            if (selectedBlockList && blockLists.some(list => list.uri === selectedBlockList)) {
                blockListSelect.value = selectedBlockList;
            } else {
                // If no block list is selected or the selected list no longer exists, select the first one
                blockListSelect.value = blockLists[0].uri;
                await browser.storage.local.set({ selectedBlockList: blockLists[0].uri });
            }
            updateStatusCallback("Block lists loaded successfully.", "success");
            await displayBlockListCount(blockListSelect.value);
        }
    } catch (error) {
        console.error("Failed to load block lists:", error);
        if (error.message.includes("User DID not found")) {
            updateStatusCallback("Please log in to load your block lists.", "error");
        } else {
            updateStatusCallback("Failed to load block lists. Please try again.", "error");
        }
    }
}

// Function to fetch and display the user count in the selected block list with cache invalidation
async function displayBlockListCount(blockListUri) {
    const blockListCountElement = document.getElementById('block-list-count');

    // Define cache keys
    const countCacheKey = `blockListCount_${blockListUri}`;
    const timestampCacheKey = `blockListCountTimestamp_${blockListUri}`;

    // Retrieve cached count and timestamp
    const cachedData = await browser.storage.local.get([countCacheKey, timestampCacheKey]);
    const cachedCount = cachedData[countCacheKey];
    const cachedTimestamp = cachedData[timestampCacheKey];

    const now = Date.now();

    // Check if cached data exists and is not expired
    if (cachedCount !== undefined && cachedTimestamp !== undefined) {
        if (now - cachedTimestamp < CACHE_EXPIRATION_MS) {
            blockListCountElement.textContent = `Number of users in this block list: ${cachedCount} (cached)`;
            return;
        } else {
            // Cache is expired; remove cached data
            await browser.storage.local.remove([countCacheKey, timestampCacheKey]);
        }
    }

    // If no valid cache, fetch the count
    blockListCountElement.textContent = 'Loading... (This may take a while for large lists)';

    try {
        let itemsCount = 0;
        let cursor = null;
        let hasMore = true;
        const MAX_LIMIT = 100; // Maximum allowed limit per request

        while (hasMore) {
            const url = `https://bsky.social/xrpc/app.bsky.graph.getList?list=${encodeURIComponent(blockListUri)}&limit=${MAX_LIMIT}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`;
            const response = await fetchWithAuth(url);
            itemsCount += (response.items || []).length;
            cursor = response.cursor;
            hasMore = !!cursor;
        }

        blockListCountElement.textContent = `Number of users in this block list: ${itemsCount}`;

        // Cache the count and current timestamp
        await browser.storage.local.set({
            [countCacheKey]: itemsCount,
            [timestampCacheKey]: now
        });
    } catch (error) {
        console.error('Failed to fetch block list items:', error);
        blockListCountElement.textContent = 'Failed to load block list count.';
    }
}
