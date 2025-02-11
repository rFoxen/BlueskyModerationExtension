import {BlockListDropdown} from '@src/components/blockedUsers/BlockListDropdown';
import {AdditionalBlockListsDropdown} from '@src/components/blockedUsers/AdditionalBlockListsDropdown';
import {BlockedUsersUI} from '@src/components/blockedUsers/BlockedUsersUI';
import {NotificationManager} from '@src/components/common/NotificationManager';
import {PostScanner} from '@src/components/posts/PostScanner';
import {SlideoutManager} from '@src/components/slideout/SlideoutManager';
import {BlueskyService} from '@src/services/BlueskyService';
import {BlockedUsersService} from '@src/services/BlockedUsersService';
import {MESSAGES, ERRORS, STORAGE_KEYS} from '@src/constants/Constants';
import Logger from '@src/utils/logger/Logger';

/**
 * Coordinates UI states between the slideout, block lists, post scanning, etc.
 */
export class UIStateCoordinator {
    private isLoggedIn: boolean;
    private slideoutManager: SlideoutManager;
    private notificationManager: NotificationManager;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private blockListDropdown: BlockListDropdown | null = null;
    private additionalBlockListsDropdown: AdditionalBlockListsDropdown;
    private blockedUsersUI: BlockedUsersUI | null = null;
    private postScanner: PostScanner | null = null;
    private getIsLoggedIn: () => boolean;

    constructor(
        slideoutManager: SlideoutManager,
        additionalBlockListsDropdown: AdditionalBlockListsDropdown,
        notificationManager: NotificationManager,
        blueskyService: BlueskyService,
        blockedUsersService: BlockedUsersService,
        isLoggedIn: () => boolean
    ) {
        this.slideoutManager = slideoutManager;
        this.additionalBlockListsDropdown = additionalBlockListsDropdown;
        this.notificationManager = notificationManager;
        this.blueskyService = blueskyService;
        this.blockedUsersService = blockedUsersService;
        this.getIsLoggedIn = isLoggedIn;
        this.isLoggedIn = isLoggedIn();

        this.setupSlideoutEvents();
        this.subscribeToAdditionalListsEvents();

        // Listen for rate limit exceeded events
        this.blueskyService.on('rateLimitExceeded', this.handleRateLimitExceeded.bind(this));
    }

    private setupSlideoutEvents(): void {
        this.slideoutManager.on('login', this.handleLogin.bind(this));
        this.slideoutManager.on('logout', this.handleLogout.bind(this));

        this.slideoutManager.on('blockButtonsToggle', (visible: boolean) => {
            this.postScanner?.setBlockButtonsVisibility(visible);
        });
        this.slideoutManager.on('reportButtonsToggle', (visible: boolean) => {
            this.postScanner?.setReportButtonsVisibility(visible);
        });
        this.slideoutManager.on('freshnessToggle', (visible: boolean) => {
            this.postScanner?.setFreshnessVisibility(visible);
        });

        this.slideoutManager.on('refreshBlockLists', () => this.blockListDropdown?.refreshBlockLists());

        // Listen for loginFailed and logoutFailed from BlueskyService
        this.blueskyService.on('loginFailed', () => {
            this.notificationManager.displayNotification(ERRORS.LOGIN_FAILED, 'error');
            this.updateUI();
        });
        this.blueskyService.on('logoutFailed', () => {
            this.notificationManager.displayNotification(ERRORS.LOGOUT_FAILED, 'error');
            this.updateUI();
        });
        this.blueskyService.on('sessionUpdated', (session) => {
            this.updateUI();
        });
        this.slideoutManager.on('blockPostStyleChange', (newStyle: string) => {
            this.handleBlockedPostStyleChange(newStyle);
        });
    }
    
    private subscribeToAdditionalListsEvents(): void {
        document.addEventListener('additionalBlockListsChanged', (event: Event) => {
            Logger.debug('additionalBlockListsChanged event triggered, re-scanning posts...');
            // Force a re-scan so the new lists apply
            this.postScanner?.reprocessAllPosts();
        });
    }
    
