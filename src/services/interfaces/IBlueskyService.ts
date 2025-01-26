import { AppBskyGraphDefs } from '@atproto/api';
import { BlockedUser } from 'types/ApiResponses';
import {IndexedDbBlockedUser} from "../../../types/IndexedDbBlockedUser";

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
    getBlockedUsers(
        listUri: string,
        maxRetries?: number,
        onChunkFetched?: (chunk: BlockedUser[], nextCursor: string|undefined) => Promise<void>,
        resumeCursor?: string|undefined): Promise<boolean>;
    resolveHandleFromDid(did: string): Promise<string>;
    resolveDidFromHandle(handle: string): Promise<string>;
    blockUser(userHandle: string, listUri: string): Promise<any>;
    unblockUser(blockedUser: IndexedDbBlockedUser): Promise<any>;
    reportAccount(userDid: string, reasonType: string, reason?: string): Promise<void>;
    getAccountProfile(
        userDidOrHandle: string
    ): Promise<{ creationDate: Date | null; postsCount: number | null }>;
    destroy(): void;
}
