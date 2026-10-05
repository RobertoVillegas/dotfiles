# Claude accounts in Pi

Pi uses Claude only through `pi-claude-bridge`, which runs the unmodified
Claude Code binary through the Claude Agent SDK. Pi's own `/login` is not used
for Claude: with it, Pi itself would talk to Anthropic with your subscription,
which Anthropic's
[authentication terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)
reserve for Claude Code and its own apps.

The `claude-accounts` extension lets that one route use several subscriptions,
for example a personal Pro and a Team seat from work, all managed from Pi.

## Who does what

| Piece | Does |
| --- | --- |
| Claude Code | Holds each account's login, made through Anthropic's own sign-in. |
| `pi-claude-bridge` | Turns every Pi turn into a Claude Code run through the SDK; reports limits, errors, usage, and which login answered. It only asks which account to use. |
| `claude-accounts` | Answers that question: picks the account, remembers each conversation's account, applies the approval rule, and provides `/claude-account`. |

Each account is a Claude Code config directory under `~/.claude-accounts/`,
created and removed by the extension. `personal` is the existing login in
`~/.claude`. You never type these paths.

## Commands

```text
/claude-account                       # every account: active one (▶), login, email, plan, usage, limits
/claude-account add work Mi trabajo   # create an account and sign in (browser opens)
/claude-account login work            # sign in again, e.g. after a session expired
/claude-account use work              # this conversation from the next turn, and new ones by default
/claude-account next                  # the next logged-in account
/claude-account rename work Trabajo
/claude-account remove work           # sign out and delete it (asks first)
/claude-account refresh               # read each account's 5-hour/7-day usage (no model request)
/claude-account mode least-used       # this Pi process: failover | round-robin | least-used
/claude-account switch auto           # this Pi process: let conversations move on their own
/claude-account reset                 # forget cooldowns and failed logins
```

Account names are short slugs (`work`, `fun`, `dev-2`); the label is what the
status bar shows. Signing in opens Anthropic's login in the browser and Pi
notices when it completes. Over SSH, where the browser cannot reach the devbox,
Pi shows the link and a field to paste the code Anthropic displays. Removing an
account signs it out of Claude Code and deletes its directory; removing
`personal` only takes it off the list and leaves `~/.claude` logged in.

## Switching and limits

The status bar shows the active account and the email the bridge reports for
the last turn, so it shows what actually answered.

**A conversation with history never changes account on its own.** The prompt
cache belongs to the account, so the first turn on another one resends the whole
context. When a conversation's account reaches a limit or its login fails, the
turn stops with the reason, and once Pi settles it asks whether to continue on
another account. Declining leaves the conversation as it is. This also covers a
limit that arrives in the middle of an answer.

A conversation that has not completed a turn yet moves on its own, because it
has nothing to resend, and Pi says so: "Claude Pro trabajo reached its limit
until …; this turn used Personal." With `"switchConversations": "auto"` in
`~/.pi/agent/claude-accounts.json` (or `/claude-account switch auto`) every
conversation moves that way.

Background work follows its conversation's account and rule: compaction
summaries, other background calls, and `pi-subagents` children. A child whose
account runs out fails instead of spending another subscription.

| Mode | A new conversation gets |
| --- | --- |
| `failover` (default) | the preferred account (the last one you chose), or the next available |
| `round-robin` | the next account in turn |
| `least-used` | the account with the lowest reported 5-hour/7-day usage |

A limited account waits until the reset time Claude Code reports. Account-wide
windows (5-hour, weekly) block every model; a family window such as weekly Opus
only blocks that family. A failed login is retried after ten minutes or on
`use`. Usage figures come from Claude Code's own `/usage`; Anthropic answers it
with nothing when it is read too often, so each account is read at most every
ten minutes and the last figures are kept.

## T3 uses the same logins

T3's Claude provider can point at the same directories, so one sign-in serves
Pi and T3. In **Settings → Providers**, add a Claude instance per extra account
with **CLAUDE_CONFIG_DIR** set to `~/.claude-accounts/<name>`
([T3 Code](t3-code.md#accounts)). Pi threads in T3 use this extension as they
do in the terminal.

## Where things live

| File | Written by | In the dotfiles |
| --- | --- | --- |
| `~/.pi/agent/claude-accounts.json` | the dotfiles (mode, switch rule) | yes |
| `~/.pi/agent/extensions/claude-accounts/` | the dotfiles | yes |
| `~/.pi/agent/claude-accounts-state.json` | the extension: accounts, cooldowns, usage, each conversation's account | never |
| `~/.claude-accounts/<name>/`, `~/.claude/` | Claude Code: logins and sessions | never |

Logins are per machine: add the accounts you want on each one. Every Pi window
on a machine shares the state file through locked updates.

If another extension already publishes the bridge's account-router contract,
`claude-accounts` stays inactive and says so at session start. With only
`personal` on the list, Pi behaves exactly as without the extension.

## Why not pi-multi-account

`pi-multi-account` rotates accounts logged in with Pi's `/login`, which is the
direct route above, and imitates Claude Code's request headers. It also
rewrote the `cursor` provider through its own loopback proxy and could switch
models on errors it read as quota limits. The Pi package script removes it and
the `models.json` entries and `provider-failover*` files it left.
