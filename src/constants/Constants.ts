export const MESSAGES = {
    LOGIN_SUCCESS: 'Login successful!',
    LOGIN_FAILED: 'Login failed. Please check your credentials.',
    LOGOUT_SUCCESS: 'Logged out successfully.',
    LOGOUT_FAILED: 'Logout failed. Please try again.',
    BLOCK_LISTS_CLEARED: 'Block lists cleared.',
    PLEASE_SELECT_BLOCK_LIST: 'Please select a block list.',
    PLEASE_SELECT_BLOCK_LIST_TO_REFRESH: 'Please select a block list to refresh.',
    BLOCKED_USERS_LIST_REFRESHED: 'Blocked users list refreshed.',
    FAILED_TO_LOAD_BLOCKED_USERS: 'Failed to load blocked users.',
    NO_BLOCK_LISTS_FOUND: 'No block lists found.',
    LOADING_BLOCK_LISTS: 'Loading block lists...',
    SELECT_BLOCK_LIST: 'Select a block list',
    LOGIN_REQUIRED_TO_BLOCK_USERS: 'Please log in to block users.',
    USER_BLOCKED_SUCCESS: (userHandle: string, listName: string) => `User @${userHandle} has been added to "${listName}" block list.`,
    USER_UNBLOCKED_SUCCESS: (userHandle: string) => `User @${userHandle} has been unblocked.`,
    LOGIN_REQUIRED_TO_REPORT_USERS: 'Please log in to report users.',
    PROMPT_REPORT_REASON: 'Please enter a reason for reporting this user:',
    USER_REPORTED_SUCCESS: (username: string) => `User ${username} has been reported.`,
    REPORT_CANCELLED: 'Report cancelled.',
    INVALID_REPORT_SELECTION: 'Invalid selection. Report cancelled.',
    ERROR_LOADING_BLOCKED_USERS: 'Error loading blocked users.',
    ERROR_REFRESHING_BLOCKED_USERS: 'Error refreshing blocked users.',
};

export const LABELS = {
    EXTENSION_TITLE: 'Bluesky Moderation Helper',
    LOGIN_TO_BSKY_APP: 'Login to bsky.app',
    USERNAME: 'Username',
    PASSWORD: 'Password',
    LOGIN: 'Login',
    LOGOUT: 'Logout',
    REFRESH: '↻',
    SWITCH_THEME: 'Switch Theme',
    BLOCK_LIST_SELECTION: 'Block List Selection")',
    BLOCK_LIST_SELECTION_INFO: 'Select Block List (Used when you click "Block")',
    ADDITIONAL_BLOCK_LISTS: 'Additional Block Lists for Styling',
    ADDITIONAL_BLOCK_LISTS_INFO: 'These lists won\'t be used for block/unblock, but any user found in them will be styled as "blocked" in your feed.',
    ADDITIONAL_BLOCK_LISTS_INSTRUCTION: 'Select Additional Block Lists',
    BLOCKED_USERS: 'Blocked Users',
    BLOCKED_USERS_IN_LIST: (listName: string) => `Blocked Users in "${listName}"`,
    NO_USERS_FOUND: 'No users found.',
    PREVIOUS: 'Previous',
    NEXT: 'Next',
    PAGE_INFO: (currentPage: number, totalPages: number) => `Page ${currentPage} of ${totalPages}`,
    BLOCK: 'Block',
    UNBLOCK: 'Unblock',
    REPORT_ACCOUNT: 'Report User',
    REFRESH_BLOCK_LISTS: 'Refresh Block Lists',
    REFRESH_BLOCKED_USERS: 'Refresh Blocked Users',
    LOADING_BLOCKED_USERS: 'Loading blocked users...',
    SEARCH_BLOCKED_USERS: 'Search blocked users',
    SELECT_BLOCK_LIST_PLACEHOLDER: 'Select a block list',
    SHOW_BLOCK_BUTTONS: 'Show Block Buttons',
    UNNAMED_LIST: 'Unnamed List',
    UNKNOWN_USER: 'Unknown User',
    PROMPT_ADDITIONAL_COMMENTS: 'Please enter additional comments (optional):',
    // New Labels for Tabs
    LOGIN_TAB: 'Login',
    BLOCKED_USERS_TAB: 'Blocked Users',
    POST_INSERTION_METHOD: 'Post Insertion Method',
    PREPEND: 'Above Post',
    APPEND: 'Below Post',
};

export const ARIA_LABELS = {
    CLOSE_SLIDEOUT: 'Close slideout',
    CLOSE_NOTIFICATION: 'Close notification',
    OPEN_SLIDEOUT: 'Open slideout',
    SUBMIT_LOGIN: 'Submit login',
    LOGOUT: 'Logout',
    THEME_TOGGLE: 'Switch Theme',
    REFRESH_BLOCK_LISTS: 'Refresh Block Lists',
    REFRESH_BLOCKED_USERS: 'Refresh Blocked Users',
    TOGGLE_BLOCK_BUTTONS: 'Toggle block buttons visibility',
    BLOCK_USER: (userHandle: string) => `Block user ${userHandle}`,
    UNBLOCK_USER: (userHandle: string) => `Unblock user ${userHandle}`,
    REPORT_USER: (username: string) => `Report user ${username}`,
    PREPEND_OPTION: 'Select to prepend blocked posts to the top',
    APPEND_OPTION: 'Select to append blocked posts to the bottom',
};

