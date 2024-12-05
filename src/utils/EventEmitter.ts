// =============================== //
// src/utils/EventEmitter.ts

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
        this.events[event].forEach((handler) => handler(...args));
    }
}

