import test from "node:test";
import assert from "node:assert/strict";
import { ANSI_BOLD, ANSI_CYAN, ANSI_DIM, ANSI_GREEN, ANSI_MAGENTA, ANSI_RED, ANSI_YELLOW, styleAnsi, } from "../src/cli/ansi.js";
test("styleAnsi wraps text in correct ESC codes", () => {
    assert.equal(styleAnsi(ANSI_BOLD, "hello"), "\u001B[1mhello\u001B[0m");
    assert.equal(styleAnsi(ANSI_DIM, "hello"), "\u001B[2mhello\u001B[0m");
    assert.equal(styleAnsi(ANSI_RED, "hello"), "\u001B[31mhello\u001B[0m");
    assert.equal(styleAnsi(ANSI_GREEN, "hello"), "\u001B[32mhello\u001B[0m");
    assert.equal(styleAnsi(ANSI_YELLOW, "hello"), "\u001B[33mhello\u001B[0m");
    assert.equal(styleAnsi(ANSI_MAGENTA, "hello"), "\u001B[35mhello\u001B[0m");
    assert.equal(styleAnsi(ANSI_CYAN, "hello"), "\u001B[36mhello\u001B[0m");
});
test("styleAnsi returns empty string for empty text without escapes", () => {
    assert.equal(styleAnsi(ANSI_BOLD, ""), "");
    assert.equal(styleAnsi(ANSI_RED, ""), "");
});
