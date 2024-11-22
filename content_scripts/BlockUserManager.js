
class BlockUserManager {
    constructor() {
        this.injectTimeout = null;
        this.init();
    }

    init() {
        this.injectActionButtons();
        this.observeDOMChanges();
        this.setupMessageListener();
    }

    createActionButton(type, profileHandle) {
        const button = document.createElement("button");
        button.textContent = type === "block" ? "Block" : "Report";
        button.className = `${type}-user-button`;
        button.setAttribute("aria-label", `${type.charAt(0).toUpperCase() + type.slice(1)} user ${profileHandle}`);
        button.dataset.profileHandle = profileHandle;
        button.style.marginLeft = "8px";
        button.style.border = "none";
        button.style.cursor = "pointer";
        button.style.backgroundColor = type === "block" ? "#ff4d4d" : "#ffa64d"; // Different colors for distinction

        const handleActionButtonClick = (event) => {
            event.preventDefault();
            event.stopPropagation();

            const rect = button.getBoundingClientRect();
            const position = {
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
            };

            if (type === "block") {
                browser.runtime.sendMessage({
                    action: "blockUserFromContentScript",
                    userHandle: profileHandle,
                    position,
                });
            } else if (type === "report") {
                const reasonTypes = [
                    { code: "com.atproto.moderation.defs#reasonSpam", label: "Spam" },
                    { code: "com.atproto.moderation.defs#reasonViolation", label: "Violation" },
                    { code: "com.atproto.moderation.defs#reasonMisleading", label: "Misleading" },
                    { code: "com.atproto.moderation.defs#reasonSexual", label: "Sexual Content" },
                    { code: "com.atproto.moderation.defs#reasonRude", label: "Rude Behavior" },
                ];

                let reasonOptions = reasonTypes.map((r, index) => `${index + 1}. ${r.label}`).join('\n');
                let reasonInput = prompt(`Please select a reason for reporting this user:\n${reasonOptions}`);

                if (reasonInput !== null) {
                    let reasonIndex = parseInt(reasonInput) - 1;
                    if (reasonIndex >= 0 && reasonIndex < reasonTypes.length) {
                        let reasonType = reasonTypes[reasonIndex].code;
                        let reasonLabel = reasonTypes[reasonIndex].label;
                        browser.runtime.sendMessage({
                            action: "reportUserFromContentScript",
                            userHandle: profileHandle,
                            reasonType: reasonType,
                            reason: reasonLabel,
                            position,
                        });
                    } else {
                        alert("Invalid selection. Report cancelled.");
                    }
                }
            }
        };

        button.addEventListener("click", handleActionButtonClick);
        button.addEventListener("touchend", handleActionButtonClick);

        return button;
    }

    attachActionButtons(containerElement, profileHandle, insertBeforeElement = null) {
        // Prevent duplicate buttons
        if (containerElement.querySelector('.block-user-button') || containerElement.querySelector('.report-user-button')) return;

        const blockButton = this.createActionButton("block", profileHandle);
        const reportButton = this.createActionButton("report", profileHandle);

        if (insertBeforeElement) {
            containerElement.insertBefore(blockButton, insertBeforeElement);
            containerElement.insertBefore(reportButton, insertBeforeElement);
        } else {
            containerElement.appendChild(blockButton);
            containerElement.appendChild(reportButton);
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
    injectActionButtons() {
        const nameContainers = document.querySelectorAll('div[style*="flex-direction: row"][style*="gap: 4px"]');

        nameContainers.forEach(container => {
            const profileLink = container.querySelector('a[href^="/profile/"]');
            if (!profileLink) return;

            const profileHandle = this.getProfileHandleFromLink(profileLink);
            if (!profileHandle) return;

            this.attachActionButtons(container, profileHandle);
        });

        this.injectButtonsForFollowButtons();
    }

    injectButtonsForFollowButtons() {
        const allButtons = document.querySelectorAll('button');

        allButtons.forEach(button => {
            if (!this.isFollowButton(button)) return;

            const containerElement = button.parentNode;

            // Skip if a "Block" button is already present in the parent container
            if (containerElement.querySelector('.block-user-button') || containerElement.querySelector('.report-user-button')) return;

            const profileLink = button.closest('a[href^="/profile/"]');

            if (!profileLink) {
                console.warn('Profile link not found for Follow button:', button);
                return;
            }

            const profileHandle = this.getProfileHandleFromLink(profileLink);
            if (!profileHandle) return;

            this.attachActionButtons(containerElement, profileHandle, button);
        });
    }

    observeDOMChanges() {
        const observer = new MutationObserver(() => {
            clearTimeout(this.injectTimeout);
            this.injectTimeout = setTimeout(() => {
                this.injectActionButtons();
            }, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    setupMessageListener() {
        browser.runtime.onMessage.addListener((message) => {
            if (message.action === "showEffect") {
                const { type, blockListName, position, userHandle, reason} = message.data;
                this.createCursorEffect(position, { type, blockListName, userHandle, reason });
            }
        });
    }

    createCursorEffect(position, actionData) {
        const { type, blockListName, userHandle, reason } = actionData;
        let message = "";

        if (type === "block") {
            message = `@${Utilities.sanitizeInput(userHandle)} has been added to "${Utilities.sanitizeInput(blockListName)}".`;
        } else if (type === "report") {
            message = `@${Utilities.sanitizeInput(userHandle)} has been reported for ${Utilities.sanitizeInput(actionData.reason)}.`;
        } else {
            console.warn(`Unknown effect type: ${type}`);
            return;
        }

        // Determine the position where the effect should appear
        const { x, y } = position || { x: window.innerWidth / 2, y: window.innerHeight / 2 };

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

        // Add animated text
        const effectText = document.createElement("div");
        effectText.className = "effect-text";
        effectText.textContent = message;

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

        effectText.style.setProperty("--blocklist-top", `${textTop}px`);
        effectText.style.setProperty("--blocklist-left", `${textLeft}px`);

        document.body.appendChild(effectText);

        setTimeout(() => effectText.remove(), 1500);
    }
}

window.BlockUserManager = BlockUserManager;