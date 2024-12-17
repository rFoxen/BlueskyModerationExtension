import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlueskyService } from '@src/services/BlueskyService';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { SlideoutManager } from '@src/components/slideout/SlideoutManager';
import { MutationObserverManager } from '@src/utils/dom/MutationObserverManager';
import { PostDetector } from './PostDetector';
import { PostProcessor } from './PostProcessor';
import { PostTypeDeterminer } from '@src/utils/helpers/PostTypeDeterminer';
import { UserReporter } from '@src/components/reporting/UserReporter';

export class PostScanner {
    private notificationManager: NotificationManager;
    private isLoggedIn: () => boolean;
    private getSelectedBlockList: () => string | null;
    private onUserBlocked: (userHandle: string) => Promise<void>;
    private onUserUnblocked: (userHandle: string) => Promise<void>;
    private blueskyService: BlueskyService;
    private blockedUsersService: BlockedUsersService;
    private observerManager: MutationObserverManager;
    private postDetector: PostDetector;
    private postProcessor: PostProcessor;
    private postTypeDeterminer: PostTypeDeterminer;
    private userReporter: UserReporter;
    private blockButtonsVisible: boolean = true;

    constructor(
        notificationManager: NotificationManager,
        blueskyService: BlueskyService,
        blockedUsersService: BlockedUsersService,
        isLoggedIn: () => boolean,
        getSelectedBlockList: () => string | null,
        onUserBlocked: (userHandle: string) => Promise<void>,
        onUserUnblocked: (userHandle: string) => Promise<void>
    ) {
        this.notificationManager = notificationManager;
        this.blueskyService = blueskyService;
        this.blockedUsersService = blockedUsersService;
        this.isLoggedIn = isLoggedIn;
        this.getSelectedBlockList = getSelectedBlockList;
        this.onUserBlocked = onUserBlocked;
        this.onUserUnblocked = onUserUnblocked;

        this.postTypeDeterminer = new PostTypeDeterminer();
        this.userReporter = new UserReporter(
            this.notificationManager,
            this.blockedUsersService,
            this.isLoggedIn
        );

        this.postDetector = new PostDetector();
        this.postProcessor = new PostProcessor(
            this.notificationManager,
            this.blueskyService,
            this.blockedUsersService,
            this.isLoggedIn,
            this.getSelectedBlockList,
            this.onUserBlocked,
            this.onUserUnblocked,
            this.userReporter
        );

        this.observerManager = new MutationObserverManager(
            this.handleMutations.bind(this),
            { childList: true, subtree: true }
        );

        this.subscribeToBlockedUsersServiceEvents();
        this.start();
    }

    private subscribeToBlockedUsersServiceEvents(): void {
        this.blockedUsersService.on('blockedUserAdded', (newItem: any) => {
            const userHandle = newItem.subject.handle || newItem.subject.did;
            this.postProcessor.updatePostsByUser(userHandle, true);
        });

        this.blockedUsersService.on('blockedUserRemoved', (userHandle: string) => {
            this.postProcessor.updatePostsByUser(userHandle, false);
        });
    }

    public start(): void {
        this.observerManager.start(document.body);
        this.scanForPosts();
    }

    private handleMutations(mutations: MutationRecord[]): void {
        this.postDetector.detectAndProcessPosts(mutations, this.postProcessor);
    }

    private scanForPosts(): void {
        const existingPosts = this.postDetector.getExistingPosts();
        this.postProcessor.processPosts(existingPosts);
    }

    public setBlockButtonsVisibility(visible: boolean): void {
        this.blockButtonsVisible = visible;
        this.postProcessor.setBlockButtonsVisibility(visible);
    }

    public destroy(): void {
        this.observerManager.destroy();
        this.postProcessor.destroy();
        this.userReporter.destroy();
        // Additional cleanup if necessary
    }
}