    public initializeUIForSite(hostname: string): void {
        if (hostname === 'bsky.app') {
            // 1) Construct PostScanner first
            this.setupPostScanner();

            // 2) Retrieve the user’s saved style from localStorage (or any store)
            const savedStyle = localStorage.getItem(STORAGE_KEYS.BLOCKED_POST_STYLE) || 'darkened';

            // 3) Immediately apply that style so PostScanner uses it
            this.handleBlockedPostStyleChange(savedStyle);

            // 4) Proceed to usual UI updates
            this.updateUI();
        }
    }

    private setupPostScanner(): void {
        this.postScanner = new PostScanner(
            this.notificationManager,
            this.blueskyService,
            this.blockedUsersService,
            this.getIsLoggedIn,
            () => {
                // 1) Get the “primary” list URI from blockListDropdown
                const mainList = this.blockListDropdown?.getSelectedValue() || null;

                // 2) Get the additional list URIs (an array) from AdditionalBlockListsDropdown
                const additionalLists = this.additionalBlockListsDropdown?.getSelectedValues() || [];

                // 3) Combine them, removing duplicates
                //    simplest approach is just to put them all in a Set
                const combinedSet = new Set<string>();
                if (mainList) {
                    combinedSet.add(mainList);
                }
                for (const uri of additionalLists) {
                    combinedSet.add(uri);
                }

                // Return as an array
                return Array.from(combinedSet);
            },
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
        Logger.debug('UIStateCoordinator: updateUI called, isLoggedIn:', this.isLoggedIn);
        if (this.isLoggedIn) {
            this.additionalBlockListsDropdown.loadBlockLists();
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
                    this.blueskyService,
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
        Logger.debug('UIStateCoordinator: Handling login for', username);
        const loginSuccess = await this.blueskyService.login(username, password);
        if (loginSuccess) {
            this.isLoggedIn = true;
            Logger.debug('UIStateCoordinator: Login successful');
            this.updateUI();
            this.notificationManager.displayNotification(MESSAGES.LOGIN_SUCCESS, 'success');
        } else {
            Logger.debug('UIStateCoordinator: Login failed');
            this.slideoutManager.displayFormFeedback(ERRORS.LOGIN_FAILED, 'danger');
        }
    }

    private async handleLogout(): Promise<void> {
        const logoutSuccess = await this.blueskyService.logout();
        if (logoutSuccess) {
            this.isLoggedIn = false;
            Logger.debug('UIStateCoordinator: Logout successful');
            this.updateUI();
            this.notificationManager.displayNotification(MESSAGES.LOGOUT_SUCCESS, 'success');
            this.blockListDropdown?.clearSelection();
            this.blockedUsersService?.clearBlockedUsersData();
            this.blockListDropdown?.destroy();
            this.blockedUsersUI?.destroy();
            this.blockListDropdown = null;
            this.blockedUsersUI = null;
        } else {
            Logger.debug('UIStateCoordinator: Logout failed');
            this.notificationManager.displayNotification(ERRORS.LOGOUT_FAILED, 'error');
        }
    }

    private async handleBlockListSelectionChange(selectedUri: string): Promise<void> {
        if (!selectedUri) {
            this.blockedUsersUI?.hideBlockedUsersSection();
            return;
        }

        // Load the blocked users in memory
        await this.blockedUsersUI?.loadBlockedUsersUI(selectedUri);

        // IMPORTANT: Re-scan existing posts so they reflect the newly loaded block data
        if (this.postScanner) {
            this.postScanner.reprocessAllPosts();
        }
    }

    private handleBlockedPostStyleChange(newStyle: string): void {
        // Forward to postScanner => postProcessor => apply style
        Logger.debug('UIStateCoordinator: blockPostStyleChange =>', newStyle);
        if (this.postScanner) {
            this.postScanner.setBlockedPostStyle(newStyle);
        }
    }
    
    private handleRateLimitExceeded(data: { waitTime: number }): void {
        const { waitTime } = data;
        // Display a notification to the user
        this.notificationManager.displayNotification(
            MESSAGES.RATE_LIMIT_EXCEEDED(waitTime),
            'warn'
        );
    }
    
    public destroy(): void {
        this.blockedUsersUI?.destroy();
        this.postScanner?.destroy();
        this.blockListDropdown?.destroy();
    }
}
