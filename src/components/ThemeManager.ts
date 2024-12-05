// =============================== //
// src/components/ThemeManager.ts

import {
    ERRORS,
    STORAGE_KEYS,
} from '@src/constants/Constants';

export class ThemeManager {
    private themeToggleButton: HTMLElement;

    constructor(themeToggleButton: HTMLElement) {
        if (!themeToggleButton) {
            throw new Error('Theme toggle button not provided.');
        }
        this.themeToggleButton = themeToggleButton;
        this.updateThemeToggleButton(this.isDarkMode());
    }

    public toggleTheme(): void {
        const body = document.body;
        body.classList.toggle('dark-mode');
        const isDarkMode = body.classList.contains('dark-mode');
        this.updateThemeToggleButton(isDarkMode);
        this.saveThemePreference(isDarkMode);
    }

    public applySavedTheme(): void {
        const theme = this.getSavedTheme();
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            this.updateThemeToggleButton(true);
        } else {
            document.body.classList.remove('dark-mode');
            this.updateThemeToggleButton(false);
        }
    }

    private updateThemeToggleButton(isDarkMode: boolean): void {
        this.themeToggleButton.textContent = isDarkMode ? '☀️' : '🌙';
        this.themeToggleButton.setAttribute(
            'aria-label',
            isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'
        );
    }

    private saveThemePreference(isDarkMode: boolean): void {
        try {
            localStorage.setItem(
                STORAGE_KEYS.THEME_PREFERENCE,
                isDarkMode ? 'dark' : 'light'
            );
        } catch (error) {
            console.error(ERRORS.FAILED_TO_SAVE_THEME_PREFERENCE, error);
        }
    }

    private getSavedTheme(): string | null {
        try {
            return localStorage.getItem(STORAGE_KEYS.THEME_PREFERENCE);
        } catch (error) {
            console.error(ERRORS.FAILED_TO_RETRIEVE_THEME_PREFERENCE, error);
            return null;
        }
    }

    private isDarkMode(): boolean {
        return document.body.classList.contains('dark-mode');
    }
}
