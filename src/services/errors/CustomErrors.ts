/**
 * Custom Error Classes used in the Bluesky ecosystem.
 */

export class AuthenticationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class APIError extends Error {
    public status: number;
    constructor(message: string, status: number) {
        super(message);
        this.name = 'APIError';
        this.status = status;
    }
}
