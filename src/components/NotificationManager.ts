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
        // If at max capacity, remove the oldest
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

        this.addSwipeToDismiss(notification);
        return notification;
    }

    private addSwipeToDismiss(notification: HTMLElement): void {
        let startX: number = 0;
        let currentX: number = 0;
        let touching: boolean = false;
        const threshold = 100; // Minimum swipe distance to dismiss

        const touchStart = (e: TouchEvent) => {
            e.stopPropagation();
            if (e.touches.length > 0) {
                startX = e.touches[0].clientX;
                touching = true;
                notification.classList.remove('no-transition');
            }
        };

        const touchMove = (e: TouchEvent) => {
            if (!touching || e.touches.length === 0) return;
            e.stopPropagation();
            e.preventDefault();
            currentX = e.touches[0].clientX;
            const change = currentX - startX;
            if (change < 0) return; // only swipe right
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

        notification.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    private fadeOutNotification(notification: HTMLElement): void {
        // If not currently in notifications array, it's already removed
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
