import { BskyAgent } from '@atproto/api';
import { API_ENDPOINTS, ERRORS } from '@src/constants/Constants';
import { SessionService } from '../session/SessionService';
import { ErrorService } from '../errors/ErrorService';
import { APIError, NotFoundError } from '../errors/CustomErrors';
import { FetchListResponse } from 'types/ApiResponses';

/**
 * ApiService centralizes HTTP calls to the Bluesky endpoints (with Auth).
 */
export class ApiService {
    private sessionService: SessionService;
    private errorService: ErrorService;
    private baseUrl: string; // e.g. https://bsky.social

    constructor(sessionService: SessionService, errorService: ErrorService, baseUrl: string = API_ENDPOINTS.SERVICE) {
        this.sessionService = sessionService;
        this.errorService = errorService;
        this.baseUrl = baseUrl;
    }

    /**
     * A generic method for making authenticated requests.
     */
    public async fetchWithAuth(endpoint: string, options: RequestInit = {}, timeout: number = 5000): Promise<any> {
        this.sessionService.ensureAuthenticated();
        const agent = this.sessionService.getAgent();
        const accessJwt = agent.session?.accessJwt;
        if (!accessJwt) {
            throw this.errorService.createAuthenticationError();
        }
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

            // If 401, try refresh once
            if (response.status === 401) {
                console.log(`[DEBUG] fetchWithAuth => 401; trying refresh session...`);
                const refreshed = await this.sessionService.tryRefreshSession();
                if (refreshed) {
                    const newAccessJwt = agent.session?.accessJwt;
                    if (!newAccessJwt) {
                        throw this.errorService.createAuthenticationError(ERRORS.SESSION_EXPIRED);
                    }
                    // Retry
                    authOptions.headers = {
                        ...authOptions.headers,
                        Authorization: `Bearer ${newAccessJwt}`,
                    };
                    console.time(`[DEBUG] fetchWithAuth => retry ${endpoint}`);
                    const retryResponse = await fetch(endpoint, authOptions);
                    console.timeEnd(`[DEBUG] fetchWithAuth => retry ${endpoint}`);

                    if (retryResponse.ok) {
                        return retryResponse.json();
                    } else {
                        const errorData = await retryResponse.json().catch(() => ({ message: ERRORS.UNKNOWN_ERROR }));
                        throw new APIError(errorData.message, retryResponse.status);
                    }
                } else {
                    throw this.errorService.createAuthenticationError(ERRORS.SESSION_EXPIRED);
                }
            }

            // Other errors
            const errorData = await response.json().catch(() => ({ message: ERRORS.UNKNOWN_ERROR }));
            throw new APIError(errorData.message || ERRORS.UNKNOWN_ERROR, response.status);

        } catch (error: any) {
            clearTimeout(id);
            if (error.name === 'AbortError') {
                console.error(`[DEBUG] fetchWithAuth => ${endpoint} timed out after ${timeout}ms`);
                throw new Error(`Request to ${endpoint} timed out.`);
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

    public async fetchList(listUri: string, cursor?: string|null, limit: number = 100): Promise<FetchListResponse> {
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
            const response = await this.fetchWithAuth(url, {}, 5000); // Set 5-second timeout
            if (response && response.did) {
                console.timeEnd(`[DEBUG] resolveHandle => ${url}`);
                return response.did;
            } else {
                console.timeEnd(`[DEBUG] resolveHandle => ${url}`);
                throw new Error('DID not found in profile response.');
            }
        } catch (error) {
            console.timeEnd(`[DEBUG] resolveHandle => ${url}`);
            console.error(`[DEBUG] resolveHandle => Error resolving DID for handle "${handle}":`, error);
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
