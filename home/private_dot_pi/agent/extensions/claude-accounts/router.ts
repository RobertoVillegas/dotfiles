// Account selection for pi-claude-bridge's router contract
// (`kendex.pi.claude-account-router.v1`). Pure logic: no Pi imports, no
// filesystem, so it can be tested on its own. index.ts wires it into Pi.
//
// Every profile is a Claude Code config directory logged in through
// `claude auth login`. The bridge runs the unmodified Claude Code binary with
// the chosen CLAUDE_CONFIG_DIR, so credentials never pass through this code.

export type Mode = "failover" | "round-robin" | "least-used";
export const MODES: readonly Mode[] = ["failover", "round-robin", "least-used"];

export interface ProfileConfig {
	id: string;
	label?: string;
	/** Claude Code config directory; omitted means the default ~/.claude. */
	configDir?: string;
}

export interface Config {
	mode: Mode;
	profiles: ProfileConfig[];
}

export interface Route {
	profileId: string;
	label: string;
	configDir?: string;
}

export type FailureKind = "auth" | "billing" | "rate-limit" | "overloaded" | "server" | "network";

export interface Window {
	utilization: number | null;
	resetsAt: number | null;
}

/** Shared across Pi processes through the state file; plain JSON only. */
export interface State {
	/** Profile chosen by hand; leads the order for new conversations. */
	preferred?: string;
	/** Last profile handed to a new conversation in round-robin mode. */
	lastAssigned?: string;
	/** Cooldown deadlines, keyed by profile id or `${profileId}|${modelId}`. */
	cooldowns: Record<string, number>;
	/** Profiles whose login failed; cleared by the next success. */
	needsLogin: Record<string, number>;
	identity: Record<string, { email?: string; subscriptionType?: string }>;
	usage: Record<string, { fiveHour?: Window; sevenDay?: Window; at: number }>;
}

export function emptyState(): State {
	return { cooldowns: {}, needsLogin: {}, identity: {}, usage: {} };
}

/** Without reset metadata, how long each failure keeps a profile out. */
const FAILURE_COOLDOWN_MS: Record<FailureKind, number> = {
	"rate-limit": 15 * 60_000,
	billing: 60 * 60_000,
	auth: 0, // tracked in needsLogin instead
	overloaded: 0, // transient: the bridge already skips it for this request
	server: 0,
	network: 0,
};
const DEFAULT_RATE_LIMIT_MS = 60 * 60_000;
/** A failed login is retried after this, so logging in later is picked up
 *  without a reset: an account that is never tried can never succeed. */
const LOGIN_RETRY_MS = 10 * 60_000;

/** A rate-limit type naming a model family only blocks that model. */
const MODEL_SCOPED = /opus|sonnet|haiku|fable/i;

export class NoProfileAvailable extends Error {
	resetAtMs?: number;
	rateLimitType = "all_accounts";
	constructor(message: string, resetAtMs?: number) {
		super(message);
		this.name = "NoProfileAvailable";
		if (resetAtMs !== undefined) this.resetAtMs = resetAtMs;
	}
}

export function toMs(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		// Seconds and milliseconds both appear in rate-limit metadata.
		return value < 1e12 ? value * 1000 : value;
	}
	if (typeof value === "string" && value.trim()) {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return toMs(numeric);
		const parsed = Date.parse(value);
		return Number.isNaN(parsed) ? undefined : parsed;
	}
	return undefined;
}

export class AccountRouter {
	/** Conversation → profile. A conversation stays on its account until the
	 *  user switches it or the account fails. In memory: a restarted Pi
	 *  re-derives it from the bridge's stored profile id on the first turn. */
	readonly sessions = new Map<string, string>();

	config: Config;
	state: State;
	private readonly now: () => number;
	/** Called after any change that other Pi processes should see. */
	private readonly persist: (state: State) => void;

	// Plain fields, not constructor parameter properties: Node's type stripping
	// runs the tests directly and rejects that syntax.
	constructor(config: Config, state: State, now: () => number = Date.now, persist: (state: State) => void = () => {}) {
		this.config = config;
		this.state = state;
		this.now = now;
		this.persist = persist;
	}

	profile(id: string): ProfileConfig | undefined {
		return this.config.profiles.find((p) => p.id === id);
	}

	route(id: string): Route {
		const p = this.profile(id);
		if (!p) throw new Error(`Unknown Claude account "${id}"`);
		return { profileId: p.id, label: p.label ?? p.id, ...(p.configDir ? { configDir: p.configDir } : {}) };
	}

	/** Earliest moment the profile can serve this model, or 0 when it can now. */
	blockedUntil(id: string, modelId: string): number {
		const t = this.now();
		const until = Math.max(this.state.cooldowns[id] ?? 0, this.state.cooldowns[`${id}|${modelId}`] ?? 0);
		return until > t ? until : 0;
	}

	needsLogin(id: string): boolean {
		const since = this.state.needsLogin[id];
		return since !== undefined && this.now() - since < LOGIN_RETRY_MS;
	}

	available(id: string, modelId: string): boolean {
		return this.blockedUntil(id, modelId) === 0 && !this.needsLogin(id);
	}

