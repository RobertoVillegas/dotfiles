# Pi accounts

Pi uses Claude through `pi-claude-bridge`, which runs the unmodified Claude Code
binary through the Claude Agent SDK; T3's Claude provider works the same way.
Several Claude subscriptions, such as a personal Pro and one from work, take
turns through the `claude-accounts` extension below, so every request is still
Claude Code's.

## Several Claude subscriptions

The `claude-accounts` extension
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

## Why not pi-multi-account

`pi-multi-account` was installed briefly and removed. Its Claude support sends
requests from Pi itself with the subscription's OAuth token, imitating Claude
Code's headers, which Anthropic's
[authentication terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)
reserve for Claude Code and its own apps. It did not support the bridge, held
no accounts here, routed the `cursor` provider through its own loopback proxy,
and could switch models on errors it read as quota limits, against the
ask-before-switching rule above. The Pi package script removes it and the
`models.json` entries and `provider-failover*` files it left.

## What stays local

| File | Written by | Managed by chezmoi |
| --- | --- | --- |
| `~/.pi/agent/claude-accounts.json` | the dotfiles | yes |
| `~/.pi/agent/claude-accounts-state.json` | `claude-accounts` (cooldowns, usage, conversation accounts) | never |
| `~/.claude/`, `~/.claude-work/` | Claude Code | never |
| `~/.pi/agent/auth.json` | Pi `/login` | never |

`.chezmoiignore` lists these paths so `chezmoi add` refuses them.
