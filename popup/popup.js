// popup/popup.js

document.addEventListener('DOMContentLoaded', () => {
    checkAuthenticationStatus();

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        loginUser();
    });

    document.getElementById('logout-button').addEventListener('click', () => {
        logoutUser();
    });

    document.getElementById('block-list-select').addEventListener('change', async (e) => {
        const selectedBlockList = e.target.value;
        await browser.storage.local.set({ selectedBlockList });
    });

});

// Function to fetch block lists
// Function to fetch block lists
async function loadBlockLists() {
    const blockListSelect = document.getElementById('block-list-select');
    blockListSelect.innerHTML = ''; // Clear existing options

    try {
        const userDid = await getUserRepoDid();
        if (!userDid) {
            throw new Error('User DID not found. Please log in.');
        }

        const response = await fetchWithAuth(`https://bsky.social/xrpc/app.bsky.graph.getLists?actor=${encodeURIComponent(userDid)}`, {
            method: 'GET'
        });

        // Filter block lists by purpose
        const blockLists = response.lists.filter(list => list.purpose === 'app.bsky.graph.defs#modlist');
        blockLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list.uri; // Use the list URI
            option.textContent = list.name; // Display the list name
            blockListSelect.appendChild(option);
        });

        // Handle no block lists found
        if (blockLists.length === 0) {
            const noListsOption = document.createElement('option');
            noListsOption.textContent = 'No block lists available';
            noListsOption.disabled = true;
            blockListSelect.appendChild(noListsOption);
            updateStatus('No block lists available. Please create one on Bluesky.', 'info');
        } else {
            // Persist previously selected block list
            const { selectedBlockList } = await browser.storage.local.get('selectedBlockList');
            if (selectedBlockList) {
                blockListSelect.value = selectedBlockList; // Set saved option
            }
            updateStatus('Block lists loaded successfully.', 'success');
        }
    } catch (error) {
        console.error('Failed to load block lists:', error);
        if (error.message.includes('User DID not found')) {
            updateStatus('Please log in to load your block lists.', 'error');
        } else {
            updateStatus('Failed to load block lists. Please try again.', 'error');
        }
    }
}

async function getUserRepoDid() {
    const data = await browser.storage.local.get(['did']);
    return data.did;
}

async function fetchWithAuth(url, options = {}) {
    const data = await browser.storage.local.get(['accessJwt']);
    const accessJwt = data.accessJwt;

    if (!accessJwt) {
        throw new Error('User not authenticated.');
    }

    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${accessJwt}`,
    };

    const response = await fetch(url, options);

    if (response.status === 401) {
        await browser.storage.local.remove(['accessJwt', 'did', 'handle']);
        throw new Error('Session expired.');
    }

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Unknown error');
    }

    return response.json();
}


// Function to handle user login
async function loginUser() {
    const identifier = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value;

    if (!identifier || !password) {
        updateStatus('Please enter both identifier and password.', 'error');
        return;
    }

    updateStatus('Logging in...');

    try {
        const response = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ identifier, password })
        });

        const data = await response.json();
        console.log('Login Response:', data); // Debugging line

        if (data.accessJwt && data.did && data.handle) {
            // Store access token, DID, and handle securely
            await browser.storage.local.set({
                accessJwt: data.accessJwt,
                did: data.did,
                handle: data.handle
            });

            updateStatus('Login successful!', 'success');
            updateUI(true, data.handle);
            await loadBlockLists(); // Load block lists after successful login
        } else {
            const errorMsg = data.message || 'Unknown error. Please check your credentials.';
            updateStatus(`Login failed: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('Login Error:', error);
        updateStatus('An error occurred during login.', 'error');
    }
}


// Function to handle user logout
async function logoutUser() {
    await browser.storage.local.remove(['accessJwt', 'did', 'handle']);
    updateStatus('Logged out successfully.', 'success');
    updateUI(false);
    // Clear the block list select options
    const blockListSelect = document.getElementById('block-list-select');
    blockListSelect.innerHTML = '';
}

// Function to check authentication status on popup load
async function checkAuthenticationStatus() {
    const data = await browser.storage.local.get(['handle']);
    if (data.handle) {
        updateUI(true, data.handle);
        await loadBlockLists();
    } else {
        updateUI(false);
    }
}

// Function to update the UI based on authentication status
function updateUI(isLoggedIn, handle = '') {
    const loggedInDiv = document.getElementById('logged-in');
    const loggedOutDiv = document.getElementById('logged-out');
    const userHandleSpan = document.getElementById('user-handle');
    const statusParagraph = document.getElementById('status');

    if (isLoggedIn) {
        loggedInDiv.style.display = 'block';
        loggedOutDiv.style.display = 'none';
        userHandleSpan.textContent = handle;
        statusParagraph.textContent = '';
        statusParagraph.style.color = 'green';
    } else {
        loggedInDiv.style.display = 'none';
        loggedOutDiv.style.display = 'block';
        userHandleSpan.textContent = '';
        statusParagraph.textContent = '';
        statusParagraph.style.color = 'green';
    }
}

// Function to update status messages
function updateStatus(message, type = 'info') {
    const status = document.getElementById('status');
    status.textContent = message;

    switch (type) {
        case 'success':
            status.style.color = 'green';
            break;
        case 'error':
            status.style.color = 'red';
            break;
        default:
            status.style.color = 'black';
    }
}
