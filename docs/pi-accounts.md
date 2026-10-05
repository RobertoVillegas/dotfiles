# Pi accounts

`pi-multi-account` lets one Pi installation hold several subscription accounts
(two Claude accounts, for example) and moves to the next one when an account
hits a quota or rate limit. The dotfiles install the pinned package with the
other Pi packages; logging in stays a manual, per-machine step.

## What stays local

| File | Written by | Managed by chezmoi |
| --- | --- | --- |
| `~/.pi/agent/auth.json` | Pi `/login` | never |
| `~/.pi/agent/models.json` | `pi-multi-account` (account aliases) | never |
| `~/.pi/agent/provider-failover.json` | `pi-multi-account` (config) | never |
| `~/.pi/agent/provider-failover-state.json` | `pi-multi-account` (cooldowns, usage) | never |
| `~/.pi/agent/provider-failover-debug.log` | `pi-multi-account` | never |
| `~/.pi/agent/settings.json` | Pi; the install script adds packages | edited in place, not templated |

`models.json` looks like configuration but is generated: versioning it would
overwrite the aliases on every apply.

## Add accounts

In an interactive Pi session on the machine that will use them:

```text
/login                      # Use a subscription → Claude Pro/Max: first account → anthropic
/multi-account add anthropic   # prints the next free slot, e.g. anthropic-account-2
/login                      # Use a subscription → pick that slot, sign in with the other account
/multi-account rediscover
/multi-account status
```

Slot names come from Pi; do not copy them into scripts or docs. `status` must
list both slots in the rotation, and `accounts refresh` shows the email and plan
each provider reports. Separate Anthropic logins cannot be proven to be different
people, so check the reported emails.

## Verify

1. `/multi-account status`: both accounts are in the rotation.
2. `/multi-account switch <slot>/<model>` (or `/model`) and send a prompt; the
   footer limits now belong to that account.
3. `/multi-account remove <slot>` takes it out of rotation; logging in again
   restores it. The other slot keeps working throughout.
4. `/multi-account limits refresh` shows the 5-hour and weekly allowance. Real
   failover only triggers on a quota error; `/multi-account next` exercises the
   switch once without waiting for one.
5. With `pi-subagents`, start a child with an explicit model. The parent's model
   and account must not change: children run with `PI_SUBAGENT_CHILD=1`, and in
   them this extension never switches models or queues work.

After re-authenticating a slot, restart older Pi processes: each process keeps
its access token in memory.

## Boundaries

- Pi's accounts are for Pi, including Pi threads in T3. T3's own Claude provider
  uses Claude Code's login, configured per instance; see
  [T3 Code](t3-code.md#accounts).
- Keep one extension in charge of automatic model selection. In the current set
  only `pi-multi-account` switches models on its own; `pi-subagents` and
  `pi-fabric` call `setModel` only when asked to.
- Pi 1.0 already defaults `retry.provider.maxRetries` to `0`, which is what this
  extension needs to see a quota error before the SDK retries it.
