// node --test tests/pi-claude-accounts/router.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
	AccountRouter,
	emptyState,
	NoProfileAvailable,
	type Config,
	type Mode,
} from "../../home/private_dot_pi/agent/extensions/claude-accounts/router.ts";

const OPUS = "claude-opus-4-8";

function setup(mode: Mode = "failover") {
	let now = Date.parse("2026-10-05T12:00:00Z");
	const config: Config = {
		mode,
		profiles: [
			{ id: "personal", label: "Personal" },
			{ id: "work", label: "Work", configDir: "/home/me/.claude-work" },
		],
	};
	const writes: unknown[] = [];
	const router = new AccountRouter(config, emptyState(), () => now, (s) => writes.push(structuredClone(s)));
	return { router, writes, advance: (ms: number) => (now += ms), now: () => now };
}

test("a conversation stays on its account across turns", () => {
	const { router } = setup();
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "personal");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "personal");
});

test("routes carry the config dir only for non-default profiles", () => {
	const { router } = setup();
	assert.deepEqual(router.route("personal"), { profileId: "personal", label: "Personal" });
	assert.equal(router.route("work").configDir, "/home/me/.claude-work");
	assert.deepEqual(router.resolveProfile("work"), { profileId: "work", configDir: "/home/me/.claude-work" });
	assert.equal(router.resolveProfile("gone"), undefined);
});

test("manual use switches this conversation and becomes the default", () => {
	const { router } = setup();
	router.acquire({ modelId: OPUS, sessionId: "s1" });
	router.use("work", "s1");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "work");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s2" }).profileId, "work");
	assert.equal(router.state.preferred, "work");
});

test("next cycles through the configured accounts", () => {
	const { router } = setup();
	router.acquire({ modelId: OPUS, sessionId: "s1" });
	assert.equal(router.next(OPUS, "s1").profileId, "work");
	assert.equal(router.next(OPUS, "s1").profileId, "personal");
});

test("a rate limit fails the conversation over until the reset", () => {
	const { router, advance, now } = setup();
	router.acquire({ modelId: OPUS, sessionId: "s1" });
	const reset = now() + 2 * 3600_000;
	const until = router.recordRateLimit("personal", { status: "rejected", rateLimitType: "five_hour", resetsAt: reset / 1000 }, OPUS);
	assert.equal(until, reset);
	// The bridge retries the same request excluding the failed profile.
	const retry = router.acquire({ modelId: OPUS, sessionId: "s1", excludedProfileIds: ["personal"], forceRerank: true });
	assert.equal(retry.profileId, "work");
	// The next turn stays on the account that worked.
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "work");
	// A new conversation skips the limited account too.
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s2" }).profileId, "work");
	advance(2 * 3600_000 + 1);
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s3" }).profileId, "personal");
});

test("a model-scoped limit leaves other models on the same account", () => {
	const { router } = setup();
	router.recordRateLimit("personal", { rateLimitType: "seven_day_opus" }, OPUS);
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "a" }).profileId, "work");
	assert.equal(router.acquire({ modelId: "claude-sonnet-5-5", sessionId: "b" }).profileId, "personal");
});

test("with every account limited, acquire reports the earliest reset", () => {
	const { router, now } = setup();
	router.recordRateLimit("personal", { resetsAt: new Date(now() + 3600_000).toISOString() }, OPUS);
	router.recordRateLimit("work", { resetsAt: new Date(now() + 600_000).toISOString() }, OPUS);
	assert.throws(
		() => router.acquire({ modelId: OPUS, sessionId: "s1" }),
		(error: unknown) => error instanceof NoProfileAvailable && error.resetAtMs === now() + 600_000,
	);
});

test("an auth failure benches the account until it succeeds again", () => {
	const { router } = setup();
	router.recordFailure("personal", "auth", OPUS);
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "work");
	router.recordSuccess("personal");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s2" }).profileId, "personal");
});

test("transient failures do not bench an account", () => {
	const { router, writes } = setup();
	router.recordFailure("personal", "overloaded", OPUS);
	router.recordFailure("personal", "network", OPUS);
	assert.equal(writes.length, 0);
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "personal");
});

test("round-robin alternates new conversations, not turns", () => {
	const { router } = setup("round-robin");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "personal");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s2" }).profileId, "work");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s3" }).profileId, "personal");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "personal");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s2" }).profileId, "work");
});

test("least-used picks the account with the lowest reported usage", () => {
	const { router } = setup("least-used");
	router.recordUsage("personal", { rate_limits: { five_hour: { utilization: 80, resets_at: null }, seven_day: { utilization: 20 } } });
	router.recordUsage("work", { rate_limits: { five_hour: { utilization: 10 }, seven_day: { utilization: 30 } } });
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "work");
	assert.equal(router.state.usage.personal?.fiveHour?.utilization, 80);
});

test("ephemeral requests without a session are routed but never pinned", () => {
	const { router } = setup();
	assert.equal(router.acquire({ modelId: OPUS }).profileId, "personal");
	assert.equal(router.sessions.size, 0);
});

test("reset clears cooldowns and login flags", () => {
	const { router } = setup();
	router.recordRateLimit("personal", {}, OPUS);
	router.recordFailure("work", "auth", OPUS);
	router.reset();
	assert.equal(router.available("personal", OPUS), true);
	assert.equal(router.available("work", OPUS), true);
});

test("a failed login is retried after a while and on an explicit switch", () => {
	const { router, advance } = setup();
	router.recordFailure("work", "auth", OPUS);
	assert.equal(router.available("work", OPUS), false);
	advance(10 * 60_000);
	assert.equal(router.available("work", OPUS), true);
	router.recordFailure("work", "auth", OPUS);
	router.use("work", "s1");
	assert.equal(router.acquire({ modelId: OPUS, sessionId: "s1" }).profileId, "work");
});
