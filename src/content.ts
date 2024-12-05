// *** SOURCE CODE STARTS HERE *** //  
// =============================== //
// src/content.ts

import './helpers/encodeURIComponent';
import '@public/styles.css';

import { BlueskyService } from '@src/services/BlueskyService';
import { BlockListDropdown } from '@src/components/BlockListDropdown';
import { NotificationManager } from '@src/components/NotificationManager';
import { PostScanner } from '@src/components/PostScanner';
import { ThemeManager } from '@src/components/ThemeManager';
import { SlideoutManager } from '@src/components/SlideoutManager';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { BlockedUsersUI } from '@src/components/BlockedUsersUI';
import { MESSAGES } from '@src/constants/Constants';

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
        blueskyService: BlueskyService
    ) {
        this.notificationManager = notificationManager;
        this.slideoutManager = slideoutManager;
        this.themeManager = themeManager;
        this.blueskyService = blueskyService;

        this.blockedUsersService = new BlockedUsersService(this.blueskyService);
        this.initialize();
    }

    private initialize(): void {
        console.log('Content script initialized.');
        this.isLoggedIn = this.blueskyService.isLoggedIn();

        this.checkWebsite();
    }

    private checkWebsite(): void {
        if (window.location.hostname === 'bsky.app') {
            this.themeManager.applySavedTheme();
            this.updateUI();

            // Initialize PostScanner
            this.postScanner = new PostScanner(
                this.notificationManager,
                this.blueskyService,
                this.blockedUsersService,
                () => this.isLoggedIn,
                () => this.blockListDropdown?.getSelectedValue() || null,
                async (userHandle: string) => {
                    const selectedUri = this.blockListDropdown?.getSelectedValue();
                    if (!selectedUri || !this.blockedUsersService) return;

                    await this.blockedUsersService.addBlockedUser(
                        userHandle,
                        selectedUri
                    );
                },
                async (userHandle: string) => {
                    const selectedUri = this.blockListDropdown?.getSelectedValue();
                    if (!selectedUri || !this.blockedUsersService) return;

                    await this.blockedUsersService.removeBlockedUser(
                        userHandle,
                        selectedUri
                    );
                },
                () => this.slideoutManager.getBlockButtonsToggleState()
            );

            // Event listeners
            this.slideoutManager.on('themeToggle', () =>
                this.themeManager.toggleTheme()
            );
            this.slideoutManager.on(
                'blockListSelectionChange',
                this.handleBlockListSelectionChange.bind(this)
            );
            this.slideoutManager.on('refreshBlockedUsers', () =>
                this.blockedUsersUI?.refreshBlockedUsers()
            );
            this.slideoutManager.on('refreshBlockLists', () =>
                this.blockListDropdown?.refreshBlockLists()
            );
            this.slideoutManager.on('login', this.handleLogin.bind(this));
            this.slideoutManager.on('logout', this.handleLogout.bind(this));
            this.slideoutManager.on('blockButtonsToggle', (visible: boolean) => {
                this.postScanner?.setBlockButtonsVisibility(visible);
            });
        }
    }

    private updateUI(): void {
        if (this.isLoggedIn) {
            this.slideoutManager.displayLoginInfo(
                this.blueskyService.getLoggedInUsername()
            );
            // Initialize BlockListDropdown
            if (!this.blockListDropdown) {
                this.blockListDropdown = new BlockListDropdown(
                    'block-lists-dropdown',
                    this.blueskyService
                );
                this.blockListDropdown.onSelectionChange(
                    this.handleBlockListSelectionChange.bind(this)
                );
                this.blockListDropdown.loadBlockLists();
            }
            this.slideoutManager.showBlockListsSection();

            // Initialize BlockedUsersUI
            if (!this.blockedUsersUI) {
                this.blockedUsersUI = new BlockedUsersUI(
                    'blocked-users-section',
                    this.blockedUsersService,
                    this.notificationManager,
                    this.blockListDropdown!
                );
            }
        } else {
            this.slideoutManager.hideUserInfo();
            this.slideoutManager.hideBlockListsSection();
            this.blockListDropdown?.clearDropdown();
            this.blockedUsersUI?.hideBlockedUsersSection();
        }
    }

    private async handleLogin(
        username: string,
        password: string
    ): Promise<void> {
        const loginSuccess = await this.blueskyService.login(username, password);
        if (loginSuccess) {
            this.isLoggedIn = true;
            this.updateUI();
            this.notificationManager.displayNotification(
                MESSAGES.LOGIN_SUCCESS,
                'success'
            );
            this.slideoutManager.hideSlideout();
        } else {
            this.slideoutManager.displayFormFeedback(
                MESSAGES.LOGIN_FAILED,
                'danger'
            );
        }
    }

    private async handleLogout(): Promise<void> {
        const logoutSuccess = await this.blueskyService.logout();
        if (logoutSuccess) {
            this.isLoggedIn = false;
            this.updateUI();
            this.notificationManager.displayNotification(
                MESSAGES.LOGOUT_SUCCESS,
                'success'
            );
            this.blockListDropdown?.clearSelection();
            this.blockedUsersService?.clearBlockedUsersData();
            this.blockListDropdown = null;
            this.blockedUsersUI = null;
        } else {
            this.notificationManager.displayNotification(
                MESSAGES.LOGOUT_FAILED,
                'error'
            );
        }
    }

    private async handleBlockListSelectionChange(
        selectedUri: string
    ): Promise<void> {
        if (!selectedUri) {
            this.blockedUsersUI?.hideBlockedUsersSection();
            return;
        }

        await this.blockedUsersUI?.loadBlockedUsers(selectedUri);
    }
}

// Instantiate dependencies
const notificationManager = new NotificationManager();
const slideoutManager = new SlideoutManager();
const themeToggleButton = document.getElementById(
    'theme-toggle'
) as HTMLElement;
const themeManager = new ThemeManager(themeToggleButton);
const blueskyService = new BlueskyService();

// Create Content instance with injected dependencies
new Content(notificationManager, slideoutManager, themeManager, blueskyService);