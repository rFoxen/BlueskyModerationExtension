export interface IMigration {
    version: number;
    migrate(db: IDBDatabase, transaction: IDBTransaction): void;
}
