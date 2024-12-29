import { ERRORS } from '@src/constants/Constants';
import { BlueskyService } from '@src/services/BlueskyService';
import { NotificationManager } from '@src/components/common/NotificationManager';

/**
 * SessionManager is responsible for handling session expiration logic
 * and ensuring UI updates when session changes (via sessionUpdated event).
 */
export class SessionManager {
    private blueskyService: BlueskyService;
    private notificationManager: NotificationManager;
    private onLogout: () => void;
    private onSessionExpiredHandler: () => void;
    private onSessionUpdatedHandler: (session: any) => void;

    constructor(
        blueskyService: BlueskyService,
        notificationManager: NotificationManager,
        onLogout: () => void
    ) {
        this.blueskyService = blueskyService;
        this.notificationManager = notificationManager;
        this.onLogout = onLogout;

        // We rename the private methods for clarity:
        this.onSessionExpiredHandler = this.handleSessionExpired.bind(this);
        this.onSessionUpdatedHandler = this.handleSessionUpdated.bind(this);

        // Listen to session changes
        this.blueskyService.on('sessionExpired', this.onSessionExpiredHandler);
        this.blueskyService.on('sessionUpdated', this.onSessionUpdatedHandler);
    }

    private handleSessionExpired(): void {
        console.warn('Session expired. Logging out.');
        this.notificationManager.displayNotification(ERRORS.SESSION_EXPIRED, 'error');
        this.onLogout();
    }

    /**
     * Whenever the session updates, check if user is still logged in.
     * If session is cleared or invalid, trigger logout logic to reset UI.
     */
    private handleSessionUpdated(session: any): void {
        if (!session || !session.accessJwt) {
            console.warn('Session updated but no valid JWT, logging out.');
            this.onLogout();
        }
    }

    public destroy(): void {
        this.blueskyService.off('sessionExpired', this.onSessionExpiredHandler);
        this.blueskyService.off('sessionUpdated', this.onSessionUpdatedHandler);
    }
}
