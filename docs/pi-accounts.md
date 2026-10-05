# Pi accounts

Two extensions decide which account a Pi request uses.

| Provider in Pi | Extension | Accounts |
| --- | --- | --- |
| `pi-claude/*` (Claude via the Agent SDK) | `@vanillagreen/pi-claude-bridge` | Claude Code logins |
| `anthropic*`, `openai-codex*`, `cursor*`, `kimi*`, `qwen*`, `ollama*` | `pi-multi-account` | every slot logged in with Pi's `/login` |

## Several Claude subscription accounts in Pi

There are two routes, and they differ in who talks to Anthropic:

| Route | Who sends the request | Rotation today |
| --- | --- | --- |
| `pi-claude-bridge` (`pi-claude/*` models) | the unmodified Claude Code binary, through the Claude Agent SDK | one account: the Claude Code login, unless a router is added |
| `pi-multi-account` (`anthropic`, `anthropic-account-*` slots) | Pi itself, with the subscription's OAuth token | automatic across every `/login` slot |

The SDK route is how T3's Claude provider works too. The direct route uses the
subscription's OAuth token outside Claude Code, while Anthropic's
[authentication terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)
reserve that token for Claude Code and its own apps and allow enforcement
without notice. Choose knowingly.

**SDK route with several accounts.** Give each account its own Claude Code
config directory and log in through Anthropic's flow:

```sh
mkdir -p ~/.claude_personal
CLAUDE_CONFIG_DIR=~/.claude_personal claude auth login
```

The bridge rotates such profiles through its account-router contract
(`kendex.pi.claude-account-router.v1`): a companion extension maps profile ids
to `CLAUDE_CONFIG_DIR`s and receives rate-limit and failure reports. No
published extension implements it yet, and `pi-multi-account` does not.

**Direct route.** In Pi, `/login` → *Use a subscription* → Claude for the first
account (`anthropic`), then `/multi-account add anthropic` and `/login` again
with the slot it prints (for example `anthropic-account-2`). Separate Anthropic
logins cannot be proven to be different people, so check the emails in
`/multi-account accounts refresh`.

## pi-multi-account

`pi-multi-account` rotates subscription accounts for Anthropic, Codex (ChatGPT),
Cursor, Kimi, Qwen, and Ollama when one hits a quota. The dotfiles install the pinned
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
