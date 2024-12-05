import { ARIA_LABELS } from '@src/constants/Constants';

export class NotificationManager {
    private notificationContainer!: HTMLElement;
    private readonly MAX_NOTIFICATIONS = 3;
    private readonly DISPLAY_TIME = 3000; // shorter display time
    private notifications: HTMLElement[] = [];

    constructor() {
        this.createNotificationContainer();
    }

    private createNotificationContainer(): void {
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.id = 'notification-container';
        document.body.appendChild(this.notificationContainer);
    }

    public displayNotification(message: string, type: 'success' | 'error' | 'info'): void {
        // If we are at max capacity, remove the oldest first
        if (this.notifications.length >= this.MAX_NOTIFICATIONS) {
            const oldest = this.notifications.shift();
            if (oldest) {
                this.removeNotification(oldest);
            }
        }

        const notification = this.createNotificationElement(message, type);
        this.notifications.push(notification);
        this.notificationContainer.insertBefore(notification, this.notificationContainer.firstChild);

        // Automatically remove after DISPLAY_TIME
        setTimeout(() => {
            this.fadeOutNotification(notification);
        }, this.DISPLAY_TIME);
    }

    private createNotificationElement(message: string, type: 'success' | 'error' | 'info'): HTMLElement {
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

        // Add swipe-to-dismiss
        this.addSwipeToDismiss(notification);
        return notification;
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

        notification.addEventListener('touchstart', touchStart, { passive: true });
        notification.addEventListener('touchmove', touchMove, { passive: false });
        notification.addEventListener('touchend', touchEnd);

        // Prevent click events from propagating
        notification.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    private fadeOutNotification(notification: HTMLElement): void {
        // If already fading out or removed, return
        if (!this.notifications.includes(notification)) return;

        notification.classList.add('fade-out');
        notification.addEventListener('transitionend', () => {
            this.removeNotification(notification);
        }, { once: true });
    }

    private removeNotification(notification: HTMLElement): void {
        const index = this.notifications.indexOf(notification);
        if (index !== -1) {
            this.notifications.splice(index, 1);
        }
        if (notification.parentElement) {
            notification.parentElement.removeChild(notification);
        }
    }
}
