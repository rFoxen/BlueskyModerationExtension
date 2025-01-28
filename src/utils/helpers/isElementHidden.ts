/**
 * Returns `true` if the element is effectively invisible or "hidden" in the layout.
 * - Checking `offsetParent === null` is a quick proxy for `display: none`,
 *   or if a parent is hidden, etc.
 */
export function isElementHiddenByCss(element: HTMLElement): boolean {
    return element.offsetParent === null;
}
