class NotificationManager {
    static notificationBuffer = [];
    static notificationTimer = null;
    static NOTIFICATION_DELAY = 10000;

    static showBatchedNotification(message, title = "Bluesky Moderation") {
        NotificationManager.notificationBuffer.push(message);

        if (!NotificationManager.notificationTimer) {
            NotificationManager.notificationTimer = setTimeout(() => {
                const fullMessage = NotificationManager.notificationBuffer.join("\n");
                browser.notifications.create({
                    type: "basic",
                    iconUrl: browser.runtime.getURL("icons/icon-48.png"),
                    title: title,
                    message: fullMessage,
                });
                NotificationManager.notificationBuffer.length = 0;
                NotificationManager.notificationTimer = null;
            }, NotificationManager.NOTIFICATION_DELAY);
        }
    }

    static showNotification(message, title = "Bluesky Moderation") {
        NotificationManager.showBatchedNotification(message, title);
    }
}

// Expose to global scope
window.NotificationManager = NotificationManager;
