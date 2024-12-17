import { ERRORS, STORAGE_KEYS } from '@src/constants/Constants';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';

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
        StorageHelper.setString(STORAGE_KEYS.THEME_PREFERENCE, isDarkMode ? 'dark' : 'light');
    }

    public applySavedTheme(): void {
        const theme = StorageHelper.getString(STORAGE_KEYS.THEME_PREFERENCE, 'light');
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

    private isDarkMode(): boolean {
        return document.body.classList.contains('dark-mode');
    }
}
