// Utilities.js
// Sanitize input to prevent XSS
class Utilities {
    static sanitizeInput(input) {
        const div = document.createElement("div");
        div.textContent = input;
        return div.innerHTML.trim();
    }
}
