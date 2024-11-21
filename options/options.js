// options/options.js
document.addEventListener("DOMContentLoaded", () => {
    checkAuthenticationStatus();

    document.getElementById("login-form").addEventListener("submit", (e) => {
        e.preventDefault();
        loginUser("identifier", "password", updateStatus, updateUI);
    });

    document.getElementById("logout-button").addEventListener("click", () => {
        logoutUser(updateStatus, updateUI);
    });

    document.getElementById("block-list-select").addEventListener("change", async (e) => {
        const selectedBlockList = e.target.value;
        await browser.storage.local.set({ selectedBlockList });
        await displayBlockListCount(selectedBlockList); // Fetch and display the count
    });
});

// Function to check authentication status on page load
async function checkAuthenticationStatus() {
    const data = await browser.storage.local.get(["handle"]);
    if (data.handle) {
        updateUI(true, data.handle);
        await loadBlockLists(updateStatus);
    } else {
        updateUI(false);
    }
}
