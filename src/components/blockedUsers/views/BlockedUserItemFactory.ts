import blockedUserItemTemplate from '@public/templates/blockedUserItem.hbs';
import { LABELS, ARIA_LABELS, ERRORS } from '@src/constants/Constants';
import { BlockedUsersService } from '@src/services/BlockedUsersService';
import { NotificationManager } from '@src/components/common/NotificationManager';
import { Button } from '@src/components/common/Button';

export class BlockedUserItemFactory {
    constructor(
        private blockedUsersService: BlockedUsersService,
        private notificationManager: NotificationManager,
        private unblockUserCallback: (userHandle: string) => Promise<void>,
        private reportUserCallback: (userHandle: string) => void
    ) {}

    public async create(item: any): Promise<HTMLDivElement> {
        const userDid = item.subject.did;
        let userHandle = item.subject.handle;
        if (!userHandle) {
            try {
                userHandle = await this.blockedUsersService.resolveHandleFromDid(userDid);
            } catch (error) {
                console.error('Failed to resolve user handle from DID:', error);
                userHandle = LABELS.UNKNOWN_USER;
            }
        }

        const ariaLabels = {
            unblockUserLabel: ARIA_LABELS.UNBLOCK_USER(userHandle),
            reportUserLabel: ARIA_LABELS.REPORT_USER(userHandle),
        };

        const htmlString = blockedUserItemTemplate({ labels: LABELS, ariaLabels, userHandle });
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString.trim();
        const listItem = tempDiv.firstElementChild as HTMLDivElement;

        // Replace buttons with Button components
        const unblockButton = listItem.querySelector('.unblock-button') as HTMLButtonElement;
        const reportButton = listItem.querySelector('.report-button') as HTMLButtonElement;

        const unblockBtn = new Button({
            id: `unblock-${userHandle}`,
            classNames: 'btn btn-outline-secondary btn-sm unblock-button',
            text: LABELS.UNBLOCK,
            ariaLabel: ariaLabels.unblockUserLabel,
        });

        const reportBtn = new Button({
            id: `report-${userHandle}`,
            classNames: 'btn btn-outline-danger btn-sm report-button',
            text: LABELS.REPORT,
            ariaLabel: ariaLabels.reportUserLabel,
        });

        unblockButton.replaceWith(unblockBtn.element);
        reportButton.replaceWith(reportBtn.element);

        unblockBtn.addEventListener('click', async (event: Event) => {
            event.preventDefault();
            await this.unblockUserCallback(userHandle);
        });

        reportBtn.addEventListener('click', (event: Event) => {
            event.preventDefault();
            this.reportUserCallback(userHandle);
        });

        return listItem;
    }
}
