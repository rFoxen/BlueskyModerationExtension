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
    } else if (message.action === "getRightClickPosition") {
        return Promise.resolve(rightClickPosition);
    } else if (message.action === "showEffect") {
        const { x, y, blockListName } = message.data;
        createCursorEffect({ x, y }, blockListName);
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
    const numParticles = 16; // Number of particles
    const angleStep = 360 / numParticles;

    // Create particle explosion
    for (let i = 0; i < numParticles; i++) {
        const particle = document.createElement("div");
        particle.className = Math.random() > 0.5 ? "particle" : "particle star";

        // Randomize size
        const size = Math.random() * 8 + 10; // Random size between 10px and 18px
        particle.style.setProperty("--particle-size", `${size}px`);

        const angle = angleStep * i;
        const distance = Math.random() * 60 + 40; // Random distance between 40px and 100px

        // Set CSS variables for positioning and movement
        particle.style.setProperty("--particle-top", `${position.y}px`);
        particle.style.setProperty("--particle-left", `${position.x}px`);
        particle.style.setProperty("--particle-x", `${Math.cos((angle * Math.PI) / 180) * distance}px`);
        particle.style.setProperty("--particle-y", `${Math.sin((angle * Math.PI) / 180) * distance}px`);

        document.body.appendChild(particle);

        // Remove particle after animation
        setTimeout(() => particle.remove(), 1000);
    }

    // Add animated block list text
    const blockListText = document.createElement("div");
    blockListText.className = "block-list-text";
    blockListText.textContent = `Added to ${sanitizedBlockListName}`;

    // Set CSS variables for positioning
    blockListText.style.setProperty("--blocklist-top", `${position.y}px`);
    blockListText.style.setProperty("--blocklist-left", `${position.x + 30}px`);

    document.body.appendChild(blockListText);

    // Remove block list text after animation
    setTimeout(() => blockListText.remove(), 1500);
}

// Listener to capture right-click position
document.addEventListener("contextmenu", (event) => {
    rightClickPosition = { x: event.pageX, y: event.pageY };
});