export const ERRORS = {
    BOTH_FIELDS_REQUIRED: 'Both fields are required.',
    USER_NOT_AUTHENTICATED: 'User not authenticated.',
    SESSION_EXPIRED: 'Session expired.',
    UNKNOWN_ERROR: 'Unknown error occurred.',
    FAILED_TO_BLOCK_USER: 'Failed to block the user. Please try again.',
    FAILED_TO_SAVE_SESSION: 'Failed to save session data.',
    FAILED_TO_LOAD_SESSION: 'Failed to load session data.',
    FAILED_TO_LOAD_BLOCK_LISTS: 'Failed to load block lists.',
    FAILED_TO_SAVE_SLIDEOUT_STATE: 'Failed to save slideout state.',
    FAILED_TO_REFRESH_BLOCKED_USERS: 'Failed to refresh blocked users.',
    FAILED_TO_REPORT_USER: 'Failed to report the user.',
    FAILED_TO_RETRIEVE_SLIDEOUT_STATE: 'Failed to retrieve slideout state.',
    FAILED_TO_SAVE_THEME_PREFERENCE: 'Failed to save theme preference.',
    FAILED_TO_RETRIEVE_THEME_PREFERENCE: 'Failed to retrieve saved theme.',
    FAILED_TO_SAVE_SELECTED_BLOCK_LIST: 'Failed to save selected block list.',
    FAILED_TO_RETRIEVE_SELECTED_BLOCK_LIST: 'Failed to retrieve saved block list.',
    FAILED_TO_SAVE_BLOCKED_USERS_TOGGLE_STATE: 'Failed to save blocked users toggle state.',
    FAILED_TO_RETRIEVE_BLOCKED_USERS_TOGGLE_STATE: 'Failed to retrieve blocked users toggle state.',
    FAILED_TO_SAVE_BLOCKED_USERS: 'Failed to save blocked users data.',
    FAILED_TO_LOAD_BLOCKED_USERS: 'Failed to load blocked users data.',
    FAILED_TO_LOAD_FRESHNESS_DATA: (userHandle: string) => `Failed to load @${userHandle} fresshness data`,
    FAILED_TO_RESOLVE_HANDLE_FROM_DID: 'Failed to resolve handle from DID.',
    FAILED_TO_UNBLOCK_USER: 'Failed to unblock the user. Please try again.',
    FAILED_TO_SAVE_BLOCK_BUTTONS_TOGGLE_STATE: 'Failed to save block buttons toggle state.',
    FAILED_TO_RETRIEVE_BLOCK_BUTTONS_TOGGLE_STATE: 'Failed to retrieve block buttons toggle state.',
};

export const STORAGE_KEYS = {
    BLUESKY_SESSION: 'blueskySession',
    SELECTED_BLOCK_LIST: 'selectedBlockList',
    BLOCKED_USERS_TOGGLE_STATE: 'blockedUsersToggleState',
    BLOCK_BUTTONS_TOGGLE_STATE: 'blockButtonsToggleState',
    SLIDEOUT_STATE: 'slideoutState',
    BLOCKED_USERS_PREFIX: 'blockedUsers_',
    THEME_PREFERENCE: 'theme',
    BLOCKED_POST_STYLE: 'blockedPostStyle',
    PREPEND_APPEND_OPTION: 'prependAppendOption',
    ADDITIONAL_BLOCK_LISTS: 'additionalBlockLists'
};

export const API_ENDPOINTS = {
    SERVICE: 'https://bsky.social',
    LOGIN: 'https://bsky.social/xrpc/com.atproto.server.createSession',
    LOGOUT: 'https://bsky.social/xrpc/com.atproto.server.deleteSession',
    GET_LISTS: 'https://bsky.social/xrpc/app.bsky.graph.getLists',
    GET_LIST: 'https://bsky.social/xrpc/app.bsky.graph.getList',
    GET_PROFILE: 'https://bsky.social/xrpc/app.bsky.actor.getProfile',
    CREATE_RECORD: 'https://bsky.social/xrpc/com.atproto.repo.createRecord',
    DELETE_RECORD: 'https://bsky.social/xrpc/com.atproto.repo.deleteRecord',
    RESOLVE_HANDLE: 'https://bsky.social/xrpc/com.atproto.identity.resolveHandle',
    RESOLVE_DID: 'https://bsky.social/xrpc/com.atproto.identity.resolveDid',
    REPORT_ACCOUNT: 'https://bsky.social/xrpc/com.atproto.moderation.createReport',
};
