import { EventEmitter } from '@src/utils/events/EventEmitter';
import { AuthenticationError, NotFoundError, APIError } from './CustomErrors';
import { ERRORS } from '@src/constants/Constants';

/**
 * ErrorService centralizes error creation, handling, and propagation.
 */
export class ErrorService extends EventEmitter {
    public createAuthenticationError(message: string = ERRORS.USER_NOT_AUTHENTICATED): AuthenticationError {
        return new AuthenticationError(message);
    }

    public createNotFoundError(message: string = ERRORS.UNKNOWN_ERROR): NotFoundError {
        return new NotFoundError(message);
    }

    public createApiError(message: string = ERRORS.UNKNOWN_ERROR, status: number = 500): APIError {
        return new APIError(message, status);
    }

    /**
     * Emit a generic error event for listeners to handle
     */
    public handleError(error: Error): void {
        this.emit('error', error);
    }
}
