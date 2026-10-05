// Several Claude subscriptions for pi-claude-bridge, all through Claude Code.
//
// Publishes the bridge's account-router contract so every `pi-claude/*`
// request runs the unmodified Claude Code binary under one of your accounts.
// Accounts are created and logged in from Pi with /claude-account; each one
// gets its own Claude Code config directory under ~/.claude-accounts, which
// T3's Claude provider can point at too. A conversation that runs out asks
// before moving. docs/pi-accounts.md in the dotfiles explains the setup.
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { authStatus, login, logout, type AuthStatus } from "./claude-cli.ts";
import {
	AccountRouter,
	emptyState,
	MODES,
	type Config,
	type Mode,
	type ProfileConfig,
	type State,
	type SwitchPolicy,
} from "./router.ts";

const ROUTER_SYMBOL = Symbol.for("kendex.pi.claude-account-router.v1");
const ACCOUNT_HOST_SYMBOL = Symbol.for("kendex.pi.claude-bridge.account-host.v1");
const BILLING_IDENTITY_SYMBOL = Symbol.for("kendex.pi.claude-bridge.billing-identity.v1");
// Keeps one router per process across /reload, so conversation pins survive.
const INSTANCE_SYMBOL = Symbol.for("dotfiles.pi.claude-accounts.v1");
const OWNER = "dotfiles.claude-accounts";
const STATUS_KEY = "claude-account";
// Set by pi-subagents on the processes it launches.
const CHILD_ENV = "PI_SUBAGENT_CHILD";
const PARENT_SESSION_ENV = "PI_SUBAGENT_PARENT_SESSION";
// The account of this process's active conversation, inherited by any child
// process it starts, for children launched without a parent session id.
const PROFILE_ENV = "PI_CLAUDE_ACCOUNTS_PROFILE";
const USAGE_STALE_MS = 30 * 60_000;
/** Anthropic answers the usage endpoint with nothing when it is read too
 *  often, so each account is read at most this often. */
const USAGE_MIN_INTERVAL_MS = 10 * 60_000;
/** The account every machine starts with: the existing Claude Code login. */
const DEFAULT_ACCOUNT: ProfileConfig = { id: "personal", label: "Personal" };

const agentDir = () => {
	const dir = process.env.PI_CODING_AGENT_DIR?.trim();
	return dir ? expandHome(dir) : join(homedir(), ".pi", "agent");
};
const configPath = () => join(agentDir(), "claude-accounts.json");
const statePath = () => join(agentDir(), "claude-accounts-state.json");
/** Claude Code config directories, one per account added from Pi. Outside
 *  Pi's own directory so T3's Claude provider can use the same login. */
const accountsDir = () => join(homedir(), ".claude-accounts");

