export interface FetchListResponse {
    items: BlockedUser[];
    cursor?: string;
}

export interface BlockedUser {
    subject: {
        handle?: string;
        did: string;
    };
    uri: string;
}
