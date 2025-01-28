type PostType =
    | 'post'
    | 'repost'
    | 'quoted-repost'
    | 'notification-reply'
    | 'notification-like'
    | 'reply'
    | 'block-list-item'
    | 'people-search-item';

export class PostTypeDeterminer {
    // Centralized list of data-testid values corresponding to 'block-list-item'
    private blockListItemTestIds: string[] = ['userAvatarImage', 'user-profile-card']; // Add more as needed

    public determinePostType(element: HTMLElement): PostType | null {
        const testId = element.getAttribute('data-testid') || '';
        const textContent = element.textContent?.toLowerCase() || '';
        const profileLink = element.querySelector('a[href^="/profile/"]') as HTMLAnchorElement | null;

        // Check if the element matches any block-list-item identifiers
        if (this.blockListItemTestIds.includes(testId)) {
            return 'block-list-item';
        }

        // Check for feed or thread items
        const isPostItem = testId.startsWith('feedItem-by-') || testId.startsWith('postThreadItem-by-');
        if (isPostItem) {
            if (textContent.includes('reposted by')) {
                const nestedPost = element.querySelector('[data-testid^="feedItem-by-"], [data-testid^="postThreadItem-by-"]');
                return nestedPost ? 'quoted-repost' : 'repost';
            }
            if (textContent.includes('reply to ')) {
                return 'reply';
            }
            if (textContent.includes('reply to you')) {
                return 'notification-reply';
            }
            if (textContent.includes('liked your post')) {
                return 'notification-like';
            }
            return 'post';
        }

        // Check for people-search-item
        if (
            profileLink &&
            !testId.startsWith('feedItem-by-') &&
            !testId.startsWith('postThreadItem-by-') &&
            !this.blockListItemTestIds.includes(testId)
        ) {
            const followButton = element.querySelector('button')?.textContent?.toLowerCase();
            if (followButton === 'follow') {
                return 'people-search-item';
            }
        }

        // If profile link exists but no patterns match, treat as normal post or reply
        if (profileLink) {
            if (textContent.includes('reply to ')) {
                return 'reply';
            }
            // Check if multiple posts inside
            const descendantPosts = element.querySelectorAll('div[role="link"][tabindex="0"]');
            if (descendantPosts.length > 1) return null;
            return 'post';
        }

        return null;
    }
}
