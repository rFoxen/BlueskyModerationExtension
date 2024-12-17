export class PostDetector {
    private listContainerSelectors = [
        'div.css-175oi2r.r-1ljd8xs.r-13l2t4g.r-1jj8364.r-lchren.r-1ye8kvj.r-13qz1uu.r-sa2ff0',
        'div.css-175oi2r.r-q5xsgd.r-1jj8364.r-lchren.r-1ye8kvj.r-13qz1uu.r-sa2ff0',
        'div.css-175oi2r.r-1jj8364.r-lchren.r-1ye8kvj.r-13qz1uu.r-sa2ff0',
        'div.css-175oi2r.r-sa2ff0',
    ];

    private postSelectors = [
        'div[role="link"][tabindex="0"]',
        'a[href^="/profile/"]',
        'div[role="link"][tabindex="0"][aria-label^="Post by"]',
    ].join(', ');

    public getExistingPosts(): HTMLElement[] {
        const containerQuery = this.listContainerSelectors.join(', ');
        const listContainers = document.querySelectorAll<HTMLElement>(containerQuery);
        const posts: HTMLElement[] = [];
        listContainers.forEach((container) => {
            const elements = container.querySelectorAll<HTMLElement>(this.postSelectors);
            elements.forEach((element) => posts.push(element));
        });
        return posts;
    }

    public detectAndProcessPosts(
        mutations: MutationRecord[],
        postProcessor: any // Replace with actual PostProcessor type if available
    ): void {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        if (this.isWithinListContainer(node)) {
                            postProcessor.processElement(node);
                        } else {
                            const posts = node.querySelectorAll<HTMLElement>(this.postSelectors);
                            posts.forEach((post) => {
                                if (this.isWithinListContainer(post)) {
                                    postProcessor.processElement(post);
                                }
                            });
                        }
                    }
                });
            }
        });
    }

    private isWithinListContainer(element: HTMLElement): boolean {
        const containerQuery = this.listContainerSelectors.join(', ');
        return !!element.closest(containerQuery);
    }
}
