/* /content_scripts/moderation.js */
"use strict";

class BlockUserManager {
    constructor() {
        this.init();
    }

    init() {
        this.injectBlockButtons();
        this.injectBlockButtonsForNewElements();
        this.observeDOMChanges();
        this.setupMessageListener();
    }

    // Inject "Block User" buttons next to user handles
    injectBlockButtons() {
        const nameContainers = document.querySelectorAll('div[style*="flex-direction: row"][style*="gap: 4px"]');

        nameContainers.forEach(container => {
            // Prevent duplicate buttons
            if (container.querySelector('.block-user-button')) return;

            const profileLink = container.querySelector('a[href^="/profile/"]');
            if (!profileLink) return;

            const profileHandleMatch = profileLink.getAttribute("href").match(/\/profile\/([^/?#]+)/);
            if (!profileHandleMatch) return;

            const profileHandle = profileHandleMatch[1];

            // Create the "Block User" button
            const blockButton = document.createElement("button");
            blockButton.textContent = "Block";
            blockButton.className = "block-user-button";
            blockButton.setAttribute('aria-label', `Block user ${profileHandle}`);

            // Append the button to the container
            container.appendChild(blockButton);

            // Ensure proper styling
            container.style.display = 'flex';
            container.style.alignItems = 'center';

            // Event handler for blocking the user
            const handleBlockUser = (event) => {
                event.preventDefault();
                event.stopPropagation();

                const rect = blockButton.getBoundingClientRect();
                const position = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };

                browser.runtime.sendMessage({
                    action: "blockUserFromContentScript",
                    userHandle: profileHandle,
                    position
                });
            };

            // Attach event listeners
            blockButton.addEventListener("click", handleBlockUser);
            blockButton.addEventListener("touchend", handleBlockUser);
        });
    }

    // New method for injecting into the new "Follow" button elements
    injectBlockButtonsForNewElements() {
        // Helper function to determine if a button is a "Follow" button
        function isFollowButton(button) {
            return Array.from(button.querySelectorAll('*')).some(el => el.textContent.trim().toLowerCase() === 'follow');
        }

        // Select all 'button' elements on the page
        const allButtons = document.querySelectorAll('button');

        allButtons.forEach(button => {
            if (!isFollowButton(button)) return; // Skip if not a "Follow" button

            // Skip if a "Block" button is already present in the parent container
            if (button.parentNode.querySelector('.block-user-button')) return;

            // Find the closest ancestor 'a' with href starting with '/profile/'
            const profileLink = button.closest('a[href^="/profile/"]');

            if (!profileLink) {
                console.warn('Profile link not found for Follow button:', button);
                return;
            }

            const profileHref = profileLink.getAttribute('href');
            const profileHandleMatch = profileHref.match(/\/profile\/([^/?#]+)/);
            if (!profileHandleMatch) {
                console.warn('Could not extract profile handle from href:', profileHref);
                return;
            }

            const profileHandle = profileHandleMatch[1];

            // Create the "Block" button
            const blockButton = document.createElement("button");
            blockButton.textContent = "Block";
            blockButton.className = "block-user-button";
            blockButton.setAttribute('aria-label', `Block user ${profileHandle}`);
            blockButton.style.marginLeft = "8px"; // Add spacing
            blockButton.style.border = "none"; // Remove default border
            blockButton.style.cursor = "pointer"; // Change cursor on hover

            // Insert the "Block" button before the "Follow" button
            button.parentNode.insertBefore(blockButton, button);

            // Event handler for blocking the user
            const handleBlockUser = (event) => {
                event.preventDefault();
                event.stopPropagation();

                const rect = blockButton.getBoundingClientRect();
                const position = {
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2
                };

                browser.runtime.sendMessage({
                    action: "blockUserFromContentScript",
                    userHandle: profileHandle,
                    position
                });
            };

            // Attach event listeners
            blockButton.addEventListener("click", handleBlockUser);
            blockButton.addEventListener("touchend", handleBlockUser);
        });
    }
    
    // Observe DOM changes to dynamically inject buttons for new content
    observeDOMChanges() {
        let injectTimeout;
        const observer = new MutationObserver(() => {
            if (injectTimeout) clearTimeout(injectTimeout);
            injectTimeout = setTimeout(() => {
                this.injectBlockButtons();
                this.injectBlockButtonsForNewElements();
            }, 300); // Delay to prevent excessive processing
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    // Listen for messages from the background script to show effects
    setupMessageListener() {
        browser.runtime.onMessage.addListener((message) => {
            if (message.action === "showEffect") {
                const { blockListName, position } = message.data;
                this.createCursorEffect(position, blockListName);
            }
        });
    }

    // Create visual effects at the cursor position upon blocking a user
    createCursorEffect(position, blockListName) {
        const sanitizedBlockListName = Utilities.sanitizeInput(blockListName);
        const numParticles = 16;
        const angleStep = 360 / numParticles;
        const maxDistance = 100;

        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Define padding from edges to prevent overflow
        const padding = 100; // Adjust as needed

        // Adjust position if near the right edge
        let adjustedX = position.x;
        let adjustedY = position.y;

        if (position.x + maxDistance + padding > viewportWidth) {
            // Shift particles to the left
            adjustedX = viewportWidth - maxDistance - padding;
        } else if (position.x - maxDistance - padding < 0) {
            // Shift particles to the right
            adjustedX = maxDistance + padding;
        }

        // Adjust position if near the top edge
        if (position.y - maxDistance - padding < 0) {
            adjustedY = maxDistance + padding;
        } else if (position.y + maxDistance + padding > viewportHeight) {
            // Shift particles upwards
            adjustedY = viewportHeight - maxDistance - padding;
        }

        // Calculate the difference after adjustment
        const deltaX = adjustedX - position.x;
        const deltaY = adjustedY - position.y;
        
        // Particle explosion
        for (let i = 0; i < numParticles; i++) {
            const particle = document.createElement("div");
            particle.className = Math.random() > 0.5 ? "particle" : "particle star";

            // Randomize size
            const size = Math.random() * 8 + 10; // 10px to 18px
            particle.style.setProperty("--particle-size", `${size}px`);

            const angle = angleStep * i;
            const distance = Math.random() * 60 + 40; // 40px to 100px

            // Adjust angle based on available space
            let adjustedAngle = angle;

            // If near right edge, restrict angles to left hemisphere
            if (position.x + maxDistance + padding > viewportWidth) {
                if (angle > 90 && angle < 270) {
                    adjustedAngle = angle;
                } else {
                    adjustedAngle = Math.random() * 180 + 90; // 90 to 270 degrees
                }
            }
            
            // Set CSS variables for positioning and movement
            particle.style.setProperty("--particle-top", `${adjustedY}px`);
            particle.style.setProperty("--particle-left", `${adjustedX}px`);
            particle.style.setProperty("--particle-x", `${Math.cos((adjustedAngle * Math.PI) / 180) * distance}px`);
            particle.style.setProperty("--particle-y", `${Math.sin((adjustedAngle * Math.PI) / 180) * distance}px`);

            document.body.appendChild(particle);

            // Remove particle after animation
            setTimeout(() => particle.remove(), 1000);
        }

        // Add animated block list text
        const blockListText = document.createElement("div");
        blockListText.className = "block-list-text";
        blockListText.textContent = `Added to ${sanitizedBlockListName}`;

        // Determine text position
        let textLeft = adjustedX + 30; // Default position to the right

        // Adjust text position if near the right edge
        if (adjustedX + 30 + 200 > viewportWidth) { // Assuming text width ~200px
            textLeft = adjustedX - 200; // Position to the left
        }

        // Adjust text position if near the left edge
        if (textLeft < 0) {
            textLeft = 10; // Minimum padding
        }

        // Ensure text does not go beyond the top or bottom
        let textTop = adjustedY;
        if (textTop + 50 > viewportHeight) { // Assuming text height ~50px
            textTop = viewportHeight - 50;
        } else if (textTop < 0) {
            textTop = 10;
        }

        // Set CSS variables for positioning
        blockListText.style.setProperty("--blocklist-top", `${textTop}px`);
        blockListText.style.setProperty("--blocklist-left", `${textLeft}px`);

        document.body.appendChild(blockListText);

        // Remove text after animation
        setTimeout(() => blockListText.remove(), 1500);
    }
}

// New class to handle block list selection with slide-in/slide-out functionality
class BlockListSelector {
    constructor() {
        this.blockLists = [];
        this.selectedBlockList = null;
        this.isVisible = false; // Default visibility is hidden
        this.init();
    }

    async init() {
        // Request block lists from background script
        await this.fetchBlockLists();

        if (this.blockLists.length > 0) {
            // Load visibility state from storage
            await this.loadVisibilityState();
            // Inject the UI
            this.injectBlockListSelector();

            // Fetch and display the count for the initially selected block list if visible
            if (this.isVisible) {
                this.updateBlockListCount(this.selectedBlockList);
            }
        }
    }

    async loadVisibilityState() {
        try {
            const data = await browser.storage.local.get("blockListSelectorVisible");
            this.isVisible = data.blockListSelectorVisible !== undefined ? data.blockListSelectorVisible : false;
        } catch (error) {
            console.error("Error loading visibility state:", error);
            this.isVisible = false;
        }
    }

    async saveVisibilityState() {
        try {
            await browser.storage.local.set({ blockListSelectorVisible: this.isVisible });
        } catch (error) {
            console.error("Error saving visibility state:", error);
        }
    }

    async fetchBlockLists() {
        try {
            const response = await browser.runtime.sendMessage({ action: "getBlockLists" });
            if (response && response.blockLists) {
                this.blockLists = response.blockLists;
                this.selectedBlockList = response.selectedBlockList || this.blockLists[0]?.uri || null;
            }
        } catch (error) {
            console.error("Failed to fetch block lists:", error);
        }
    }

    injectBlockListSelector() {
        // Create a container div
        this.container = document.createElement("div");
        this.container.className = "block-list-selector-container";

        // Create the toggle button
        this.toggleButton = document.createElement("button");
        this.toggleButton.className = "block-list-toggle-button";
        this.toggleButton.setAttribute('aria-label', 'Toggle Block List Selector');
        this.toggleButton.innerHTML = this.isVisible ? "&#x25C0;" : "&#x25B6;"; // Left or right-pointing arrow based on visibility

        this.toggleButton.addEventListener("click", () => {
            this.toggleVisibility();
            this.toggleButton.innerHTML = this.isVisible ? "&#x25C0;" : "&#x25B6;"; // Update icon
        });

        // Create the selector content container
        this.selectorContent = document.createElement("div");
        this.selectorContent.className = "block-list-selector-content";

        // Create a header
        const header = document.createElement("div");
        header.className = "block-list-selector-header";
        const title = document.createElement("span");
        title.className = "block-list-selector-title";
        title.textContent = "Moderation Helper";
        header.appendChild(title);

        // Create a select element
        const select = document.createElement("select");
        select.className = "block-list-selector";
        select.id = "block-list-selector";

        // Populate the select options
        this.blockLists.forEach(list => {
            const option = document.createElement("option");
            option.value = list.uri;
            option.textContent = Utilities.sanitizeInput(list.name);
            if (list.uri === this.selectedBlockList) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        // Handle selection change
        select.addEventListener("change", () => {
            this.selectedBlockList = select.value;
            this.updateSelectedBlockList();
            this.updateBlockListCount(this.selectedBlockList);
        });

        // Create a count display element
        this.countDisplay = document.createElement("div");
        this.countDisplay.className = "block-list-count";
        this.countDisplay.id = "block-list-count";
        this.countDisplay.textContent = "Loading count...";

        // Append select and count display to selector content
        this.selectorContent.appendChild(header);
        this.selectorContent.appendChild(select);
        this.selectorContent.appendChild(this.countDisplay);

        // Append toggle button and selector content to container
        this.container.appendChild(this.toggleButton);
        this.container.appendChild(this.selectorContent);

        // Apply visibility
        if (this.isVisible) {
            this.container.classList.add("visible");
            this.toggleButton.innerHTML = "&#x25C0;"; // Left-pointing arrow when visible
        } else {
            this.container.classList.remove("visible");
            this.toggleButton.innerHTML = "&#x25B6;"; // Right-pointing arrow when hidden
        }

        // Append container to the page
        document.body.appendChild(this.container);
    }

    async toggleVisibility() {
        this.isVisible = !this.isVisible;
        if (this.isVisible) {
            this.container.classList.add("visible");
            this.toggleButton.innerHTML = "&#x25C0;"; // Left-pointing arrow
            // Fetch and display the count when becoming visible
            this.updateBlockListCount(this.selectedBlockList);
        } else {
            this.container.classList.remove("visible");
            this.toggleButton.innerHTML = "&#x25B6;"; // Right-pointing arrow
        }
        await this.saveVisibilityState();
    }

    async updateSelectedBlockList() {
        try {
            // Inform the background script to update the selected block list
            const response = await browser.runtime.sendMessage({ action: "updateSelectedBlockList", selectedBlockList: this.selectedBlockList });
            if (response && response.success) {
                console.log("Selected block list updated to:", this.selectedBlockList);
            } else {
                console.error("Failed to update selected block list.");
            }
        } catch (error) {
            console.error("Failed to update selected block list:", error);
        }
    }

    async updateBlockListCount(blockListUri) {
        try {
            const response = await browser.runtime.sendMessage({ action: "getBlockListCount", blockListUri });
            if (response && typeof response.count === 'number') {
                this.countDisplay.textContent = `Users in list: ${response.count}`;
            } else {
                console.error("Failed to retrieve block list count.");
                this.countDisplay.textContent = "Failed to load count.";
            }
        } catch (error) {
            console.error("Error fetching block list count:", error);
            this.countDisplay.textContent = "Error loading count.";
        }
    }
}

// Instantiate the BlockUserManager and BlockListSelector
new BlockUserManager();
new BlockListSelector();
