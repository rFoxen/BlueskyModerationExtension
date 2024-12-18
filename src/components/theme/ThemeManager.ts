import { ERRORS, STORAGE_KEYS } from '@src/constants/Constants';
import { StorageHelper } from '@src/utils/helpers/StorageHelper';

export class ThemeManager {
    private themeToggleButton: HTMLElement;

    constructor(themeToggleButton: HTMLElement) {
        if (!themeToggleButton) {
            throw new Error('Theme toggle button not provided.');
        }
        this.themeToggleButton = themeToggleButton;

        // Bind the toggleTheme method to ensure correct 'this' context
        this.themeToggleButton.addEventListener('click', this.toggleTheme.bind(this));
    }

    public toggleTheme(): void {
        const body = document.body;
        body.classList.toggle('dark-mode');
        const isDarkMode = body.classList.contains('dark-mode');
        this.updateThemeToggleButton(isDarkMode);
        StorageHelper.setString(STORAGE_KEYS.THEME_PREFERENCE, isDarkMode ? 'dark' : 'light');
        console.log(`Theme toggled to ${isDarkMode ? 'dark' : 'light'} mode.`);
    }

    public applySavedTheme(): void {
        const theme = StorageHelper.getString(STORAGE_KEYS.THEME_PREFERENCE, 'light');
        if (theme === 'dark') {
            document.body.classList.add('dark-mode');
            this.updateThemeToggleButton(true);
            console.log('Applied saved theme: dark mode.');
        } else {
            document.body.classList.remove('dark-mode');
            this.updateThemeToggleButton(false);
            console.log('Applied saved theme: light mode.');
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
