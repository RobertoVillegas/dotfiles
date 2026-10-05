# Pi accounts

Two extensions decide which account a Pi request uses, and they cover different
providers.

| Provider in Pi | Extension | Accounts |
| --- | --- | --- |
| `pi-claude/*` (Claude) | `@vanillagreen/pi-claude-bridge` | the Claude Code login on the machine |
| `openai-codex*`, `cursor*`, `kimi*`, `qwen*`, `ollama*` | `pi-multi-account` | every slot logged in with Pi's `/login` |

## Claude goes through the bridge

Use Claude in Pi only through `pi-claude-bridge`. It runs the unmodified
Claude Code binary through the Claude Agent SDK, so the subscription is used by
Claude Code itself, signed in through Anthropic's own flow.

Do not log in Anthropic subscription accounts with Pi's `/login`, and do not use
`pi-multi-account`'s `anthropic-account-*` slots. That path sends requests from
Pi itself with the subscription's OAuth token. Anthropic's
[legal and compliance terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)
reserve OAuth for Claude Code and Anthropic's own apps and say Anthropic may
enforce that without notice. An Anthropic API key in Pi is fine; it is billed
per token.

Separate Claude accounts therefore live where Claude Code runs:

- **T3:** one Claude provider instance per account, each with its own
  `CLAUDE_CONFIG_DIR` ([T3 Code](t3-code.md#accounts)).
- **Pi:** the bridge uses the default Claude Code login. It defines an
  account-router contract (`kendex.pi.claude-account-router.v1`) for rotating
  `CLAUDE_CONFIG_DIR` profiles, but no published extension implements it yet,
  and `pi-multi-account` does not.

## pi-multi-account for the other providers

`pi-multi-account` rotates subscription accounts for Codex (ChatGPT), Cursor,
Kimi, Qwen, and Ollama when one hits a quota. The dotfiles install the pinned
package; logging in stays a manual, per-machine step:

```text
/multi-account add codex     # prints the next free slot, e.g. openai-codex-account-2
/login                       # Use a subscription → pick that slot
/multi-account rediscover
/multi-account status
```

Slot names come from Pi; do not copy them into scripts or docs. Pi bridges such
as `pi-claude` and `pi-cursor-sdk` appear under "Other providers" in `status`:
the extension routes around them but does not rotate them.

### Verify

1. `/multi-account status` lists every logged-in slot in the rotation.
2. `/multi-account switch <slot>/<model>` (or `/model`) and send a prompt; the
   footer limits belong to that account.
3. `/multi-account remove <slot>` takes it out of rotation; logging in again
   restores it. The other slots keep working.
4. `/multi-account next` exercises one switch without waiting for a quota error.
5. With `pi-subagents`, start a child with an explicit model. The parent's model
   and account must not change: children run with `PI_SUBAGENT_CHILD=1`, where
   this extension never switches models or queues work.

After re-authenticating a slot, restart older Pi processes: each process keeps
its access token in memory.

## What stays local

| File | Written by | Managed by chezmoi |
| --- | --- | --- |
| `~/.pi/agent/auth.json` | Pi `/login` | never |
| `~/.pi/agent/models.json` | `pi-multi-account` (account aliases) | never |
| `~/.pi/agent/provider-failover*.json` | `pi-multi-account` (config, cooldowns) | never |
| `~/.pi/agent/provider-failover-debug.log` | `pi-multi-account` | never |
| `~/.claude*/` | Claude Code | never |

`models.json` looks like configuration but is generated: versioning it would
overwrite the aliases on every apply. `.chezmoiignore` lists these paths so
`chezmoi add` refuses them.

## Boundaries

- Keep one extension in charge of automatic model selection. In the current set
  only `pi-multi-account` switches models on its own; `pi-subagents` and
  `pi-fabric` call `setModel` only when asked to.
- Pi 1.0 already defaults `retry.provider.maxRetries` to `0`, which is what
  `pi-multi-account` needs to see a quota error before the SDK retries it.
