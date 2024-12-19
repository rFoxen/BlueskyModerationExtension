import '@public/styles.css';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { ThemeManager } from '@src/components/theme/ThemeManager';
import { SlideoutManager } from '@src/components/slideout/SlideoutManager';
import { UIStateCoordinator } from '@src/managers/UIStateCoordinator';
import { SessionManager } from '@src/managers/SessionManager';

class Content {
    private notificationManager: NotificationManager;
    private themeManager: ThemeManager;
    private slideoutManager: SlideoutManager;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private uiStateCoordinator: UIStateCoordinator;
    private sessionManager: SessionManager;

    constructor(
        notificationManager: NotificationManager,
        slideoutManager: SlideoutManager,
        themeManager: ThemeManager,
        blueskyService: BlueskyService,
        blockedUsersService: BlockedUsersService
    ) {
        this.notificationManager = notificationManager;
        this.slideoutManager = slideoutManager;
        this.themeManager = themeManager;
        this.blueskyService = blueskyService;
        this.blockedUsersService = blockedUsersService;

        // Initialize SessionManager to handle session expiration and updates
        this.sessionManager = new SessionManager(
            this.blueskyService,
            this.notificationManager,
            this.handleLogout.bind(this)
        );

        // Initialize UIStateCoordinator for orchestrating UI changes
        this.uiStateCoordinator = new UIStateCoordinator(
            this.slideoutManager,
            this.notificationManager,
            this.blueskyService,
            this.blockedUsersService,
            () => this.blueskyService.isLoggedIn()
        );

        this.initialize();
    }

    private initialize(): void {
        console.log('Content script initialized.');
        this.checkWebsite();
        this.syncSessionState();

        // Listen for the window unload event to perform cleanup
        window.addEventListener('unload', () => this.destroy(), { once: true });
    }

    private checkWebsite(): void {
        // Apply theme
        this.themeManager.applySavedTheme();
        // Let UIStateCoordinator handle website-specific UI updates
        this.uiStateCoordinator.initializeUIForSite(window.location.hostname);
    }

    /**
     * Ensure the UI and session states are synced at startup.
     * If a valid session exists, show logged-in state; otherwise, show login form.
     */
    private syncSessionState(): void {
        // The UIStateCoordinator.updateUI() will rely on blueskyService.isLoggedIn()
        // which reads from the restored session. If invalid, it shows the login UI.
        this.uiStateCoordinator.updateUI();
    }

    private async handleLogout(): Promise<void> {
        // Delegate logout to UIStateCoordinator
        await this.uiStateCoordinator.requestLogout();
    }

    private destroy(): void {
        this.slideoutManager.destroy();
        this.uiStateCoordinator.destroy();
        this.blockedUsersService.destroy();
        this.notificationManager.destroy();
        this.sessionManager.destroy();
        this.blueskyService.destroy();
    }
}

// Bootstrap the application
const notificationManager = new NotificationManager();
const slideoutManager = new SlideoutManager();
const themeToggleButton = document.getElementById('theme-toggle') as HTMLElement;
const themeManager = new ThemeManager(themeToggleButton);
const blueskyService = new BlueskyService();
const blockedUsersService = new BlockedUsersService(blueskyService);

new Content(notificationManager, slideoutManager, themeManager, blueskyService, blockedUsersService);
