// src/utils/EventListenerHelper.ts

type EventMap = HTMLElementEventMap & DocumentEventMap & WindowEventMap;

export class EventListenerHelper {
    /**
     * Adds an event listener with the correct event type.
     *
     * @param element - The target element.
     * @param type - The event type.
     * @param handler - The event handler with the correct event type.
     * @param options - Optional event listener options.
     */
    static addEventListener<K extends keyof EventMap>(
        element: HTMLElement | Document | Window,
        type: K,
        handler: (event: EventMap[K]) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        element.addEventListener(type, handler as EventListener, options);
    }

    /**
     * Removes an event listener with the correct event type.
     *
     * @param element - The target element.
     * @param type - The event type.
     * @param handler - The event handler to remove.
     * @param options - Optional event listener options.
     */
    static removeEventListener<K extends keyof EventMap>(
        element: HTMLElement | Document | Window,
        type: K,
        handler: (event: EventMap[K]) => void,
        options?: boolean | EventListenerOptions
    ): void {
        element.removeEventListener(type, handler as EventListener, options);
    }

    /**
     * Adds multiple event listeners with the correct event types.
     *
     * @param element - The target element.
     * @param types - An array of event types.
     * @param handler - The event handler for all event types.
     * @param options - Optional event listener options.
     */
    static addMultipleEventListeners<K extends keyof EventMap>(
        element: HTMLElement | Document | Window,
        types: K[],
        handler: (event: EventMap[K]) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        types.forEach((type) => {
            element.addEventListener(type, handler as EventListener, options);
        });
    }

    /**
     * Removes multiple event listeners with the correct event types.
     *
     * @param element - The target element.
     * @param types - An array of event types.
     * @param handler - The event handler to remove.
     * @param options - Optional event listener options.
     */
    static removeMultipleEventListeners<K extends keyof EventMap>(
        element: HTMLElement | Document | Window,
        types: K[],
        handler: (event: EventMap[K]) => void,
        options?: boolean | EventListenerOptions
    ): void {
        types.forEach((type) => {
            element.removeEventListener(type, handler as EventListener, options);
        });
    }
}
