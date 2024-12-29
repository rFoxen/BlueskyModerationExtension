import '@public/styles.css';

import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { ThemeManager } from '@src/components/theme/ThemeManager';
import { SlideoutManager } from '@src/components/slideout/SlideoutManager';
import { UIStateCoordinator } from '@src/managers/UIStateCoordinator';
import { SessionManager } from '@src/managers/SessionManager';

/**
 * Main entry point for initializing our content script logic.
 * It wires up all services/managers and starts the UI flow.
 */
class ContentScript {
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
            this.performLogout.bind(this)
        );

        // Initialize UIStateCoordinator for orchestrating UI changes
        this.uiStateCoordinator = new UIStateCoordinator(
            this.slideoutManager,
            this.notificationManager,
            this.blueskyService,
            this.blockedUsersService,
            () => this.blueskyService.isLoggedIn() // pass a function returning bool
        );

        this.initialize();
    }

    /**
     * Wires up initial UI states, applies saved theme,
     * and sets up destroy logic on window unload.
     */
    private initialize(): void {
        console.log('ContentScript initialized.');

        // 1. Apply theme upon initialization
        this.themeManager.applySavedTheme();

        // 2. Let the UIStateCoordinator handle website-specific UI
        this.uiStateCoordinator.initializeUIForSite(window.location.hostname);

        // 3. Sync UI with session state
        this.syncUIState();

        // 4. Cleanup on unload
        window.addEventListener('unload', () => this.cleanup(), { once: true });
    }

    /**
     * Ensure the UI and session states are in sync at startup.
     * If a valid session exists, show logged-in state; otherwise, show login form.
     */
    private syncUIState(): void {
        // The UIStateCoordinator.updateUI() relies on blueskyService.isLoggedIn(),
        // which reads from the restored session. If invalid, it shows the login UI.
        this.uiStateCoordinator.updateUI();
    }

    /**
     * Called by SessionManager or other components when a logout is needed.
     */
    private async performLogout(): Promise<void> {
        await this.uiStateCoordinator.requestLogout();
    }

    /**
     * Cleanup all resources on unload.
     */
    private cleanup(): void {
        this.slideoutManager.destroy();
        this.uiStateCoordinator.destroy();
        this.blockedUsersService.destroy();
        this.notificationManager.destroy();
        this.sessionManager.destroy();
        this.blueskyService.destroy();
    }
}

// ----------------------------------------------------------------
// Bootstrap the application
// (Remains basically the same, but new class name is used below.)
// ----------------------------------------------------------------
const notificationManager = new NotificationManager();
const slideoutManager = new SlideoutManager();
const themeToggleButton = document.getElementById('theme-toggle') as HTMLElement;
const themeManager = new ThemeManager(themeToggleButton);
const blueskyService = new BlueskyService();
const blockedUsersService = new BlockedUsersService(blueskyService);

new ContentScript(
    notificationManager,
    slideoutManager,
    themeManager,
    blueskyService,
    blockedUsersService
);
