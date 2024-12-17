import '@public/styles.css';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockListDropdown } from '@src/components/blockedUsers/BlockListDropdown';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { PostScanner } from '@src/components/posts/PostScanner';
import { ThemeManager } from '@src/components/theme/ThemeManager'; 
import { SlideoutManager } from '@src/components/slideout/SlideoutManager';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { BlockedUsersUI } from '@src/components/blockedUsers/BlockedUsersUI';
import { MESSAGES, ERRORS } from '@src/constants/Constants';

class Content {
    private isLoggedIn: boolean = false;
    private notificationManager: NotificationManager;
    private postScanner: PostScanner | null = null;
    private blockListDropdown: BlockListDropdown | null = null;
    private themeManager: ThemeManager;
    private slideoutManager: SlideoutManager;
    private blockedUsersService: BlockedUsersService;
    private blockedUsersUI: BlockedUsersUI | null = null;
    private blueskyService: BlueskyService;

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
        this.initialize();
    }

    private initialize(): void {
        console.log('Content script initialized.');
        this.isLoggedIn = this.blueskyService.isLoggedIn();
        this.subscribeToBlueskyServiceEvents();
        this.checkWebsite();

        // Listen for the window unload event to perform cleanup
        window.addEventListener('unload', () => this.destroy(), { once: true });
    }

    private subscribeToBlueskyServiceEvents(): void {
        this.blueskyService.on('sessionExpired', this.handleSessionExpired.bind(this));
    }

    private handleSessionExpired(): void {
        console.warn('Session expired. Logging out.');
        this.notificationManager.displayNotification(ERRORS.SESSION_EXPIRED, 'error');
        this.handleLogout();
    }

    private checkWebsite(): void {
        if (window.location.hostname === 'bsky.app') {
            this.themeManager.applySavedTheme();
            this.updateUI();

            this.postScanner = new PostScanner(
                this.notificationManager,
                this.blueskyService,
                this.blockedUsersService,
                () => this.isLoggedIn,
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

            this.slideoutManager.on('themeToggle', () => this.themeManager.toggleTheme());
            this.slideoutManager.on('blockListSelectionChange', this.handleBlockListSelectionChange.bind(this));
            this.slideoutManager.on('refreshBlockedUsers', () => this.blockedUsersUI?.refreshBlockedUsers());
            this.slideoutManager.on('refreshBlockLists', () => this.blockListDropdown?.refreshBlockLists());
            this.slideoutManager.on('login', this.handleLogin.bind(this));
            this.slideoutManager.on('logout', this.handleLogout.bind(this));
            this.slideoutManager.on('blockButtonsToggle', (visible: boolean) => {
                this.postScanner?.setBlockButtonsVisibility(visible);
            });
        }
    }

    private updateUI(): void {
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
                    () => this.isLoggedIn
                );
            }
        } else {
            this.slideoutManager.hideUserInfo();
            this.slideoutManager.hideBlockListsSection();
            this.blockListDropdown?.clearDropdown();
            this.blockedUsersUI?.hideBlockedUsersSection();
        }
    }

    private async handleLogin(username: string, password: string): Promise<void> {
        const loginSuccess = await this.blueskyService.login(username, password);
        if (loginSuccess) {
            this.isLoggedIn = true;
            this.updateUI();
            this.notificationManager.displayNotification(MESSAGES.LOGIN_SUCCESS, 'success');
        } else {
            this.slideoutManager.displayFormFeedback(MESSAGES.LOGIN_FAILED, 'danger');
        }
    }

    private async handleLogout(): Promise<void> {
        const logoutSuccess = await this.blueskyService.logout();
        if (logoutSuccess) {
            this.isLoggedIn = false;
            this.updateUI();
            this.notificationManager.displayNotification(MESSAGES.LOGOUT_SUCCESS, 'success');
            this.blockListDropdown?.clearSelection();
            this.blockedUsersService?.clearBlockedUsersData();
            this.blockListDropdown = null;
            this.blockedUsersUI = null;
        } else {
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

    // New method to clean up all components
    private destroy(): void {
        this.slideoutManager.destroy();
        this.blockedUsersUI?.destroy();
        this.postScanner?.destroy();
        this.blockedUsersService.destroy();
        this.blockListDropdown?.destroy();
        this.notificationManager.destroy();
        this.blueskyService.off('sessionExpired', this.handleSessionExpired.bind(this));
        // Optionally: Remove injected DOM elements
    }
}

const notificationManager = new NotificationManager();
const slideoutManager = new SlideoutManager();
const themeToggleButton = document.getElementById('theme-toggle') as HTMLElement;
const themeManager = new ThemeManager(themeToggleButton);
const blueskyService = new BlueskyService();
const blockedUsersService = new BlockedUsersService(blueskyService);

new Content(notificationManager, slideoutManager, themeManager, blueskyService, blockedUsersService);
