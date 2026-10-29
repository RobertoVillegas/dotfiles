// node --test tests/pi-claude-accounts/claude-cli.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { keychainBlocked } from "../../home/private_dot_pi/private_agent/extensions/claude-accounts/claude-cli.ts";

test("an SSH session on macOS cannot use the keychain", () => {
	// `security show-keychain-info` exits 36: "User interaction is not allowed".
	assert.equal(keychainBlocked("darwin", 36), true);
});

test("a desktop session on macOS can", () => {
	assert.equal(keychainBlocked("darwin", 0), false);
});

test("a security command that did not run counts as no keychain", () => {
	assert.equal(keychainBlocked("darwin", null), true);
});

test("Linux keeps Claude Code's tokens in files, so it is never blocked", () => {
	assert.equal(keychainBlocked("linux", 1), false);
});
