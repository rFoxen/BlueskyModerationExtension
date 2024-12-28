import { SELECTORS } from '@src/constants/selectors';

export class PostDetector {
    private listContainerSelectors = [
        SELECTORS.postContainers,
    ];

    private postSelectors = [
        SELECTORS.posts,
    ].join(',');

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
