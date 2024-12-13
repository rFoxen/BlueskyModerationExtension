/**
 * Sanitizes a string by escaping HTML special characters to prevent XSS attacks.
 * @param context - The string to be sanitized.
 * @returns The sanitized string.
 */
export function sanitizeHTML(context: string): string {
    const escape = (str: string): string =>
        str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    return escape(context);
} 