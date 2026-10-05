// Several Claude subscriptions for pi-claude-bridge, all through Claude Code.
//
// Publishes the bridge's account-router contract so every `pi-claude/*`
// request runs the unmodified Claude Code binary under one of the configured
// CLAUDE_CONFIG_DIRs. Switch by hand with /claude-account, or let the bridge
// fail over when an account hits its limit. docs/pi-accounts.md in the
// dotfiles explains the setup.
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { AccountRouter, emptyState, MODES, type Config, type Mode, type State, type SwitchPolicy } from "./router.ts";

const ROUTER_SYMBOL = Symbol.for("kendex.pi.claude-account-router.v1");
// Keeps one router per process across /reload, so conversation pins survive.
const INSTANCE_SYMBOL = Symbol.for("dotfiles.pi.claude-accounts.v1");
const STATUS_KEY = "claude-account";

const agentDir = () => {
	const dir = process.env.PI_CODING_AGENT_DIR?.trim();
	return dir ? expandHome(dir) : join(homedir(), ".pi", "agent");
};
const configPath = () => join(agentDir(), "claude-accounts.json");
const statePath = () => join(agentDir(), "claude-accounts-state.json");

function expandHome(path: string): string {
	return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(1)) : path;
}

function loadConfig(): Config | undefined {
	if (!existsSync(configPath())) return undefined;
	const raw = JSON.parse(readFileSync(configPath(), "utf8")) as Partial<Config>;
	const mode: Mode = MODES.includes(raw.mode as Mode) ? (raw.mode as Mode) : "failover";
	// Anything but an explicit "auto" asks before moving a conversation.
	const switchConversations: SwitchPolicy = raw.switchConversations === "auto" ? "auto" : "ask";
	const profiles = (raw.profiles ?? [])
		.filter((p) => p && typeof p.id === "string" && p.id.trim())
		.map((p) => {
			const configDir = p.configDir ? expandHome(p.configDir) : undefined;
			// ~/.claude is the bridge's own default; pass it as "no override".
			const isDefault = configDir === join(homedir(), ".claude");
			return { id: p.id, label: p.label, ...(configDir && !isDefault ? { configDir } : {}) };
		});
	return profiles.length > 0 ? { mode, switchConversations, profiles } : undefined;
}

/** State is shared with every other Pi process on this machine through one
 *  file, so a limit hit in one window is respected by the others. */
class StateFile {
	private mtimeMs = 0;
	constructor(private readonly path: string) {}

