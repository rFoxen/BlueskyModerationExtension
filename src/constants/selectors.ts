export const SELECTORS = {
    postContainers: `
    div[data-testid^="feedItem"],
    div[data-testid^="postThreadItem"],
    div[data-testid^="user-"],
    div[role="link"][tabindex="0"],
    a[data-testid^="user-"],
    a[href^="/profile/"]
    `,
    posts: `
    div[role="link"][tabindex="0"],
    a[href^="/profile/"],
    div[role="link"][tabindex="0"][aria-label^="Post by"],
    div[data-testid^="feedItem-by-"],
    div[data-testid^="postThreadItem-by-"]
      `,
    // Add more generalized selectors as needed
};