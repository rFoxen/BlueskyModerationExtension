export const SELECTORS = {
    postContainers: 'div[data-testid^="feedItem"], div[data-testid^="postThreadItem"], div[data-testid^="user-"], a[data-testid^="user-"]',
    posts: 'div[role="link"][tabindex="0"], a[href^="/profile/"], div[role="link"][tabindex="0"][aria-label^="Post by"]',
    // Add more generalized selectors as needed
};