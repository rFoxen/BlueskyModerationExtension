import { STORAGE_KEYS } from '@src/constants/Constants';

export class StateManager {
    /**
     * Retrieves a boolean value from localStorage.
     * @param key - The storage key.
     * @param defaultValue - The default value if the key does not exist.
     * @returns The boolean value.
     */
    getBoolean(key: string, defaultValue: boolean = false): boolean {
        const value = localStorage.getItem(key);
        if (value === null) return defaultValue;
        return value === 'true';
    }

    /**
     * Saves a boolean value to localStorage.
     * @param key - The storage key.
     * @param value - The boolean value to save.
     */
    setBoolean(key: string, value: boolean): void {
        localStorage.setItem(key, value.toString());
    }

    /**
     * Retrieves a string value from localStorage.
     * @param key - The storage key.
     * @param defaultValue - The default value if the key does not exist.
     * @returns The string value.
     */
    getString(key: string, defaultValue: string = ''): string {
        const value = localStorage.getItem(key);
        return value !== null ? value : defaultValue;
    }

    /**
     * Saves a string value to localStorage.
     * @param key - The storage key.
     * @param value - The string value to save.
     */
    setString(key: string, value: string): void {
        localStorage.setItem(key, value);
    }

    /**
     * Clears specific keys from localStorage based on a prefix.
     * @param prefix - The prefix of keys to remove.
     */
    clearKeysWithPrefix(prefix: string): void {
        const keysToRemove = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
        keysToRemove.forEach((key) => localStorage.removeItem(key));
    }

    /**
     * Clears all keys from localStorage.
     */
    clearAll(): void {
        localStorage.clear();
    }
}
