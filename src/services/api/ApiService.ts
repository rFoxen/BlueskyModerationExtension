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
    public async fetchWithAuth(endpoint: string, options: RequestInit = {}): Promise<any> {
        this.sessionService.ensureAuthenticated();
        const agent = this.sessionService.getAgent();

        const accessJwt = agent.session?.accessJwt;
        if (!accessJwt) {
            throw this.errorService.createAuthenticationError();
        }

        const authOptions: RequestInit = {
            ...options,
            headers: {
                ...options.headers,
                Authorization: `Bearer ${accessJwt}`,
            },
        };

        try {
            const response = await fetch(endpoint, authOptions);
            if (response.ok) {
                return response.json();
            }

            // If 401, try refresh once
            if (response.status === 401) {
                const refreshed = await this.sessionService.tryRefreshSession();
                if (refreshed) {
                    const newAccessJwt = agent.session?.accessJwt;
                    if (!newAccessJwt) {
                        throw this.errorService.createAuthenticationError(ERRORS.SESSION_EXPIRED);
                    }
                    // retry with new token
                    authOptions.headers = {
                        ...authOptions.headers,
                        Authorization: `Bearer ${newAccessJwt}`,
                    };
                    const retryResponse = await fetch(endpoint, authOptions);
                    if (retryResponse.ok) {
                        return retryResponse.json();
                    } else {
                        const errorData = await retryResponse.json().catch(() => ({ message: ERRORS.UNKNOWN_ERROR }));
                        throw new APIError(errorData.message, retryResponse.status);
                    }
                } else {
                    // Session cannot be refreshed
                    throw this.errorService.createAuthenticationError(ERRORS.SESSION_EXPIRED);
                }
            }

            // For other errors
            const errorData = await response.json().catch(() => ({ message: ERRORS.UNKNOWN_ERROR }));
            throw new APIError(errorData.message || ERRORS.UNKNOWN_ERROR, response.status);
        } catch (error: any) {
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
        return this.fetchWithAuth(API_ENDPOINTS.CREATE_RECORD, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    public async postDeleteRecord(body: any): Promise<any> {
        return this.fetchWithAuth(API_ENDPOINTS.DELETE_RECORD, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }

    public async resolveDid(did: string): Promise<any> {
        const url = `${API_ENDPOINTS.RESOLVE_DID}?did=${encodeURIComponent(did)}`;
        return this.fetchWithAuth(url);
    }

    public async resolveHandle(handle: string): Promise<any> {
        const url = `${API_ENDPOINTS.GET_PROFILE}?actor=${encodeURIComponent(handle)}`;
        return this.fetchWithAuth(url);
    }

    public async reportAccount(body: any): Promise<void> {
        await this.fetchWithAuth(API_ENDPOINTS.REPORT_ACCOUNT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    }
}
