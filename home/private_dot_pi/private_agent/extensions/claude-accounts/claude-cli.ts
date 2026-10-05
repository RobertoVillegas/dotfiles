// Runs the Claude Code CLI's own login commands for one account. Credentials
// never pass through this code: `claude auth login` completes Anthropic's
// sign-in and stores the session in the account's config directory (and the
// macOS keychain); this only chooses the directory and relays what the CLI
// prints.
import { spawn } from "node:child_process";

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
		const child = spawn("claude", args, { env: accountEnv(configDir), stdio: ["ignore", "pipe", "pipe"] });
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

export interface LoginHooks {
	/** Called once with the sign-in link the CLI printed. Resolves with a code
	 *  the user pasted, or undefined when they did not paste one. The signal
	 *  aborts when the CLI finishes on its own (the browser came back). */
	onLink(url: string, finished: AbortSignal): Promise<string | undefined>;
}

/**
 * `claude auth login --claudeai` for one account. On a desktop the CLI opens
 * the browser and receives the result on localhost by itself; over SSH the
 * user opens the link elsewhere and pastes the code Anthropic shows, which is
 * written to the CLI's stdin. Gives up after ten minutes.
 */
export function login(configDir: string | undefined, hooks: LoginHooks): Promise<boolean> {
	return new Promise((resolve) => {
		const child = spawn("claude", ["auth", "login", "--claudeai"], {
			env: accountEnv(configDir),
			stdio: ["pipe", "pipe", "pipe"],
		});
		const finished = new AbortController();
		let out = "";
		let asked = false;
		const timer = setTimeout(() => child.kill(), 10 * 60_000);
		const onOutput = (chunk: Buffer) => {
			out += chunk.toString();
			const link = /https:\/\/\S+oauth\/authorize\S*/.exec(stripEscapes(out))?.[0];
			if (!link || asked) return;
			asked = true;
			void hooks.onLink(link, finished.signal).then((code) => {
				if (child.exitCode !== null || finished.signal.aborted) return;
				// No code and the CLI still waiting: the user dismissed the prompt.
				if (code?.trim()) child.stdin.write(`${code.trim()}\n`);
				else child.kill();
			});
		};
		child.stdout.on("data", onOutput);
		child.stderr.on("data", onOutput);
		child.on("error", () => {
			clearTimeout(timer);
			finished.abort();
			resolve(false);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			finished.abort();
			resolve(code === 0);
		});
	});
}
