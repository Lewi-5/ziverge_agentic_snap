/**
 * Terminal presentation uses ANSI SGR sequences (SPEC §7.11).
 *
 * Define S(n, text) as ESC + "[" + decimal(n) + "m" + text + ESC + "[0m".
 * Codes are:
 * - 1: bold
 * - 2: dim
 * - 31: red
 * - 32: green
 * - 33: yellow
 * - 35: magenta
 * - 36: cyan
 */
export const ANSI_BOLD = 1;
export const ANSI_DIM = 2;
export const ANSI_RED = 31;
export const ANSI_GREEN = 32;
export const ANSI_YELLOW = 33;
export const ANSI_MAGENTA = 35;
export const ANSI_CYAN = 36;
const ESC = "\u001B";
/**
 * Wraps text in an ANSI SGR escape sequence and reset sequence: S(n, text).
 * If text is empty, returns empty string without escapes.
 */
export function styleAnsi(code, text) {
    if (text.length === 0) {
        return "";
    }
    return `${ESC}[${String(code)}m${text}${ESC}[0m`;
}