	read(): State {
		try {
			this.mtimeMs = statSync(this.path).mtimeMs;
			const saved = JSON.parse(readFileSync(this.path, "utf8")) as Partial<State>;
			return { ...emptyState(), ...saved, sessions: saved.sessions ?? {} };
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
}

interface Instance {
	router: AccountRouter;
	file: StateFile;
	configMtimeMs: number;
}

const configMtime = () => {
	try {
		return statSync(configPath()).mtimeMs;
	} catch {
		return 0;
	}
};

/** Reloads the config only when its file changes, so /claude-account mode
 *  and switch hold for the rest of the process. */
function instance(): Instance | undefined {
	const host = globalThis as Record<symbol, unknown>;
	const existing = host[INSTANCE_SYMBOL] as Instance | undefined;
	const mtime = configMtime();
	if (existing && existing.configMtimeMs === mtime) return existing;
	const config = loadConfig();
	if (!config) return existing;
	if (existing) {
		existing.router.config = config;
		existing.configMtimeMs = mtime;
		return existing;
	}
	const file = new StateFile(statePath());
	const router = new AccountRouter(config, file.read(), Date.now, (state) => file.write(state));
	const created = { router, file, configMtimeMs: mtime };
	host[INSTANCE_SYMBOL] = created;
	return created;
}

/** The contract object the bridge reads from globalThis. Every call first
 *  picks up state another Pi process wrote. */
function contract({ router, file }: Instance) {
	const sync = () => {
		if (file.changed()) router.state = file.read();
	};
	return {
		version: 1 as const,
		acquire: (input: Parameters<AccountRouter["acquire"]>[0]) => (sync(), router.acquire(input)),
		current: (modelId: string, sessionId?: string) => (sync(), router.current(modelId, sessionId)),
		recordIdentity: (id: string, identity: { email?: string; subscriptionType?: string }) => router.recordIdentity(id, identity),
		recordUsage: (id: string, usage: unknown) => router.recordUsage(id, usage),
		recordRateLimit: (id: string, info: Record<string, unknown> | undefined, modelId: string) =>
			(sync(), router.recordRateLimit(id, info, modelId)),
		recordFailure: (id: string, kind: Parameters<AccountRouter["recordFailure"]>[1], modelId: string) =>
			(sync(), router.recordFailure(id, kind, modelId)),
		recordSuccess: (id: string, sessionId?: string) => router.recordSuccess(id, sessionId),
		resolveProfile: (id: string) => router.resolveProfile(id),
	};
}

function describe(router: AccountRouter, modelId: string, sessionId?: string): string {
	const active = router.current(modelId, sessionId)?.profileId;
	const lines = [
		`Claude accounts · mode ${router.config.mode} · conversations ${router.config.switchConversations === "auto" ? "switch automatically" : "ask before switching"} · model ${modelId}`,
	];
	for (const p of router.config.profiles) {
		const id = router.state.identity[p.id];
		const usage = router.state.usage[p.id];
		const pct = (w?: { utilization: number | null }) => (w?.utilization == null ? "?" : `${Math.round(w.utilization)}%`);
		const blocked = router.blockedUntil(p.id, modelId);
		const flags = [
			router.needsLogin(p.id) ? "needs login" : "",
			blocked ? `limited until ${new Date(blocked).toLocaleString()}` : "",
			router.state.preferred === p.id ? "preferred" : "",
		].filter(Boolean);
		lines.push(
			`${p.id === active ? "▶" : " "} ${p.id} — ${p.label ?? p.id}` +
				`${id?.email ? ` <${id.email}>` : ""}${id?.subscriptionType ? ` (${id.subscriptionType})` : ""}` +
				` · 5h ${pct(usage?.fiveHour)} · 7d ${pct(usage?.sevenDay)}` +
				`${flags.length ? ` · ${flags.join(", ")}` : ""}` +
				` · ${p.configDir ?? "~/.claude"}`,
		);
	}
	lines.push("Use: /claude-account use <id> | next | mode <failover|round-robin|least-used> | switch <ask|auto> | reset");
	return lines.join("\n");
}

function showStatus(ctx: ExtensionContext, inst: Instance | undefined): void {
	if (!ctx.hasUI) return;
	const model = ctx.model;
	if (!inst || model?.provider !== "pi-claude") {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		return;
	}
	const route = inst.router.current(model.id, ctx.sessionManager.getSessionId());
	ctx.ui.setStatus(STATUS_KEY, route ? `Claude: ${route.label}` : "Claude: no account available");
}

export default function (pi: ExtensionAPI) {
	const inst = instance();
	if (inst) (globalThis as Record<symbol, unknown>)[ROUTER_SYMBOL] = contract(inst);

	pi.on("session_start", (_event, ctx) => showStatus(ctx, instance()));
	pi.on("model_select", (_event, ctx) => showStatus(ctx, instance()));
	pi.on("agent_end", (_event, ctx) => showStatus(ctx, instance()));

	// A conversation whose account ran out stops instead of moving. Once Pi has
	// settled, offer the switch; declining leaves the conversation as it is.
	pi.on("agent_settled", async (_event, ctx) => {
		const router = instance()?.router;
		const sessionId = ctx.sessionManager.getSessionId();
		const pending = router?.takePending(sessionId);
		if (!router || !pending?.to || !ctx.hasUI) return;
		const target = router.label(pending.to);
		const ok = await ctx.ui.confirm(
			`Continue on ${target}?`,
			`${pending.reason}. Continuing here resends this conversation's context to ${target} without cache, ` +
				"so the first turn costs more. Decline to keep it as it is and start a new conversation instead.",
		);
		if (!ok) return;
		router.use(pending.to, sessionId);
		showStatus(ctx, instance());
		pi.sendUserMessage("Continue where you left off.");
	});

	pi.registerCommand("claude-account", {
		description: "Show or switch the Claude subscription pi-claude-bridge uses",
		getArgumentCompletions: (prefix) => {
			const ids = instance()?.router.config.profiles.map((p) => p.id) ?? [];
			const words = [
				"use", "next", "mode", "switch", "reset",
				...ids.map((id) => `use ${id}`), ...MODES.map((m) => `mode ${m}`), "switch ask", "switch auto",
			];
			return words.filter((w) => w.startsWith(prefix)).map((w) => ({ value: w, label: w }));
		},
		handler: async (args, ctx) => {
			const current = instance();
			if (!current) {
				ctx.ui.notify(`No Claude accounts configured: create ${configPath()}`, "warning");
				return;
			}
			const { router } = current;
			if (current.file.changed()) router.state = current.file.read();
			const sessionId = ctx.sessionManager.getSessionId();
			const modelId = ctx.model?.provider === "pi-claude" ? ctx.model.id : "claude-opus";
			const [verb, value] = args.trim().split(/\s+/);
			try {
				if (verb === "use" && value) {
					const route = router.use(value, sessionId);
					ctx.ui.notify(`Next turn uses ${route.label}.`, "info");
				} else if (verb === "next") {
					const route = router.next(modelId, sessionId);
					ctx.ui.notify(`Next turn uses ${route.label}.`, "info");
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
					router.reset();
					ctx.ui.notify("Cleared cooldowns and login flags.", "info");
				} else {
					ctx.ui.notify(describe(router, modelId, sessionId), "info");
				}
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
			showStatus(ctx, current);
		},
	});
}