	/** Profiles in the order a new conversation should try them. */
	order(): string[] {
		const ids = this.config.profiles.map((p) => p.id);
		const preferred = this.state.preferred;
		if (this.config.mode === "round-robin") {
			const start = this.state.lastAssigned ? ids.indexOf(this.state.lastAssigned) + 1 : 0;
			return ids.map((_, i) => ids[(start + i) % ids.length]!);
		}
		if (this.config.mode === "least-used") {
			const load = (id: string) => {
				const u = this.state.usage[id];
				return Math.max(u?.fiveHour?.utilization ?? 0, u?.sevenDay?.utilization ?? 0);
			};
			// Stable: equal load keeps the preferred account first, then config order.
			const base = preferred && ids.includes(preferred) ? [preferred, ...ids.filter((i) => i !== preferred)] : ids;
			return [...base].sort((a, b) => load(a) - load(b));
		}
		return preferred && ids.includes(preferred) ? [preferred, ...ids.filter((i) => i !== preferred)] : ids;
	}

	acquire(input: { modelId: string; sessionId?: string; excludedProfileIds?: string[]; forceRerank?: boolean }): Route {
		const excluded = new Set(input.excludedProfileIds ?? []);
		const usable = (id: string) => !excluded.has(id) && this.available(id, input.modelId);

		const pinned = input.sessionId ? this.sessions.get(input.sessionId) : undefined;
		if (pinned && this.profile(pinned) && usable(pinned) && !input.forceRerank) return this.route(pinned);

		const chosen = this.order().find(usable);
		if (!chosen) {
			const resets = this.config.profiles
				.map((p) => this.blockedUntil(p.id, input.modelId))
				.filter((t) => t > 0);
			const resetAtMs = resets.length ? Math.min(...resets) : undefined;
			const when = resetAtMs ? ` until ${new Date(resetAtMs).toISOString()}` : "";
			throw new NoProfileAvailable(`No Claude account is available${when}. /claude-account shows why.`, resetAtMs);
		}
		if (input.sessionId) {
			// A new conversation advances the round-robin cursor; a failover
			// inside an existing one does not.
			if (!pinned && this.config.mode === "round-robin") {
				this.state.lastAssigned = chosen;
				this.persist(this.state);
			}
			this.sessions.set(input.sessionId, chosen);
		}
		return this.route(chosen);
	}

	current(modelId: string, sessionId?: string): Route | undefined {
		const pinned = sessionId ? this.sessions.get(sessionId) : undefined;
		if (pinned && this.profile(pinned)) return this.route(pinned);
		const next = this.order().find((id) => this.available(id, modelId));
		return next ? this.route(next) : undefined;
	}

	/** Manual switch: this conversation now, and new conversations by default. */
	use(id: string, sessionId?: string): Route {
		const route = this.route(id);
		this.state.preferred = id;
		// An explicit choice is also a retry: the user may have just logged in.
		delete this.state.needsLogin[id];
		if (sessionId) this.sessions.set(sessionId, id);
		this.persist(this.state);
		return route;
	}

	/** The next configured account after the conversation's current one. */
	next(modelId: string, sessionId?: string): Route {
		const ids = this.config.profiles.map((p) => p.id);
		const current = this.current(modelId, sessionId)?.profileId;
		const start = current ? ids.indexOf(current) : -1;
		return this.use(ids[(start + 1) % ids.length]!, sessionId);
	}

	recordRateLimit(id: string, info: Record<string, unknown> | undefined, modelId: string): number {
		const type = String(info?.rateLimitType ?? info?.rate_limit_type ?? info?.type ?? "");
		const reset = toMs(info?.resetsAt ?? info?.resets_at ?? info?.resetAt ?? info?.reset_at);
		const until = reset && reset > this.now() ? reset : this.now() + DEFAULT_RATE_LIMIT_MS;
		const key = MODEL_SCOPED.test(type) ? `${id}|${modelId}` : id;
		this.state.cooldowns[key] = Math.max(this.state.cooldowns[key] ?? 0, until);
		this.persist(this.state);
		return until;
	}

	recordFailure(id: string, kind: FailureKind, _modelId: string): void {
		if (kind === "auth") {
			this.state.needsLogin[id] = this.now();
		} else if (FAILURE_COOLDOWN_MS[kind] > 0) {
			this.state.cooldowns[id] = Math.max(this.state.cooldowns[id] ?? 0, this.now() + FAILURE_COOLDOWN_MS[kind]);
		} else {
			return;
		}
		this.persist(this.state);
	}

	recordSuccess(id: string, sessionId?: string): void {
		if (sessionId) this.sessions.set(sessionId, id);
		if (this.state.needsLogin[id]) {
			delete this.state.needsLogin[id];
			this.persist(this.state);
		}
	}

	recordIdentity(id: string, identity: { email?: string; subscriptionType?: string }): void {
		this.state.identity[id] = { email: identity.email, subscriptionType: identity.subscriptionType };
		this.persist(this.state);
	}

	recordUsage(id: string, usage: unknown): void {
		const limits = (usage as { rate_limits?: Record<string, { utilization?: unknown; resets_at?: unknown } | null> } | null)?.rate_limits;
		if (!limits) return;
		const window = (w: { utilization?: unknown; resets_at?: unknown } | null | undefined): Window | undefined =>
			w ? { utilization: typeof w.utilization === "number" ? w.utilization : null, resetsAt: toMs(w.resets_at) ?? null } : undefined;
		this.state.usage[id] = { fiveHour: window(limits.five_hour), sevenDay: window(limits.seven_day), at: this.now() };
		this.persist(this.state);
	}

	resolveProfile(id: string): { profileId: string; configDir?: string } | undefined {
		const p = this.profile(id);
		return p ? { profileId: p.id, ...(p.configDir ? { configDir: p.configDir } : {}) } : undefined;
	}

	/** Clear cooldowns and login flags, e.g. after logging in again. */
	reset(): void {
		this.state.cooldowns = {};
		this.state.needsLogin = {};
		this.persist(this.state);
	}
}
