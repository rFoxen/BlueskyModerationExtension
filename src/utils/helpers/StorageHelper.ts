export class StorageHelper {
    static getString(key: string, defaultValue: string = ''): string {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    }

    static setString(key: string, value: string): void {
        localStorage.setItem(key, value);
    }

    static getBoolean(key: string, defaultValue: boolean = false): boolean {
        const value = localStorage.getItem(key);
        if (value === null) return defaultValue;
        return value === 'true';
    }

    static setBoolean(key: string, value: boolean): void {
        localStorage.setItem(key, value.toString());
    }
}
