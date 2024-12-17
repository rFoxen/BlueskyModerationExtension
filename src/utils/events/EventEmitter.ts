type EventHandler = (...args: any[]) => void;

export class EventEmitter {
    private events: { [event: string]: EventHandler[] } = {};

    public on(event: string, handler: EventHandler): void {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(handler);
    }

    public off(event: string, handler: EventHandler): void {
        if (!this.events[event]) return;
        this.events[event] = this.events[event].filter((h) => h !== handler);
    }

    public emit(event: string, ...args: any[]): void {
        if (!this.events[event]) return;
        // Create a copy to prevent issues if handlers modify the events
        const handlers = [...this.events[event]];
        handlers.forEach((handler) => handler(...args));
    }

    // New method to remove all listeners for a specific event
    public removeAllListeners(event?: string): void {
        if (event) {
            delete this.events[event];
        } else {
            this.events = {};
        }
    }
}
