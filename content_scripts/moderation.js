/* /content_scripts/moderation.js */
"use strict";

class BlockUserManager {
    constructor() {
        this.injectTimeout = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.injectBlockButtons();
        this.observeDOMChanges();
        this.setupMessageListener();
    }

    setupEventListeners() {
        document.body.addEventListener(
            "click",
            this.handleBlockButtonClick.bind(this)
        );
    }

    handleBlockButtonClick(event) {
        const blockButton = event.target.closest(".block-user-button");
        if (blockButton) {
            event.preventDefault();
            const profileHandle = blockButton.dataset.profileHandle;
            const rect = blockButton.getBoundingClientRect();
            const position = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };

            browser.runtime.sendMessage({
                action: "blockUserFromContentScript",
                userHandle: profileHandle,
                position,
            });
        }
    }

    createBlockButton(profileHandle) {
        const blockButton = document.createElement("button");
        blockButton.textContent = "Block";
        blockButton.className = "block-user-button";
        blockButton.setAttribute("aria-label", `Block user ${profileHandle}`);
        blockButton.dataset.profileHandle = profileHandle;
        blockButton.style.marginLeft = "8px";
        blockButton.style.border = "none";
        blockButton.style.cursor = "pointer";

        const handleBlockUser = (event) => {
            event.preventDefault();
            event.stopPropagation();

            const rect = blockButton.getBoundingClientRect();
            const position = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };

            browser.runtime.sendMessage({
                action: "blockUserFromContentScript",
                userHandle: profileHandle,
                position,
            });
        };

        blockButton.addEventListener("click", handleBlockUser);
        blockButton.addEventListener("touchend", handleBlockUser);

        return blockButton;
    }

    attachBlockButton(containerElement, profileHandle, insertBeforeElement = null) {
        // Prevent duplicate buttons
        if (containerElement.querySelector('.block-user-button')) return;

        const blockButton = this.createBlockButton(profileHandle);

        if (insertBeforeElement) {
            containerElement.insertBefore(blockButton, insertBeforeElement);
        } else {
            containerElement.appendChild(blockButton);
        }

        // Ensure proper styling
        containerElement.style.display = 'flex';
        containerElement.style.alignItems = 'center';
    }

    getProfileHandleFromLink(profileLink) {
        const href = profileLink.getAttribute('href');
        const match = href.match(/\/profile\/([^/?#]+)/);
        return match ? match[1] : null;
    }

    isFollowButton(button) {
        return (
            Array.from(button.querySelectorAll("*")).some(
                (el) => el.textContent.trim().toLowerCase() === "follow"
            ) ||
            button.textContent.trim().toLowerCase() === "follow"
        );
    }

    // Inject "Block User" buttons next to user handles
    injectBlockButtons() {
        const nameContainers = document.querySelectorAll('div[style*="flex-direction: row"][style*="gap: 4px"]');

        nameContainers.forEach(container => {
            const profileLink = container.querySelector('a[href^="/profile/"]');
            if (!profileLink) return;

            const profileHandle = this.getProfileHandleFromLink(profileLink);
            if (!profileHandle) return;

            this.attachBlockButton(container, profileHandle);
        });

        this.injectBlockButtonsForFollowButtons();
    }

    injectBlockButtonsForFollowButtons() {
        const allButtons = document.querySelectorAll('button');

        allButtons.forEach(button => {
            if (!this.isFollowButton(button)) return;

            const containerElement = button.parentNode;

            // Skip if a "Block" button is already present in the parent container
            if (containerElement.querySelector('.block-user-button')) return;

            const profileLink = button.closest('a[href^="/profile/"]');

            if (!profileLink) {
                console.warn('Profile link not found for Follow button:', button);
                return;
            }

            const profileHandle = this.getProfileHandleFromLink(profileLink);
            if (!profileHandle) return;

            this.attachBlockButton(containerElement, profileHandle, button);
        });
    }

    observeDOMChanges() {
        const observer = new MutationObserver(() => {
            clearTimeout(this.injectTimeout);
            this.injectTimeout = setTimeout(() => {
                this.injectBlockButtons();
            }, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    setupMessageListener() {
        browser.runtime.onMessage.addListener((message) => {
            if (message.action === "showEffect") {
                const { blockListName, position } = message.data;
                this.createCursorEffect(position, blockListName);
            }
        });
    }

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
            adjustedX = viewportWidth - maxDistance - padding;
        } else if (position.x - maxDistance - padding < 0) {
            adjustedX = maxDistance + padding;
        }

        if (position.y - maxDistance - padding < 0) {
            adjustedY = maxDistance + padding;
        } else if (position.y + maxDistance + padding > viewportHeight) {
            adjustedY = viewportHeight - maxDistance - padding;
        }

        // Particle explosion
        for (let i = 0; i < numParticles; i++) {
            const particle = document.createElement("div");
            particle.className = Math.random() > 0.5 ? "particle" : "particle star";

            // Randomize size
            const size = Math.random() * 8 + 10; // 10px to 18px
            particle.style.setProperty("--particle-size", `${size}px`);

            const angle = angleStep * i;
            const distance = Math.random() * 60 + 40; // 40px to 100px

            let adjustedAngle = angle;

            if (position.x + maxDistance + padding > viewportWidth) {
                if (angle > 90 && angle < 270) {
                    adjustedAngle = angle;
                } else {
                    adjustedAngle = Math.random() * 180 + 90; // 90 to 270 degrees
                }
            }

            particle.style.setProperty("--particle-top", `${adjustedY}px`);
            particle.style.setProperty("--particle-left", `${adjustedX}px`);
            particle.style.setProperty(
                "--particle-x",
                `${Math.cos((adjustedAngle * Math.PI) / 180) * distance}px`
            );
            particle.style.setProperty(
                "--particle-y",
                `${Math.sin((adjustedAngle * Math.PI) / 180) * distance}px`
            );

            document.body.appendChild(particle);

            setTimeout(() => particle.remove(), 1000);
        }

        // Add animated block list text
        const blockListText = document.createElement("div");
        blockListText.className = "block-list-text";
        blockListText.textContent = `Added to ${sanitizedBlockListName}`;

        // Determine text position
        let textLeft = adjustedX + 30;

        if (adjustedX + 30 + 200 > viewportWidth) {
            textLeft = adjustedX - 200;
        }

        if (textLeft < 0) {
            textLeft = 10;
        }

        let textTop = adjustedY;
        if (textTop + 50 > viewportHeight) {
            textTop = viewportHeight - 50;
        } else if (textTop < 0) {
            textTop = 10;
        }

        blockListText.style.setProperty("--blocklist-top", `${textTop}px`);
        blockListText.style.setProperty("--blocklist-left", `${textLeft}px`);

        document.body.appendChild(blockListText);

        setTimeout(() => blockListText.remove(), 1500);
    }
}

class BlockListSelector {
    constructor() {
        this.blockLists = [];
        this.selectedBlockList = null;
        this.isVisible = false;
        this.isLoggedIn = false;
        this.handle = "";
        this.init();
    }

    async init() {
        await this.loadState();
        this.createUI();
        this.updateUI();

        if (this.isVisible && this.isLoggedIn && this.blockLists.length > 0) {
            this.updateBlockListCount(this.selectedBlockList);
        }
    }

    async loadState() {
        await Promise.all([this.loadVisibilityState(), this.checkAuthenticationStatus()]);
    }

    async checkAuthenticationStatus() {
        const data = await browser.storage.local.get(["handle"]);
        if (data.handle) {
            this.isLoggedIn = true;
            this.handle = data.handle;
            await this.fetchBlockLists();
        } else {
            this.isLoggedIn = false;
            this.handle = "";
        }
    }

    async loadVisibilityState() {
        try {
            const data = await browser.storage.local.get("blockListSelectorVisible");
            this.isVisible =
                data.blockListSelectorVisible !== undefined
                    ? data.blockListSelectorVisible
                    : false;
        } catch (error) {
            console.error("Error loading visibility state:", error);
            this.isVisible = false;
        }
    }

    async saveVisibilityState() {
        try {
            await browser.storage.local.set({
                blockListSelectorVisible: this.isVisible,
            });
        } catch (error) {
            console.error("Error saving visibility state:", error);
        }
    }

    async fetchBlockLists() {
        try {
            const response = await browser.runtime.sendMessage({
                action: "getBlockLists",
            });
            if (response && response.blockLists) {
                this.blockLists = response.blockLists;
                this.selectedBlockList =
                    response.selectedBlockList || this.blockLists[0]?.uri || null;
            }
        } catch (error) {
            console.error("Failed to fetch block lists:", error);
            this.blockLists = [];
        }
    }

    createUI() {
        // Create container
        this.container = document.createElement("div");
        this.container.className = "block-list-selector-container";

        // Create toggle button
        this.toggleButton = document.createElement("button");
        this.toggleButton.className = "block-list-toggle-button";
        this.toggleButton.setAttribute("aria-label", "Toggle Block List Selector");
        this.toggleButton.addEventListener("click", () => this.toggleVisibility());
        this.container.appendChild(this.toggleButton);

        // Create selector content
        this.selectorContent = document.createElement("div");
        this.selectorContent.className = "block-list-selector-content";
        this.container.appendChild(this.selectorContent);

        // Append container to body
        document.body.appendChild(this.container);
    }

    updateUI() {
        // Update toggle button icon
        this.toggleButton.innerHTML = this.isVisible ? "&#x25C0;" : "&#x25B6;";

        // Update container visibility
        if (this.isVisible) {
            this.container.classList.add("visible");
        } else {
            this.container.classList.remove("visible");
        }

        // Clear existing content
        this.selectorContent.innerHTML = "";

        // Create header
        const header = document.createElement("div");
        header.className = "block-list-selector-header";
        const title = document.createElement("span");
        title.className = "block-list-selector-title";
        title.textContent = "Moderation Helper";
        header.appendChild(title);
        this.selectorContent.appendChild(header);

        if (this.isLoggedIn) {
            this.populateLoggedInUI();
        } else {
            this.populateLoggedOutUI();
        }
    }

    populateLoggedInUI() {
        // Display user handle
        const userHandleDisplay = document.createElement("div");
        userHandleDisplay.className = "user-handle-display";
        userHandleDisplay.textContent = `Logged in as @${Utilities.sanitizeInput(
            this.handle
        )}`;
        this.selectorContent.appendChild(userHandleDisplay);

        if (this.blockLists.length > 0) {
            // Create select element
            const select = document.createElement("select");
            select.className = "block-list-selector";
            select.id = "block-list-selector";

            this.blockLists.forEach((list) => {
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

            this.selectorContent.appendChild(select);

            // Create count display
            this.countDisplay = document.createElement("div");
            this.countDisplay.className = "block-list-count";
            this.countDisplay.id = "block-list-count";
            this.countDisplay.textContent = "Loading count...";
            this.selectorContent.appendChild(this.countDisplay);

            // Update count
            this.updateBlockListCount(this.selectedBlockList);
        } else {
            const noListsMessage = document.createElement("div");
            noListsMessage.className = "no-block-lists-message";
            noListsMessage.textContent =
                "No block lists available. Please create one on Bluesky.";
            this.selectorContent.appendChild(noListsMessage);
        }

        // Logout button
        const logoutButton = document.createElement("button");
        logoutButton.className = "logout-button";
        logoutButton.textContent = "Log Out";
        logoutButton.addEventListener("click", () => {
            this.logoutUser();
        });
        this.selectorContent.appendChild(logoutButton);
    }

    populateLoggedOutUI() {
        // Create login form
        const loginForm = document.createElement("form");
        loginForm.className = "login-form";
        loginForm.id = "login-form";

        const identifierLabel = document.createElement("label");
        identifierLabel.setAttribute("for", "identifier");
        identifierLabel.textContent = "Username or Email:";
        loginForm.appendChild(identifierLabel);

        const identifierInput = document.createElement("input");
        identifierInput.type = "text";
        identifierInput.id = "identifier";
        identifierInput.name = "identifier";
        identifierInput.required = true;
        loginForm.appendChild(identifierInput);

        const passwordLabel = document.createElement("label");
        passwordLabel.setAttribute("for", "password");
        passwordLabel.textContent = "Password:";
        loginForm.appendChild(passwordLabel);

        const passwordInput = document.createElement("input");
        passwordInput.type = "password";
        passwordInput.id = "password";
        passwordInput.name = "password";
        passwordInput.required = true;
        loginForm.appendChild(passwordInput);

        const loginButton = document.createElement("input");
        loginButton.type = "submit";
        loginButton.value = "Login";
        loginForm.appendChild(loginButton);

        // Status message
        this.statusMessage = document.createElement("div");
        this.statusMessage.className = "status-message";
        this.statusMessage.id = "status-message";
        loginForm.appendChild(this.statusMessage);

        // Attach event listener to the form
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            this.loginUser(identifierInput.value.trim(), passwordInput.value);
        });

        this.selectorContent.appendChild(loginForm);
    }

    async toggleVisibility() {
        this.isVisible = !this.isVisible;
        this.updateUI();
        await this.saveVisibilityState();
    }

    async updateSelectedBlockList() {
        try {
            const response = await browser.runtime.sendMessage({
                action: "updateSelectedBlockList",
                selectedBlockList: this.selectedBlockList,
            });
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
        if (!this.isLoggedIn) return;
        try {
            const response = await browser.runtime.sendMessage({
                action: "getBlockListCount",
                blockListUri,
            });
            if (response && typeof response.count === "number") {
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

    async loginUser(identifier, password) {
        if (!identifier || !password) {
            this.updateStatus("Please enter both identifier and password.", "error");
            return;
        }

        this.updateStatus("Logging in...");

        try {
            const response = await fetch(
                "https://bsky.social/xrpc/com.atproto.server.createSession",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ identifier, password }),
                }
            );

            const data = await response.json();
            console.log("Login Response:", data);

            if (data.accessJwt && data.did && data.handle) {
                await browser.storage.local.set({
                    accessJwt: data.accessJwt,
                    did: data.did,
                    handle: data.handle,
                });

                this.updateStatus("Login successful!", "success");
                this.isLoggedIn = true;
                this.handle = data.handle;

                await this.fetchBlockLists();

                this.updateUI();

                if (this.blockLists.length > 0) {
                    this.selectedBlockList = this.blockLists[0].uri;
                    await this.updateSelectedBlockList();
                    this.updateBlockListCount(this.selectedBlockList);
                }
            } else {
                const errorMsg =
                    data.message || "Unknown error. Please check your credentials.";
                this.updateStatus(`Login failed: ${errorMsg}`, "error");
            }
        } catch (error) {
            console.error("Login Error:", error);
            this.updateStatus("An error occurred during login.", "error");
        }
    }

    async logoutUser() {
        await browser.storage.local.remove([
            "accessJwt",
            "did",
            "handle",
            "selectedBlockList",
        ]);
        this.isLoggedIn = false;
        this.handle = "";
        this.blockLists = [];
        this.selectedBlockList = null;

        this.updateUI();
    }

    updateStatus(message, type = "info") {
        if (!this.statusMessage) return;
        this.statusMessage.textContent = message;
        this.statusMessage.classList.remove(
            "status-success",
            "status-error",
            "status-info"
        );

        switch (type) {
            case "success":
                this.statusMessage.classList.add("status-success");
                break;
            case "error":
                this.statusMessage.classList.add("status-error");
                break;
            default:
                this.statusMessage.classList.add("status-info");
        }
    }
}

// Instantiate the BlockUserManager and BlockListSelector
new BlockUserManager();
new BlockListSelector();
