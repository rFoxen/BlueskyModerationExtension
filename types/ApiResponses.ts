export interface FetchListResponse {
    items: BlockedUser[];
    cursor?: string;
}

export interface BlockedUser {
    subject: {
        createdAt?: string;
        did: string;
        displayName?: string;
        handle?: string;
        viewer?:{
            blockedBy: boolean;
            blocking: string;
            muted: boolean;
        }
    };
    uri: string;
}
