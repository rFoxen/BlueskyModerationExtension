// popup.js

document.addEventListener("DOMContentLoaded", () => {
    checkAuthenticationStatus();

    document.getElementById("login-form").addEventListener("submit", (e) => {
        e.preventDefault();
        loginUser();
    });

    document.getElementById("logout-button").addEventListener("click", () => {
        logoutUser();
    });

    document.getElementById("block-list-select").addEventListener("change", async (e) => {
        const selectedBlockList = e.target.value;
        await browser.storage.local.set({ selectedBlockList });
    });
});

// Encryption key for secure storage
let cryptoKey = null;

// Generate a cryptographic key for encryption
async function generateCryptoKey() {
    if (!cryptoKey) {
        cryptoKey = await crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );
    }
}

// Function to encrypt data
async function encryptData(data) {
    await generateCryptoKey();
    const encoded = new TextEncoder().encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        cryptoKey,
        encoded
    );
    return {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(encrypted))
    };
}

// Function to decrypt data
async function decryptData(encryptedData) {
    await generateCryptoKey();
    const iv = new Uint8Array(encryptedData.iv);
    const data = new Uint8Array(encryptedData.data);
    const decrypted = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        cryptoKey,
        data
    );
    return new TextDecoder().decode(decrypted);
}

// Function to fetch with authentication
async function fetchWithAuth(url, options = {}) {
    const data = await browser.storage.local.get(["accessJwt"]);
    let accessJwt = data.accessJwt;

    if (!accessJwt) {
        throw new Error("User not authenticated.");
    }

    // Decrypt the access token
    accessJwt = await decryptData(accessJwt);

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
async function loginUser() {
    const identifier = document.getElementById("identifier").value.trim();
    const password = document.getElementById("password").value;

    if (!identifier || !password) {
        updateStatus("Please enter both identifier and password.", "error");
        return;
    }

    // Optionally, add input validation to check for invalid characters
    // For example, you can check if the inputs exceed a certain length

    updateStatus("Logging in...");

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
            // Encrypt and store access token securely
            const encryptedJwt = await encryptData(data.accessJwt);

            await browser.storage.local.set({
                accessJwt: encryptedJwt,
                did: data.did,
                handle: data.handle
            });

            updateStatus("Login successful!", "success");
            updateUI(true, data.handle);
            await loadBlockLists();
        } else {
            const errorMsg = data.message || "Unknown error. Please check your credentials.";
            updateStatus(`Login failed: ${errorMsg}`, "error");
        }
    } catch (error) {
        console.error("Login Error:", error);
        updateStatus("An error occurred during login.", "error");
    }
}


// Function to handle user logout
async function logoutUser() {
    await browser.storage.local.remove(["accessJwt", "did", "handle"]);
    updateStatus("Logged out successfully.", "success");
    updateUI(false);
    const blockListSelect = document.getElementById("block-list-select");
    blockListSelect.innerHTML = "";
}

// Function to check authentication status on popup load
async function checkAuthenticationStatus() {
    const data = await browser.storage.local.get(["handle"]);
    if (data.handle) {
        updateUI(true, data.handle);
        await loadBlockLists();
    } else {
        updateUI(false);
    }
}

// Function to update the UI based on authentication status
function updateUI(isLoggedIn, handle = "") {
    const loggedInDiv = document.getElementById("logged-in");
    const loggedOutDiv = document.getElementById("logged-out");
    const userHandleSpan = document.getElementById("user-handle");
    const statusParagraph = document.getElementById("status");

    if (isLoggedIn) {
        loggedInDiv.style.display = "block";
        loggedOutDiv.style.display = "none";
        userHandleSpan.textContent = sanitizeInput(handle);
        statusParagraph.textContent = "";
        statusParagraph.style.color = "green";
    } else {
        loggedInDiv.style.display = "none";
        loggedOutDiv.style.display = "block";
        userHandleSpan.textContent = "";
        statusParagraph.textContent = "";
        statusParagraph.style.color = "green";
    }
}

// Function to update status messages
function updateStatus(message, type = "info") {
    const status = document.getElementById("status");
    status.textContent = message;

    switch (type) {
        case "success":
            status.style.color = "green";
            break;
        case "error":
            status.style.color = "red";
            break;
        default:
            status.style.color = "black";
    }
}

// Function to fetch block lists
async function loadBlockLists() {
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
            updateStatus("No block lists available. Please create one on Bluesky.", "info");
        } else {
            const { selectedBlockList } = await browser.storage.local.get("selectedBlockList");
            if (selectedBlockList) {
                blockListSelect.value = selectedBlockList;
            }
            updateStatus("Block lists loaded successfully.", "success");
        }
    } catch (error) {
        console.error("Failed to load block lists:", error);
        if (error.message.includes("User DID not found")) {
            updateStatus("Please log in to load your block lists.", "error");
        } else {
            updateStatus("Failed to load block lists. Please try again.", "error");
        }
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