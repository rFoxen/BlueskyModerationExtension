import { ARIA_LABELS } from '@src/constants/Constants';

export class NotificationManager {
    private notificationContainer!: HTMLElement;

    constructor() {
        this.createNotificationContainer();
    }

    private createNotificationContainer(): void {
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.id = 'notification-container';
        document.body.appendChild(this.notificationContainer);
    }

    public displayNotification(message: string, type: 'success' | 'error' | 'info'): void {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        const messageSpan = document.createElement('span');
        messageSpan.className = 'notification-message';
        messageSpan.textContent = message;

        const closeButton = document.createElement('button');
        closeButton.className = 'notification-close';
        closeButton.innerHTML = '&times;';
        closeButton.setAttribute('aria-label', ARIA_LABELS.CLOSE_NOTIFICATION);

        closeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.fadeOutNotification(notification);
        });

        notification.appendChild(messageSpan);
        notification.appendChild(closeButton);

        // Add swipe to dismiss functionality
        this.addSwipeToDismiss(notification);

        this.notificationContainer.appendChild(notification);

        // Automatically remove the notification after 5 seconds
        setTimeout(() => {
            this.fadeOutNotification(notification);
        }, 5000);
    }

    private addSwipeToDismiss(notification: HTMLElement): void {
        let startX: number;
        let currentX: number;
        let touching: boolean = false;

        const threshold = 100; // Minimum swipe distance to trigger dismissal

        const touchStart = (e: TouchEvent) => {
            e.stopPropagation();
            startX = e.touches[0].clientX;
            touching = true;
            notification.classList.remove('no-transition');
        };

        const touchMove = (e: TouchEvent) => {
            if (!touching) return;
            e.stopPropagation();
            e.preventDefault(); // Prevent background scrolling

            currentX = e.touches[0].clientX;
            const change = currentX - startX;
            if (change < 0) return; // Ignore left swipes

            notification.style.transform = `translateX(${change}px)`;
            notification.style.opacity = `${1 - change / threshold}`;
        };

        const touchEnd = (e: TouchEvent) => {
            if (!touching) return;
            touching = false;
            e.stopPropagation();

            const change = currentX - startX;
            if (change > threshold) {
                this.fadeOutNotification(notification);
            } else {
                notification.classList.add('no-transition');
                notification.style.transform = '';
                notification.style.opacity = '';
            }
        };

        notification.addEventListener('touchstart', touchStart);
        notification.addEventListener('touchmove', touchMove);
        notification.addEventListener('touchend', touchEnd);

        // Prevent click events from propagating
        notification.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    private fadeOutNotification(notification: HTMLElement): void {
        notification.classList.add('fade-out');
        notification.addEventListener('transitionend', () => {
            this.removeNotification(notification);
        });
    }

    private removeNotification(notification: HTMLElement): void {
        if (notification && notification.parentElement) {
            notification.parentElement.removeChild(notification);
        }
    }
}