export interface FetchListResponse {
    items: BlockedUser[];
    list: {
        listItemCount: number,
    }
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
