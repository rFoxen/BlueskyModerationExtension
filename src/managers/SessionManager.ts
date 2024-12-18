import { ERRORS } from '@src/constants/Constants';
import { BlueskyService } from '@src/services/BlueskyService';
import { NotificationManager } from '@src/components/common/NotificationManager';

/**
 * SessionManager is responsible for handling session expiration logic.
 * When the session expires, it initiates the logout process.
 */
export class SessionManager {
    private blueskyService: BlueskyService;
    private notificationManager: NotificationManager;
    private onLogout: () => void;

    constructor(
        blueskyService: BlueskyService,
        notificationManager: NotificationManager,
        onLogout: () => void
    ) {
        this.blueskyService = blueskyService;
        this.notificationManager = notificationManager;
        this.onLogout = onLogout;

        // Bind sessionExpired listener
        this.blueskyService.on('sessionExpired', this.handleSessionExpired.bind(this));
    }

    private handleSessionExpired(): void {
        console.warn('Session expired. Logging out.');
        this.notificationManager.displayNotification(ERRORS.SESSION_EXPIRED, 'error');
        this.onLogout();
    }

    public destroy(): void {
        this.blueskyService.off('sessionExpired', this.handleSessionExpired.bind(this));
    }
}
