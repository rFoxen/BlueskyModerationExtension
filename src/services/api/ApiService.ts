import { BskyAgent } from '@atproto/api';
import { API_ENDPOINTS, ERRORS } from '@src/constants/Constants';
import { SessionService } from '../session/SessionService';
import { ErrorService } from '../errors/ErrorService';
import { APIError } from '../errors/CustomErrors';
import { FetchListResponse } from 'types/ApiResponses';

/**
 * ApiService is responsible for making authenticated requests.
 * We do a pre-check for token expiry by calling sessionService.ensureAccessTokenFresh().
 */
export class ApiService {
    private sessionService: SessionService;
    private errorService: ErrorService;
    private baseUrl: string; // e.g. https://bsky.social

    constructor(
        sessionService: SessionService,
        errorService: ErrorService,
        baseUrl: string = API_ENDPOINTS.SERVICE
    ) {
        this.sessionService = sessionService;
        this.errorService = errorService;
        this.baseUrl = baseUrl;
    }

    public async fetchWithAuth(endpoint: string, options: RequestInit = {}, timeout: number = 5000): Promise<any> {
        // Pre-check token expiry
        await this.sessionService.ensureAccessTokenFresh();

        // Then proceed with normal "authenticated request" logic
        this.sessionService.ensureAuthenticated();
        const agent = this.sessionService.getAgent();
        const accessJwt = agent.session?.accessJwt;
        if (!accessJwt) {
            throw this.errorService.createAuthenticationError();
        }

        // Setup for fetch
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);

        const authOptions: RequestInit = {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${accessJwt}`,
            },
            signal: controller.signal,
        };

        console.time(`[DEBUG] fetchWithAuth => ${endpoint}`);
        try {
            const response = await fetch(endpoint, authOptions);
            clearTimeout(id);

            if (response.ok) {
                console.timeEnd(`[DEBUG] fetchWithAuth => ${endpoint}`);
                return response.json();
            }

            // If still 401, fallback: maybe token was revoked or mismatch.
            if (response.status === 401) {
                console.log(`[DEBUG] fetchWithAuth => 401 (post-refresh?). Session might be invalid.`);
                // We can auto-logout or throw. Let's just throw an auth error:
                throw this.errorService.createAuthenticationError(ERRORS.SESSION_EXPIRED);
            }

            // Other errors
            const errorData = await response.json().catch(() => ({
                message: ERRORS.UNKNOWN_ERROR,
            }));
            throw new APIError(errorData.message || ERRORS.UNKNOWN_ERROR, response.status);
        } catch (error: any) {
            clearTimeout(id);
            // Check for CORS/timeouts, etc
            if (error.name === 'AbortError') {
                console.error(`[DEBUG] fetchWithAuth => ${endpoint} timed out after ${timeout}ms`);
                throw new Error(`Request to ${endpoint} timed out.`);
            } else if (
                error instanceof TypeError &&
                error.message.includes('NetworkError') // or "Failed to fetch"
            ) {
                console.error(`[DEBUG] fetchWithAuth => CORS/Network error for ${endpoint}:`, error);
                throw new Error('Network or CORS error occurred.');
            }
            console.timeEnd(`[DEBUG] fetchWithAuth => ${endpoint}`);
            throw error;
        }
    }

    public async fetchProfile(actor: string): Promise<any> {
        const url = `${API_ENDPOINTS.GET_PROFILE}?actor=${encodeURIComponent(actor)}`;
        return this.fetchWithAuth(url);
    }

    public async fetchLists(actorDid: string): Promise<any> {
        const url = `${API_ENDPOINTS.GET_LISTS}?actor=${encodeURIComponent(actorDid)}`;
        return this.fetchWithAuth(url);
    }

    public async fetchList(
        listUri: string,
        cursor?: string | null,
        limit: number = 100
    ): Promise<FetchListResponse> {
        let endpoint = `${API_ENDPOINTS.GET_LIST}?list=${encodeURIComponent(listUri)}&limit=${limit}`;
        if (cursor) endpoint += `&cursor=${encodeURIComponent(cursor)}`;
        return this.fetchWithAuth(endpoint);
    }

    public async postCreateRecord(body: any): Promise<any> {
        console.time(`[DEBUG] postCreateRecord`);
        try {
            const result = await this.fetchWithAuth(API_ENDPOINTS.CREATE_RECORD, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return result;
        } finally {
            console.timeEnd(`[DEBUG] postCreateRecord`);
        }
    }

    public async postDeleteRecord(body: any): Promise<any> {
        console.time(`[DEBUG] postDeleteRecord`);
        try {
            const result = await this.fetchWithAuth(API_ENDPOINTS.DELETE_RECORD, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            return result;
        } finally {
            console.timeEnd(`[DEBUG] postDeleteRecord`);
        }
    }

    public async resolveDid(did: string): Promise<any> {
        const url = `${API_ENDPOINTS.RESOLVE_DID}?did=${encodeURIComponent(did)}`;
        return this.fetchWithAuth(url);
    }

    public async resolveHandle(handle: string): Promise<string> {
        const url = `${API_ENDPOINTS.GET_PROFILE}?actor=${encodeURIComponent(handle)}`;
        console.time(`[DEBUG] resolveHandle => ${url}`);
        try {
            const response = await this.fetchWithAuth(url, {}, 5000); // 5-second timeout
            if (response && response.did) {
                console.timeEnd(`[DEBUG] resolveHandle => ${url}`);
                return response.did;
            } else {
                console.timeEnd(`[DEBUG] resolveHandle => ${url}`);
                throw new Error('DID not found in profile response.');
            }
        } catch (error) {
            console.timeEnd(`[DEBUG] resolveHandle => ${url}`);
            console.error(
                `[DEBUG] resolveHandle => Error resolving DID for handle "${handle}":`,
                error
            );
            throw error;
        }
    }

    public async reportAccount(body: any): Promise<void> {
        await this.fetchWithAuth(API_ENDPOINTS.REPORT_ACCOUNT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }
}
