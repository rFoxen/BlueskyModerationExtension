import { BlockListDropdown } from '@src/components/blockedUsers/BlockListDropdown';
import { BlockedUsersUI } from '@src/components/blockedUsers/BlockedUsersUI';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { PostScanner } from '@src/components/posts/PostScanner';
import { SlideoutManager } from '@src/components/slideout/SlideoutManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { MESSAGES } from '@src/constants/Constants';

/**
 * UIStateCoordinator manages the UI components and their states based on user login status
 * and other conditions. It ensures that Content class doesn't do too much UI logic.
 */
export class UIStateCoordinator {
    private isLoggedIn: boolean;
    private slideoutManager: SlideoutManager;
    private notificationManager: NotificationManager;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private blockListDropdown: BlockListDropdown | null = null;
    private blockedUsersUI: BlockedUsersUI | null = null;
    private postScanner: PostScanner | null = null;
    private getIsLoggedIn: () => boolean;

    constructor(
        slideoutManager: SlideoutManager,
        notificationManager: NotificationManager,
        blueskyService: BlueskyService,
        blockedUsersService: BlockedUsersService,
        isLoggedIn: () => boolean
    ) {
        this.slideoutManager = slideoutManager;
        this.notificationManager = notificationManager;
        this.blueskyService = blueskyService;
        this.blockedUsersService = blockedUsersService;
        this.getIsLoggedIn = isLoggedIn;
        this.isLoggedIn = isLoggedIn();
        this.setupSlideoutEvents();
    }

    private setupSlideoutEvents(): void {
        this.slideoutManager.on('login', this.handleLogin.bind(this));
        this.slideoutManager.on('logout', this.handleLogout.bind(this));
        this.slideoutManager.on('blockButtonsToggle', (visible: boolean) => {
            this.postScanner?.setBlockButtonsVisibility(visible);
        });
        this.slideoutManager.on('blockListSelectionChange', this.handleBlockListSelectionChange.bind(this));
        this.slideoutManager.on('refreshBlockLists', () => this.blockListDropdown?.refreshBlockLists());

        // Optionally, listen to loginFailed and logoutFailed events if BlueskyService emits them
        this.blueskyService.on('loginFailed', () => {
            this.notificationManager.displayNotification(MESSAGES.LOGIN_FAILED, 'error');
            this.updateUI(); // Reflect that login failed
        });
        this.blueskyService.on('logoutFailed', () => {
            this.notificationManager.displayNotification(MESSAGES.LOGOUT_FAILED, 'error');
            this.updateUI(); // Reflect that logout failed (still logged in?)
        });

        // Listen for sessionUpdated as well (optional, since SessionManager handles it):
        this.blueskyService.on('sessionUpdated', (session) => {
            // If session changed, update UI immediately
            this.updateUI();
        });
    }

    public initializeUIForSite(hostname: string): void {
        if (hostname === 'bsky.app') {
            this.updateUI();
            this.setupPostScanner();
        }
    }

    private setupPostScanner(): void {
        this.postScanner = new PostScanner(
            this.notificationManager,
            this.blueskyService,
            this.blockedUsersService,
            this.getIsLoggedIn,
            () => this.blockListDropdown?.getSelectedValue() || null,
            async (userHandle: string) => {
                const selectedUri = this.blockListDropdown?.getSelectedValue();
                if (!selectedUri) return;
                await this.blockedUsersService.addBlockedUser(userHandle, selectedUri);
            },
            async (userHandle: string) => {
                const selectedUri = this.blockListDropdown?.getSelectedValue();
                if (!selectedUri) return;
                await this.blockedUsersService.removeBlockedUser(userHandle, selectedUri);
            }
        );
    }

    public updateUI(): void {
        this.isLoggedIn = this.getIsLoggedIn();
        console.log('UIStateCoordinator: updateUI called, isLoggedIn:', this.isLoggedIn);
        if (this.isLoggedIn) {
            this.slideoutManager.displayLoginInfo(this.blueskyService.getLoggedInUsername());

            if (!this.blockListDropdown) {
                this.blockListDropdown = new BlockListDropdown('block-lists-dropdown', this.blueskyService);
                this.blockListDropdown.onSelectionChange(this.handleBlockListSelectionChange.bind(this));
                this.blockListDropdown.loadBlockLists();
            }
            this.slideoutManager.showBlockListsSection();

            if (!this.blockedUsersUI) {
                this.blockedUsersUI = new BlockedUsersUI(
                    'blocked-users-section',
                    this.blockedUsersService,
                    this.notificationManager,
                    this.blockListDropdown,
                    this.getIsLoggedIn
                );
            }
        } else {
            this.slideoutManager.hideUserInfo();
            this.slideoutManager.hideBlockListsSection();
            this.blockListDropdown?.clearDropdown();
            this.blockedUsersUI?.hideBlockedUsersSection();
        }
    }

    public async requestLogout(): Promise<void> {
        await this.handleLogout();
    }

    private async handleLogin(username: string, password: string): Promise<void> {
        console.log('UIStateCoordinator: Handling login for', username);
        const loginSuccess = await this.blueskyService.login(username, password);
        if (loginSuccess) {
            this.isLoggedIn = true;
            console.log('UIStateCoordinator: Login successful');
            this.updateUI();
            this.notificationManager.displayNotification(MESSAGES.LOGIN_SUCCESS, 'success');
        } else {
            console.log('UIStateCoordinator: Login failed');
            this.slideoutManager.displayFormFeedback(MESSAGES.LOGIN_FAILED, 'danger');
        }
    }

    private async handleLogout(): Promise<void> {
        const logoutSuccess = await this.blueskyService.logout();
        if (logoutSuccess) {
            this.isLoggedIn = false;
            console.log('UIStateCoordinator: Logout successful');
            this.updateUI();
            this.notificationManager.displayNotification(MESSAGES.LOGOUT_SUCCESS, 'success');
            this.blockListDropdown?.clearSelection();
            this.blockedUsersService?.clearBlockedUsersData();
            this.blockListDropdown = null;
            this.blockedUsersUI = null;
        } else {
            console.log('UIStateCoordinator: Logout failed');
            this.notificationManager.displayNotification(MESSAGES.LOGOUT_FAILED, 'error');
        }
    }

    private async handleBlockListSelectionChange(selectedUri: string): Promise<void> {
        if (!selectedUri) {
            this.blockedUsersUI?.hideBlockedUsersSection();
            return;
        }
        await this.blockedUsersUI?.loadBlockedUsersUI(selectedUri);
    }

    public destroy(): void {
        this.blockedUsersUI?.destroy();
        this.postScanner?.destroy();
        this.blockListDropdown?.destroy();
    }
}
