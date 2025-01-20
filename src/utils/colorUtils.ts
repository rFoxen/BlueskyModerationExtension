/**
 * Generates a consistent hexadecimal color code from a given string.
 * @param str The input string (e.g., block list name).
 * @returns A hexadecimal color code string (e.g., "#a1b2c3").
 */
export function stringToColor(str: string): string {
    // Simple hash function to convert string to a number
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Convert the hash to a hexadecimal color code
    let color = '#';
    for (let i = 0; i < 3; i++) {
        const value = (hash >> (i * 8)) & 0xFF;
        color += ('00' + value.toString(16)).substr(-2);
    }

    return color;
}


/**
 * Utility function to determine text color (black or white) based on background color for readability.
 * @param hexcolor The background color in hexadecimal format.
 * @returns 'black' or 'white' based on contrast.
 */
export function getContrastYIQ(hexcolor: string): string {
    hexcolor = hexcolor.replace('#', '');
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? 'black' : 'white';
}