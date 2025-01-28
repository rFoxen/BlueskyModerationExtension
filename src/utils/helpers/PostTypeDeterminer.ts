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
    /**
     * Determines the type of a post based on its HTMLElement.
     * @param element - The HTMLElement representing the post.
     * @returns The determined PostType or null if it doesn't match any known type.
     */
    public determinePostType(element: HTMLElement): PostType | null {
        const testId = element.getAttribute('data-testid') || '';
        const textContent = element.textContent?.toLowerCase() || '';
        const profileLink = element.querySelector('a[href^="/profile/"]') as HTMLAnchorElement | null;

        // block-list-item
        if (testId.startsWith('user-')) {
            return 'block-list-item';
        }

        // feed or thread items
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

        // people-search-item
        if (
            profileLink &&
            !testId.startsWith('feedItem-by-') &&
            !testId.startsWith('postThreadItem-by-') &&
            !testId.startsWith('user-')
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
