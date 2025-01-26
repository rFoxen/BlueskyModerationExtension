export interface IndexedDbBlockedUser {
    id: string;          // "listUri#userHandle"
    listUri: string;
    userHandle: string;
    did: string;
    recordUri: string;   // the record URI (or partial rkey) from the Bluesky record
    order: number;    // position to maintain order
    ngramKeys?: [string, string][];
}

export interface IListMetadata {
    listUri: string;
    count: number;
    maxOrder: number;

    // NEW FIELDS:
    isComplete?: boolean;     // defaults to false until full fetch finishes
    nextCursor?: string|undefined; // the last known pagination cursor from server
}