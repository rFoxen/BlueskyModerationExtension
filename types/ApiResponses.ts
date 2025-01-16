export interface FetchListResponse {
    items: BlockedUser[];
    cursor?: string;
}

export interface BlockedUser {
    subject: {
        createdAt?: string;
        did: string;
        displayName?: string;
        handle: string;
        indexedAt: string;
        viewer:{
            blockedBy: boolean;
            blocking: string;
            muted: boolean;
            blockingByList:{
                indexedAt: string;
            }
        }
    };
    uri: string;
}
