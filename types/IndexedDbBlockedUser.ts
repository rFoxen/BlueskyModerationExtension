export interface IndexedDbBlockedUser {
    id: string;          // "listUri#userHandle"
    listUri: string;
    userHandle: string;
    did: string;
    recordUri: string;   // the record URI (or partial rkey) from the Bluesky record
    timestamp: number;    // position to maintain order
}