import { EventEmitter } from '@src/utils/events/EventEmitter';

/**
 * EventService provides a centralized event bus.
 * Other services can listen to or emit events through this singleton or instance.
 */
export class EventService extends EventEmitter {
    // You could add specialized methods or typed event names if desired.
    // For now, it inherits all from EventEmitter.
}
