import Logger from '@src/utils/logger/Logger';
import { IMigration } from './Migration';
import { Migration1 } from './Migration1';
// Import additional migrations here

export class MigrationManager {
    private migrations: IMigration[] = [];

    constructor() {
        this.registerMigrations();
    }

    private registerMigrations(): void {
        this.migrations.push(new Migration1());
        // Register additional migrations here
    }

    public async applyMigrations(
        db: IDBDatabase,
        oldVersion: number,
        newVersion: number,
        transaction: IDBTransaction
    ): Promise<void> {
        const migrationsToApply = this.migrations
            .filter(
                (migration) =>
                    migration.version > oldVersion && migration.version <= newVersion
            )
            .sort((a, b) => a.version - b.version);

        for (const migration of migrationsToApply) {
            try {
                migration.migrate(db, transaction);
                Logger.debug(`Successfully applied migration for version ${migration.version}`);
            } catch (error) {
                Logger.error(
                    `Failed to apply migration for version ${migration.version}:`,
                    error
                );
                throw error; // Halt migrations on failure
            }
        }
    }
}
