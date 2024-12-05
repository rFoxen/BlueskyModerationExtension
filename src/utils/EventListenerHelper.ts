// =============================== //
// src/utils/EventListenerHelper.ts

type EventTypes = keyof HTMLElementEventMap;
type EventHandler = (event: Event) => void;

export class EventListenerHelper {
    static addEventListener(
        element: HTMLElement | Document | Window,
        type: EventTypes,
        handler: EventHandler,
        options?: boolean | AddEventListenerOptions
    ): void {
        element.addEventListener(type, handler, options);
    }

    static removeEventListener(
        element: HTMLElement | Document | Window,
        type: EventTypes,
        handler: EventHandler,
        options?: boolean | EventListenerOptions
    ): void {
        element.removeEventListener(type, handler, options);
    }

    static addMultipleEventListeners(
        element: HTMLElement | Document | Window,
        types: EventTypes[],
        handler: EventHandler,
        options?: boolean | AddEventListenerOptions
    ): void {
        types.forEach((type) => {
            element.addEventListener(type, handler, options);
        });
    }

    static removeMultipleEventListeners(
        element: HTMLElement | Document | Window,
        types: EventTypes[],
        handler: EventHandler,
        options?: boolean | EventListenerOptions
    ): void {
        types.forEach((type) => {
            element.removeEventListener(type, handler, options);
        });
    }
}
