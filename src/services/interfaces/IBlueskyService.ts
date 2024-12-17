import { AppBskyGraphDefs, BskyAgent } from '@atproto/api';

/**
 * Interface defining the contract for BlueskyService.
 */
export interface IBlueskyService {
    isLoggedIn(): boolean;
    getLoggedInUsername(): string | null;
    login(username: string, password: string): Promise<boolean>;
    logout(): Promise<boolean>;
    getBlockLists(): Promise<AppBskyGraphDefs.ListView[]>;
    getBlockListName(listUri: string): Promise<string>;
    getBlockedUsers(listUri: string): Promise<any[]>;
    resolveHandleFromDid(did: string): Promise<string>;
    resolveDidFromHandle(handle: string): Promise<string>;
    blockUser(userHandle: string, listUri: string): Promise<any>;
    unblockUser(userHandle: string, listUri: string): Promise<any>;
    reportAccount(userDid: string, reasonType: string, reason?: string): Promise<void>;
    getAccountProfile(userDidOrHandle: string): Promise<{ creationDate: Date | null; postsCount: number | null }>;
    destroy(): void;
}
