# Pi accounts

Two mechanisms decide which account a Pi request uses.

| Provider in Pi | Extension | Accounts |
| --- | --- | --- |
| `pi-claude/*` (Claude via the Agent SDK) | `pi-claude-bridge` + `claude-accounts` | Claude Code config directories |
| `anthropic*`, `openai-codex*`, `cursor*`, `kimi*`, `qwen*`, `ollama*` | `pi-multi-account` | every slot logged in with Pi's `/login` |

## Several Claude subscription accounts in Pi

There are two routes, and they differ in who talks to Anthropic:

| Route | Who sends the request | Switching |
| --- | --- | --- |
| `pi-claude-bridge` + `claude-accounts` (`pi-claude/*` models) | the unmodified Claude Code binary, through the Claude Agent SDK | `/claude-account`, and automatic on limits |
| `pi-multi-account` (`anthropic`, `anthropic-account-*` slots) | Pi itself, with the subscription's OAuth token | `/multi-account`, and automatic on limits |

The SDK route is how T3's Claude provider works too. The direct route uses the
subscription's OAuth token outside Claude Code, while Anthropic's
[authentication terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)
reserve that token for Claude Code and its own apps and allow enforcement
without notice. Choose knowingly.

**SDK route with several accounts.** The `claude-accounts` extension
(`~/.pi/agent/extensions/claude-accounts/`) implements the bridge's
account-router contract (`kendex.pi.claude-account-router.v1`). Each account is
a Claude Code config directory, declared in `~/.pi/agent/claude-accounts.json`:

| Id | Directory |
| --- | --- |
| `personal` | `~/.claude` |
| `work` | `~/.claude-work` |

Log each one in through Anthropic's own flow, once per machine:

```sh
CLAUDE_CONFIG_DIR=~/.claude-work claude auth login
```

Then, in any Pi conversation on a `pi-claude/*` model:

```text
/claude-account              # accounts, identity, usage, cooldowns
/claude-account use work     # this conversation from the next turn, and new ones by default
/claude-account next         # the other account
/claude-account mode least-used   # for this Pi process; the file keeps the default
/claude-account switch auto  # let conversations move on their own (this process)
/claude-account reset        # forget cooldowns and failed logins
```

The status bar shows the active account. A switch mid-conversation is safe: the
bridge rebuilds the Claude Code session from Pi's history under the new account.
It is not free, though: the prompt cache belongs to the account, so the first
turn after a switch pays for the whole context again. That is why a conversation
stays on its account until you approve a switch, and why `round-robin`
alternates conversations, not turns.

Log in on the machine that runs Pi, from its usual network. Logins and traffic
from datacenter IPs or several machines at once are what draws scrutiny, so the
devboxes at home are fine and a cloud VPS is not.

| Mode | A new conversation gets |
| --- | --- |
| `failover` (default) | the preferred account, or the next available one |
| `round-robin` | the next account in turn |
| `least-used` | the lowest 5-hour/7-day usage Claude Code reported |

**A conversation never changes account on its own.** When its account reaches a
limit or its login fails, the turn stops with the reason, and once Pi settles it
asks whether to continue on the other account. Declining leaves the conversation
as it is, so you can start a new one instead; `/claude-account use <id>` makes the
same switch later. Two cases move without asking: a conversation that has not
completed a turn yet (it has no history to resend), and every conversation when
`"switchConversations": "auto"` is set in `claude-accounts.json` or with
`/claude-account switch auto`. In `auto`, the bridge retries the failed turn on
the other account straight away.

Pi's background calls without a conversation, such as compaction summaries,
are routed like new conversations.

A limited account stays out until the reset time Claude Code reports (one hour
without one). A limit on one model family, such as weekly Opus, only blocks that
model. A failed login is retried after ten minutes or on `use`. Cooldowns live in
`~/.pi/agent/claude-accounts-state.json`, shared by every Pi window on the
machine. Usage figures only appear once Claude Code reports them for an account,
so `least-used` treats an account without figures as unused.

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
| `~/.pi/agent/claude-accounts-state.json` | `claude-accounts` (cooldowns, usage) | never |

`models.json` looks like configuration but is generated: versioning it would
overwrite the aliases on every apply. `.chezmoiignore` lists these paths so
`chezmoi add` refuses them.

## Boundaries

- Keep one extension in charge of automatic model selection. In the current set
  only `pi-multi-account` switches models on its own; `pi-subagents` and
  `pi-fabric` call `setModel` only when asked to.
- Pi 1.0 already defaults `retry.provider.maxRetries` to `0`, which is what
  `pi-multi-account` needs to see a quota error before the SDK retries it.
