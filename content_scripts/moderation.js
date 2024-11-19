// content_scripts/moderation.js
"use strict";

let rightClickPosition = { x: 0, y: 0 };

// Listener for messages from the background script
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "getUserHandle") {
        const userHandle = extractUserHandle();
        console.log("Extracted User Handle:", userHandle);
        return Promise.resolve({ userHandle });
    } else if (message.action === "getUserHandleFromContext") {
        const userHandle = extractUserHandleFromContext(message.info);
        console.log("Extracted User Handle from context:", userHandle);
        return Promise.resolve({ userHandle });
    }
});

// Function to extract the user handle from the page URL
function extractUserHandle() {
    const url = window.location.href;
    const handleMatch = url.match(/profile\/([^/?#]+)/);
    if (handleMatch) {
        return sanitizeInput(handleMatch[1]);
    }
    console.warn("User handle could not be extracted.");
    return null;
}

// Function to extract the user handle from context menu info
function extractUserHandleFromContext(info) {
    if (info.linkUrl) {
        try {
            const url = new URL(info.linkUrl);
            const handleMatch = url.pathname.match(/\/profile\/([^/?#]+)/);
            if (handleMatch) {
                return sanitizeInput(handleMatch[1]);
            }
        } catch (error) {
            console.error("Invalid URL in context:", info.linkUrl);
        }
    }
    console.warn("User handle could not be extracted from context.");
    return null;
}

// Input sanitization function
function sanitizeInput(input) {
    const div = document.createElement("div");
    div.textContent = input;
    return div.innerHTML.trim();
}

// Function to create cursor effect
function createCursorEffect(position, blockListName) {
    const sanitizedBlockListName = sanitizeInput(blockListName);
    // ... rest of the code remains the same, using sanitizedBlockListName
    // Add animated block list text
    const blockListText = document.createElement("div");
    blockListText.className = "block-list-text";
    blockListText.style.top = `${position.y}px`;
    blockListText.style.left = `${position.x + 30}px`;
    blockListText.textContent = `Added to ${sanitizedBlockListName}`;

    document.body.appendChild(blockListText);

    // Remove block list text after animation
    setTimeout(() => blockListText.remove(), 1500);
}

// Listener for messages from the background script
browser.runtime.onMessage.addListener((message) => {
    if (message.action === "getRightClickPosition") {
        return Promise.resolve(rightClickPosition);
    }
    if (message.action === "showEffect") {
        const { x, y, blockListName } = message.data;
        createCursorEffect({ x, y }, blockListName);
    }
});

document.addEventListener("contextmenu", (event) => {
    rightClickPosition = { x: event.pageX, y: event.pageY };
});
