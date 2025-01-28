/**
 * Safely encodes a URI component.
 * @param context - The string to be encoded.
 * @returns The encoded URI component.
 */
export function encodeURIComponentSafe(context: string): string {
    return encodeURIComponent(context);
}
