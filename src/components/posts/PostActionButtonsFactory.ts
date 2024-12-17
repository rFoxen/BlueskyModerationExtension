import { Button } from '@src/components/common/Button';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { LABELS, ARIA_LABELS } from '@src/constants/Constants';

interface PostActionButtonsOptions {
    profileHandle: string;
    isUserBlocked: boolean;
    onBlock: (userHandle: string, button: Button) => Promise<void>;
    onReport: (userHandle: string) => void;
}

export class PostActionButtonsFactory {
    private notificationManager: NotificationManager;
    private blockedUsersService: BlockedUsersService;

    constructor(notificationManager: NotificationManager, blockedUsersService: BlockedUsersService) {
        this.notificationManager = notificationManager;
        this.blockedUsersService = blockedUsersService;
    }

    public createButtons(options: PostActionButtonsOptions): HTMLElement {
        const { profileHandle, isUserBlocked, onBlock, onReport } = options;

        const blockButton = new Button({
            classNames: isUserBlocked
                ? 'toggle-block-button btn btn-danger btn-sm'
                : 'toggle-block-button btn btn-outline-secondary btn-sm',
            text: isUserBlocked ? LABELS.UNBLOCK : LABELS.BLOCK,
            ariaLabel: isUserBlocked
                ? ARIA_LABELS.UNBLOCK_USER(profileHandle)
                : ARIA_LABELS.BLOCK_USER(profileHandle),
        });

        const reportButton = new Button({
            classNames: 'report-user-button btn btn-warning btn-sm',
            text: LABELS.REPORT,
            ariaLabel: ARIA_LABELS.REPORT_USER(profileHandle),
        });

        const buttonContainer = document.createElement('div');
        buttonContainer.classList.add('button-container');
        buttonContainer.appendChild(blockButton.element);
        buttonContainer.appendChild(reportButton.element);

        // Event Listeners
        blockButton.addEventListener('click', async (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            await onBlock(profileHandle, blockButton);
        });

        reportButton.addEventListener('click', (event: Event) => {
            event.preventDefault();
            event.stopPropagation();
            onReport(profileHandle);
        });

        return buttonContainer;
    }

    public destroy(): void {
        // Implement if any cleanup is necessary
    }
}
