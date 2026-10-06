// Runs the Claude Code CLI's own login commands for one account. Credentials
// never pass through this code: `claude auth login` completes Anthropic's
// sign-in and stores the session in the account's config directory (and the
// macOS keychain); this only chooses the directory and relays what the CLI
// prints.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/** `claude` from PATH, or the native installer's launcher when Pi runs with
 *  a reduced PATH (for example under T3's background service). */
function claudeBinary(): string {
	for (const dir of (process.env.PATH ?? "").split(delimiter)) {
		if (dir && existsSync(join(dir, "claude"))) return join(dir, "claude");
	}
	const fallback = join(homedir(), ".local", "bin", "claude");
	return existsSync(fallback) ? fallback : "claude";
}

// Same scrub as pi-claude-bridge's subscriberProfileEnv: an inherited API key
// or endpoint override would make the CLI log in or report somewhere else.
const DIRECT_OVERRIDES = new Set([
	"ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN",
	"ANTHROPIC_BASE_URL", "ANTHROPIC_CUSTOM_HEADERS", "ANTHROPIC_AWS_API_KEY",
	"ANTHROPIC_FOUNDRY_AUTH_TOKEN", "ANTHROPIC_BEDROCK_BASE_URL",
	"ANTHROPIC_VERTEX_BASE_URL", "ANTHROPIC_FOUNDRY_BASE_URL", "AWS_BEARER_TOKEN_BEDROCK",
]);

export function accountEnv(configDir: string | undefined): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };
	for (const key of Object.keys(env)) {
		if (DIRECT_OVERRIDES.has(key) || key.startsWith("CLAUDE_CODE_USE_")) delete env[key];
	}
	if (configDir) env.CLAUDE_CONFIG_DIR = configDir;
	else delete env.CLAUDE_CONFIG_DIR;
	return env;
}

export interface AuthStatus {
	loggedIn: boolean;
	email?: string;
	subscriptionType?: string;
}

function run(args: string[], configDir: string | undefined, timeoutMs: number): Promise<{ code: number | null; out: string }> {
	return new Promise((resolve) => {
		const child = spawn(claudeBinary(), args, { env: accountEnv(configDir), stdio: ["ignore", "pipe", "pipe"] });
		let out = "";
		child.stdout.on("data", (chunk) => (out += chunk));
		child.stderr.on("data", (chunk) => (out += chunk));
		const timer = setTimeout(() => child.kill(), timeoutMs);
		child.on("error", () => {
			clearTimeout(timer);
			resolve({ code: null, out });
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			resolve({ code, out });
		});
	});
}

/** Local check; sends nothing to the model. */
export async function authStatus(configDir: string | undefined): Promise<AuthStatus | undefined> {
	const { out } = await run(["auth", "status", "--json"], configDir, 15_000);
	try {
		const parsed = JSON.parse(out) as { loggedIn?: boolean; email?: string; subscriptionType?: string };
		return { loggedIn: parsed.loggedIn === true, email: parsed.email, subscriptionType: parsed.subscriptionType };
	} catch {
		return undefined;
	}
}

export async function logout(configDir: string | undefined): Promise<boolean> {
	const { code } = await run(["auth", "logout"], configDir, 30_000);
	return code === 0;
}

/** Terminal escapes the CLI wraps its link in (OSC 8 hyperlink, colors). */
const stripEscapes = (text: string) =>
	text.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

export interface LoginSession {
	/** The sign-in link the CLI printed, or undefined if it printed none. */
	link: Promise<string | undefined>;
	/** Sends the code Anthropic shows when the browser cannot come back. */
	submitCode(code: string): void;
	cancel(): void;
	/** Resolves when the CLI exits: true when it signed in. */
	done: Promise<boolean>;
}

/**
 * Starts `claude auth login --claudeai` for one account and returns at once.
 * On a desktop the CLI opens the browser and receives the result on
 * localhost by itself; elsewhere the user opens the link and the code
 * Anthropic shows goes to the CLI's stdin through submitCode. Gives up after
 * ten minutes.
 */
export function startLogin(configDir: string | undefined): LoginSession {
	const child = spawn(claudeBinary(), ["auth", "login", "--claudeai"], {
		env: accountEnv(configDir),
		stdio: ["pipe", "pipe", "pipe"],
	});
	let out = "";
	let resolveLink: (url: string | undefined) => void = () => {};
	const link = new Promise<string | undefined>((resolve) => (resolveLink = resolve));
	const timer = setTimeout(() => child.kill(), 10 * 60_000);
	const linkTimer = setTimeout(() => resolveLink(undefined), 20_000);
	const onOutput = (chunk: Buffer) => {
		out += chunk.toString();
		const found = /https:\/\/\S+oauth\/authorize\S*/.exec(stripEscapes(out))?.[0];
		if (found) resolveLink(found);
	};
	child.stdout.on("data", onOutput);
	child.stderr.on("data", onOutput);
	const done = new Promise<boolean>((resolve) => {
		const finish = (ok: boolean) => {
			clearTimeout(timer);
			clearTimeout(linkTimer);
			resolveLink(undefined);
			resolve(ok);
		};
		child.on("error", () => finish(false));
		child.on("close", (code) => finish(code === 0));
	});
	return {
		link,
		done,
		submitCode: (code) => {
			if (child.exitCode === null && code.trim()) child.stdin.write(`${code.trim()}\n`);
		},
		cancel: () => {
			if (child.exitCode === null) child.kill();
		},
	};
}