function expandHome(path: string): string {
	return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

const isInside = (path: string, dir: string) => resolve(path).startsWith(resolve(dir) + sep);

/** Settings from the dotfiles; defaults when the file is missing. */
function loadConfig(): Config {
	let raw: Partial<Config> = {};
	try {
		raw = JSON.parse(readFileSync(configPath(), "utf8")) as Partial<Config>;
	} catch {}
	const mode: Mode = MODES.includes(raw.mode as Mode) ? (raw.mode as Mode) : "failover";
	// Anything but an explicit "auto" asks before moving a conversation.
	const switchConversations: SwitchPolicy = raw.switchConversations === "auto" ? "auto" : "ask";
	return { mode, switchConversations };
}

/** State shared by every Pi process on this machine through one file, so a
 *  limit hit in one window is respected by the others. Changes run as
 *  read-modify-write under a lock directory, so two windows writing at once
 *  cannot drop each other's cooldowns or conversation accounts. */
class StateFile {
	private mtimeMs = 0;
	private readonly path: string;
	private readonly lock: string;
	constructor(path: string) {
		this.path = path;
		this.lock = `${path}.lock`;
	}

	read(): State {
		try {
			this.mtimeMs = statSync(this.path).mtimeMs;
			const saved = JSON.parse(readFileSync(this.path, "utf8")) as Partial<State>;
			return { ...emptyState(), ...saved, accounts: saved.accounts ?? [], sessions: saved.sessions ?? {} };
		} catch {
			return emptyState();
		}
	}

	changed(): boolean {
		try {
			return statSync(this.path).mtimeMs !== this.mtimeMs;
		} catch {
			return false;
		}
	}

	write(state: State): void {
		try {
			mkdirSync(dirname(this.path), { recursive: true });
			const tmp = `${this.path}.${process.pid}.tmp`;
			writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
			renameSync(tmp, this.path);
			this.mtimeMs = statSync(this.path).mtimeMs;
		} catch {
			// Losing a cooldown only costs one failed attempt on another window.
		}
	}

	/** Runs `fn` holding the lock. The bridge calls the router synchronously,
	 *  so waiting is a short spin; a lock older than 5 s is a crashed holder. */
	locked<T>(fn: () => T): T {
		const deadline = Date.now() + 500;
		let held = false;
		while (!held) {
			try {
				mkdirSync(this.lock);
				held = true;
			} catch {
				try {
					if (Date.now() - statSync(this.lock).mtimeMs > 5_000) rmSync(this.lock, { recursive: true, force: true });
				} catch {}
				if (Date.now() > deadline) break; // proceed unlocked rather than stall a request
			}
		}
		try {
			return fn();
		} finally {
			if (held) rmSync(this.lock, { recursive: true, force: true });
		}
	}
}

interface Instance {
	router: AccountRouter;
	file: StateFile;
	configMtimeMs: number;
	/** The conversation this process is showing; other session ids that reach
	 *  the router from this process are its background work. */
	activeSessionId?: string;
	/** Conversations whose last turn ended in an error. */
	failedTurns: Set<string>;
	/** Turns that moved to another account on their own, to report once the
	 *  turn ends: a new conversation may move without asking, never silently. */
	moves: Map<string, { from: string; to: string; reason: string }>;
}

const configMtime = () => {
	try {
		return statSync(configPath()).mtimeMs;
	} catch {
		return 0;
	}
};

/** One router per process. Reloads the settings only when their file
 *  changes, so /claude-account mode and switch hold for the process. */
function instance(): Instance {
	const host = globalThis as Record<symbol, unknown>;
	const existing = host[INSTANCE_SYMBOL] as Instance | undefined;
	const mtime = configMtime();
	if (existing) {
		if (existing.configMtimeMs !== mtime) {
			existing.router.config = loadConfig();
			existing.configMtimeMs = mtime;
		}
		return existing;
	}
	const file = new StateFile(statePath());
	const router = new AccountRouter(loadConfig(), file.read(), Date.now, (state) => file.write(state));
	const created: Instance = { router, file, configMtimeMs: mtime, failedTurns: new Set(), moves: new Map() };
	host[INSTANCE_SYMBOL] = created;
	// First run on this machine: start with the existing Claude Code login.
	transact(created, () => {
		if (router.state.accounts.length > 0) return;
		router.state.accounts = [{ ...DEFAULT_ACCOUNT }];
		file.write(router.state);
	});
	return created;
}

/** Applies one change to the freshest state, under the lock. */
function transact<T>(inst: Instance, fn: () => T): T {
	return inst.file.locked(() => {
		if (inst.file.changed()) inst.router.state = inst.file.read();
		return fn();
	});
}

/** Whose account a request without its own pin should follow, if anyone's. */
function inheritedProfile(inst: Instance, sessionId: string | undefined): string | undefined {
	if (sessionId && inst.router.pin(sessionId)) return undefined;
	if (process.env[CHILD_ENV] === "1") {
		const parent = process.env[PARENT_SESSION_ENV];
		return (parent && inst.router.pin(parent)?.profile) || process.env[PROFILE_ENV] || undefined;
	}
	const active = inst.activeSessionId;
	if (active && sessionId !== active) return inst.router.pin(active)?.profile;
	return undefined;
}

/** The contract object the bridge reads from globalThis. */
function contract(inst: Instance) {
	const { router } = inst;
	return {
		version: 1 as const,
		owner: OWNER,
		acquire: (input: Parameters<AccountRouter["acquire"]>[0]) =>
			transact(inst, () => {
				const before = input.sessionId ? router.pin(input.sessionId)?.profile : undefined;
				const route = router.acquire({ ...input, inherit: inheritedProfile(inst, input.sessionId) });
				if (input.sessionId && before && before !== route.profileId) {
					inst.moves.set(input.sessionId, { from: before, to: route.profileId, reason: router.reason(before, input.modelId) });
				}
				if (input.sessionId && input.sessionId === inst.activeSessionId) process.env[PROFILE_ENV] = route.profileId;
				return route;
			}),
		current: (modelId: string, sessionId?: string) => transact(inst, () => router.current(modelId, sessionId)),
		recordIdentity: (id: string, identity: { email?: string; subscriptionType?: string }) =>
			transact(inst, () => router.recordIdentity(id, identity)),
		recordUsage: (id: string, usage: unknown) => transact(inst, () => router.recordUsage(id, usage)),
		recordRateLimit: (id: string, info: Record<string, unknown> | undefined, modelId: string) =>
			transact(inst, () => router.recordRateLimit(id, info, modelId)),
		recordFailure: (id: string, kind: Parameters<AccountRouter["recordFailure"]>[1], modelId: string) =>
			transact(inst, () => router.recordFailure(id, kind, modelId)),
		recordSuccess: (id: string, sessionId?: string) => transact(inst, () => router.recordSuccess(id, sessionId)),
		resolveProfile: (id: string) => router.resolveProfile(id),
	};
}

/** Publishes the router unless another extension already owns the symbol:
 *  two routers would silently overwrite each other's choices. */
function publish(inst: Instance): string | undefined {
	const host = globalThis as Record<symbol, unknown>;
	const current = host[ROUTER_SYMBOL] as { owner?: string } | undefined;
	if (current && current.owner !== OWNER) {
		return "Another Claude account router is already installed; claude-accounts stays inactive. Remove one of them.";
	}
	host[ROUTER_SYMBOL] = contract(inst);
	return undefined;
}

interface AccountHost {
	version: 1;
	probeProfile(input: { profile: ReturnType<AccountRouter["route"]>; cwd: string; signal?: AbortSignal }): Promise<{
		identity?: { email?: string; subscriptionType?: string };
		usage?: unknown;
	}>;
}

interface UsageRefresh {
	updated: number;
	/** Read too recently; skipped to avoid Anthropic's throttling. */
	skipped: number;
	/** Asked, but Anthropic returned no figures. */
	unavailable: number;
}

/** Reads identity and 5-hour/7-day usage for each logged-in account through
 *  the bridge's local /usage probe, which sends no model request. */
async function refreshUsage(inst: Instance, cwd: string): Promise<UsageRefresh> {
	const result: UsageRefresh = { updated: 0, skipped: 0, unavailable: 0 };
	const host = (globalThis as Record<symbol, unknown>)[ACCOUNT_HOST_SYMBOL] as AccountHost | undefined;
	if (host?.version !== 1) return result;
	const now = Date.now();
	const due = inst.router.state.accounts.filter((p) => {
		if (p.loggedIn === false) return false;
		const checked = inst.router.state.usageCheckedAt?.[p.id] ?? 0;
		if (now - checked < USAGE_MIN_INTERVAL_MS) {
			result.skipped++;
			return false;
		}
		return true;
	});
	transact(inst, () => {
		inst.router.state.usageCheckedAt ??= {};
		for (const p of due) inst.router.state.usageCheckedAt[p.id] = now;
		inst.file.write(inst.router.state);
	});
	await Promise.allSettled(
		due.map(async (p) => {
			const before = inst.router.state.usage[p.id]?.at;
			const probe = await host.probeProfile({ profile: inst.router.route(p.id), cwd });
			transact(inst, () => {
				if (probe.identity?.email) inst.router.recordIdentity(p.id, probe.identity);
				if (probe.usage) inst.router.recordUsage(p.id, probe.usage);
				if (inst.router.state.usage[p.id]?.at !== before) result.updated++;
				else result.unavailable++;
			});
		}),
	);
	return result;
}

/** "12 min ago" for the age of usage figures. */
function age(at: number | undefined): string {
	if (!at) return "";
	const minutes = Math.round((Date.now() - at) / 60_000);
	return minutes < 1 ? " (just now)" : minutes < 120 ? ` (${minutes} min ago)` : ` (${Math.round(minutes / 60)} h ago)`;
}

/** Asks Claude Code whether each account is logged in, and records it. */
async function checkLogins(inst: Instance): Promise<Map<string, AuthStatus | undefined>> {
	const accounts = [...inst.router.state.accounts];
	const statuses = await Promise.all(accounts.map((p) => authStatus(p.configDir)));
	const result = new Map<string, AuthStatus | undefined>();
	transact(inst, () => {
		accounts.forEach((p, i) => {
			const status = statuses[i];
			result.set(p.id, status);
			if (!status || !inst.router.profile(p.id)) return;
			inst.router.setLoggedIn(p.id, status.loggedIn);
			if (status.loggedIn && status.email) inst.router.recordIdentity(p.id, status);
		});
	});
	return result;
}

function describe(router: AccountRouter, modelId: string, sessionId: string | undefined, logins?: Map<string, AuthStatus | undefined>): string {
	const active = router.current(modelId, sessionId)?.profileId;
	const lines = [
		`Claude accounts · mode ${router.config.mode} · conversations ${router.config.switchConversations === "auto" ? "switch automatically" : "ask before switching"}`,
	];
	if (router.state.accounts.length === 0) lines.push("  none yet: /claude-account add <name> [label]");
	for (const p of router.state.accounts) {
		const id = router.state.identity[p.id];
		const usage = router.state.usage[p.id];
		const pct = (w?: { utilization: number | null }) => (w?.utilization == null ? "?" : `${Math.round(w.utilization)}%`);
		const blocked = router.blockedUntil(p.id, modelId);
		const login = logins?.get(p.id);
		const loggedOut = login ? !login.loggedIn : p.loggedIn === false;
		const flags = [
			loggedOut ? `not logged in → /claude-account login ${p.id}` : "",
			!loggedOut && router.needsLogin(p.id) ? `login failed → /claude-account login ${p.id}` : "",
			blocked ? `limited until ${new Date(blocked).toLocaleString()}` : "",
			router.state.preferred === p.id ? "preferred" : "",
		].filter(Boolean);
		const who = loggedOut ? "" : `${id?.email ? ` <${id.email}>` : ""}${id?.subscriptionType ? ` (${id.subscriptionType})` : ""}`;
		lines.push(
			`${p.id === active ? "▶" : " "} ${p.id} — ${p.label ?? p.id}${who}` +
				(loggedOut ? "" : ` · 5h ${pct(usage?.fiveHour)} · 7d ${pct(usage?.sevenDay)}${age(usage?.at)}`) +
				`${flags.length ? ` · ${flags.join(", ")}` : ""}`,
		);
	}
	lines.push(
		"Use: /claude-account list | usage | use <name> | next | add <name> [label] | login <name> | rename <name> <label> | remove <name> | mode <failover|round-robin|least-used> | switch <ask|auto> | reset",
	);
	return lines.join("\n");
}

/** The login the bridge's last request in this session actually ran under. */
function billedEmail(sessionId: string): string | undefined {
	const store = (globalThis as Record<symbol, unknown>)[BILLING_IDENTITY_SYMBOL] as
		| { version?: number; currentLoginEmail?: (sessionId: string | undefined) => string | undefined }
		| undefined;
	return store?.version === 1 ? store.currentLoginEmail?.(sessionId) : undefined;
}

function showStatus(ctx: ExtensionContext, inst: Instance): void {
	if (!ctx.hasUI) return;
	const model = ctx.model;
	if (model?.provider !== "pi-claude") {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	const sessionId = ctx.sessionManager.getSessionId();
	const route = inst.router.current(model.id, sessionId);
	if (!route) {
		ctx.ui.setStatus(STATUS_KEY, "Claude: no account available");
		return;
	}
	// Prefer what the bridge reports for the last turn over our own record.
	const email = billedEmail(sessionId) ?? inst.router.state.identity[route.profileId]?.email;
	ctx.ui.setStatus(STATUS_KEY, `Claude: ${route.label}${email ? ` · ${email}` : ""}`);
}

/** Signs one account in through Claude Code, entirely from Pi. */
async function signIn(inst: Instance, ctx: ExtensionCommandContext, id: string): Promise<boolean> {
	const account = inst.router.profile(id);
	if (!account) throw new Error(`Unknown Claude account "${id}"`);
	const label = account.label ?? id;
	if (account.configDir) mkdirSync(account.configDir, { recursive: true, mode: 0o700 });
	ctx.ui.notify(`Signing in to ${label}: a browser window opens with Anthropic's login.`, "info");
	const ok = await login(account.configDir, {
		onLink: (url, finished) => {
			ctx.ui.notify(`If no browser opened (for example over SSH), open this link, sign in, and paste the code it shows:\n${url}`, "info");
			return ctx.ui.input(`Sign in to ${label}`, "Paste the code here, or just wait if the browser finished", {
				signal: finished,
			});
		},
	});
	const status = await authStatus(account.configDir);
	const loggedIn = Boolean(ok && status?.loggedIn);
	transact(inst, () => {
		inst.router.setLoggedIn(id, loggedIn);
		if (loggedIn && status?.email) inst.router.recordIdentity(id, status);
	});
	ctx.ui.notify(
		loggedIn
			? `${label} is ready${status?.email ? `: ${status.email}${status.subscriptionType ? ` (${status.subscriptionType})` : ""}` : ""}.`
			: `${label} did not log in. Try again with /claude-account login ${id}.`,
		loggedIn ? "info" : "warning",
	);
	return loggedIn;
}

/** Splits `name rest of the label`, dropping quotes around the label. */
function nameAndLabel(rest: string): [string, string | undefined] {
	const [name = "", ...words] = rest.trim().split(/\s+/);
	const label = words.join(" ").replace(/^["'](.*)["']$/, "$1").trim();
	return [name, label || undefined];
}

export default function (pi: ExtensionAPI) {
	const inst = instance();
	const conflict = publish(inst);

	pi.on("session_start", (_event, ctx) => {
		const current = instance();
		if (conflict && ctx.hasUI) ctx.ui.notify(conflict, "warning");
		current.activeSessionId = ctx.sessionManager.getSessionId();
		const known = current.router.pin(current.activeSessionId)?.profile;
		if (known && process.env[CHILD_ENV] !== "1") process.env[PROFILE_ENV] = known;
		// least-used needs figures; fetch them in the background when stale.
		const stale = current.router.state.accounts.some((p) => Date.now() - (current.router.state.usage[p.id]?.at ?? 0) > USAGE_STALE_MS);
		if (current.router.config.mode === "least-used" && stale && process.env[CHILD_ENV] !== "1") {
			void refreshUsage(current, ctx.cwd).catch(() => {});
		}
		showStatus(ctx, current);
	});
	pi.on("model_select", (_event, ctx) => showStatus(ctx, instance()));

	pi.on("agent_end", (event, ctx) => {
		const current = instance();
		if (ctx.model?.provider === "pi-claude") {
			const last = [...event.messages].reverse().find((m) => (m as { role?: string }).role === "assistant") as
				| { stopReason?: string; errorMessage?: string }
				| undefined;
			const sessionId = ctx.sessionManager.getSessionId();
			if (last?.stopReason === "error" || last?.errorMessage) current.failedTurns.add(sessionId);
			else current.failedTurns.delete(sessionId);
			const move = current.moves.get(sessionId);
			current.moves.delete(sessionId);
			if (move && ctx.hasUI) {
				ctx.ui.notify(`${move.reason}; this turn used ${current.router.label(move.to)}.`, "warning");
			}
			const route = current.router.current(ctx.model.id, sessionId);
			const expected = route ? current.router.state.identity[route.profileId]?.email : undefined;
			const actual = billedEmail(sessionId);
			if (ctx.hasUI && route && expected && actual && expected !== actual) {
				ctx.ui.notify(`This turn ran as ${actual}, but ${route.label} is ${expected}. Check /claude-account.`, "warning");
			}
		}
		showStatus(ctx, current);
	});

	// A conversation whose account ran out stops instead of moving. Once Pi has
	// settled, offer the switch; declining leaves the conversation as it is.
	// Covers both a limit before the answer (the router refused the retry) and
	// one in the middle of it (the bridge does not retry those at all).
	pi.on("agent_settled", async (_event, ctx) => {
		const current = instance();
		if (!ctx.hasUI || ctx.model?.provider !== "pi-claude") return;
		const { router } = current;
		const sessionId = ctx.sessionManager.getSessionId();
		const failed = current.failedTurns.delete(sessionId);
		const pending =
			router.takePending(sessionId) ??
			(failed ? transact(current, () => router.stalled(ctx.model!.id, sessionId)) : undefined);
		if (!pending?.to) return;
		const target = router.label(pending.to);
		const ok = await ctx.ui.confirm(
			`Continue on ${target}?`,
			`${pending.reason}. Continuing here resends this conversation's context to ${target} without cache, ` +
				"so the first turn costs more. Decline to keep it as it is and start a new conversation instead.",
		);
		if (!ok) return;
		transact(current, () => router.use(pending.to!, sessionId));
		process.env[PROFILE_ENV] = pending.to;
		showStatus(ctx, current);
		pi.sendUserMessage("Continue where you left off.");
	});

	pi.registerCommand("claude-account", {
		description: "Add, sign in, show or switch the Claude subscriptions pi-claude-bridge uses",
		getArgumentCompletions: (prefix) => {
			const ids = instance().router.state.accounts.map((p) => p.id);
			const verbs = ["list", "usage", "use", "next", "add", "login", "rename", "remove", "refresh", "mode", "switch", "reset"];
			const words = [
				...verbs,
				...["use", "login", "rename", "remove"].flatMap((verb) => ids.map((id) => `${verb} ${id}`)),
				...MODES.map((m) => `mode ${m}`),
				"switch ask",
				"switch auto",
			];
			return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
		},
		handler: async (args, ctx) => {
			const current = instance();
			const { router } = current;
			const sessionId = ctx.sessionManager.getSessionId();
			const modelId = ctx.model?.provider === "pi-claude" ? ctx.model.id : "claude-opus";
			const trimmed = args.trim();
			const verb = trimmed.split(/\s+/)[0] ?? "";
			const rest = trimmed.slice(verb.length).trim();
			const value = rest.split(/\s+/)[0] ?? "";
			try {
				if (verb === "use" && value) {
					const route = transact(current, () => router.use(value, sessionId));
					process.env[PROFILE_ENV] = route.profileId;
					ctx.ui.notify(`Next turn uses ${route.label}.`, "info");
				} else if (verb === "next") {
					const route = transact(current, () => router.next(modelId, sessionId));
					process.env[PROFILE_ENV] = route.profileId;
					ctx.ui.notify(`Next turn uses ${route.label}.`, "info");
				} else if (verb === "add" && value) {
					if (!ctx.hasUI) throw new Error("Adding an account needs the interactive sign-in.");
					const [name, label] = nameAndLabel(rest);
					transact(current, () => router.addAccount(name, label, join(accountsDir(), name)));
					await signIn(current, ctx, name);
				} else if (verb === "login" && value) {
					if (!ctx.hasUI) throw new Error("Signing in needs the interactive login.");
					await signIn(current, ctx, value);
				} else if (verb === "rename" && value) {
					const [name, label] = nameAndLabel(rest);
					if (!label) throw new Error("Usage: /claude-account rename <name> <label>");
					transact(current, () => router.renameAccount(name, label));
					ctx.ui.notify(`${name} is now shown as "${label}".`, "info");
				} else if (verb === "remove" && value) {
					const account = router.profile(value);
					if (!account) throw new Error(`Unknown Claude account "${value}"`);
					const label = account.label ?? value;
					const ownsDir = Boolean(account.configDir && isInside(account.configDir, accountsDir()));
					const what = account.configDir
						? `This signs ${label} out of Claude Code${ownsDir ? " and deletes its saved session" : ""}.`
						: `${label} uses your main Claude Code login (~/.claude); it stays logged in for Claude Code and is only removed from this list.`;
					if (!(await ctx.ui.confirm(`Remove ${label}?`, what))) return;
					if (account.configDir) await logout(account.configDir);
					if (ownsDir) rmSync(account.configDir!, { recursive: true, force: true });
					transact(current, () => router.removeAccount(value));
					ctx.ui.notify(`Removed ${label}.`, "info");
				} else if (verb === "refresh" || verb === "usage") {
					ctx.ui.notify("Reading usage for every account…", "info");
					const usage = await refreshUsage(current, ctx.cwd);
					const logins = await checkLogins(current);
					const notes = [
						usage.unavailable ? `${usage.unavailable} returned no figures right now (Anthropic limits how often usage can be read)` : "",
						usage.skipped ? `${usage.skipped} read less than 10 min ago, kept as is` : "",
					].filter(Boolean);
					ctx.ui.notify(`${describe(router, modelId, sessionId, logins)}${notes.length ? `\n(${notes.join("; ")})` : ""}`, "info");
				} else if (verb === "mode" && MODES.includes(value as Mode)) {
					// For this process; the file in the dotfiles keeps the default.
					router.config.mode = value as Mode;
					ctx.ui.notify(`Account mode: ${value} (until Pi restarts).`, "info");
				} else if (verb === "switch" && (value === "ask" || value === "auto")) {
					router.config.switchConversations = value;
					ctx.ui.notify(
						value === "auto"
							? "Conversations now move to another account on their own (until Pi restarts)."
							: "Conversations now ask before moving to another account.",
						"info",
					);
				} else if (verb === "reset") {
					transact(current, () => router.reset());
					ctx.ui.notify("Cleared cooldowns and login flags.", "info");
				} else {
					if (current.file.changed()) router.state = current.file.read();
					const logins = await checkLogins(current);
					ctx.ui.notify(describe(router, modelId, sessionId, logins), "info");
				}
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
			showStatus(ctx, current);
		},
	});
}
