# Subscription hub (CLIProxyAPI)

One always-on Mac at home signs in to the Claude and Codex subscriptions and
serves them to the rest of the tailnet through
[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI). Devboxes keep no
logins of their own: they point Claude Code (and Codex) at the hub. Every
request leaves through one residential connection, the logins are refreshed in
one place, and the hub's usage queue feeds the analytics panels.

The setup follows the one in
[this guide](https://gist.github.com/t3dotgg/59a521d2ee8d70aaf90e280c175072af).

## What you accept

This is not the route [Claude accounts in Pi](pi-accounts.md) takes. There,
Claude Code holds each login and the dotfiles never touch a token. Here the hub
runs its own sign-in with Claude Code's client ID, keeps the OAuth tokens in
`~/.cli-proxy-api`, and sends requests to Anthropic itself. Anthropic's
[authentication terms](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)
say tokens must not be stored or intermediated outside its own sign-in flow.
People run hubs like this without trouble, but an account can be banned for
it. Use it only with accounts you accept that risk for.

The rules that keep the risk low:

1. **Only Claude Code uses the Claude accounts.** Point the real Claude Code
   (directly, or through Pi's `pi-claude-bridge`, T3 Code, or another app that
   runs the Claude Code binary) at the hub. Never point Pi's own `anthropic`
   provider, an OpenAI-compatible tool, or anything else at the Claude models:
   the hub then disguises the request as Claude Code, which is what Anthropic
   detects.
2. **No VPN or exit node on the hub.** The hub must leave through the home
   connection. Mullvad through Tailscale is fine on every other machine and
   never on the hub. The setup script refuses to start the hub while an exit
   node is set, and `devbox-doctor` checks the public network.
3. **Never a VPS.** Sign-ins and traffic from datacenter addresses are what
   Anthropic watches most closely.
4. **Your own usage only.** Never serve other people with the subscriptions.

## Enable it

On a new Mac: `bootstrap --devbox --llm-hub`.

On a Mac devbox that already runs the dotfiles, add the flag to its chezmoi
data and apply. Do not run `chezmoi init` there without the other
`DOTFILES_*` variables: it would reset the machine's role.

```sh
# under [data] in ~/.config/chezmoi/chezmoi.toml
llmHub = true
```

```sh
chezmoi apply
devbox-doctor
```

The apply installs `cliproxyapi` from Homebrew, seeds
`~/.config/cliproxyapi/config.yaml` and `keys.env` (mode 600, never in the
repository), loads `local.cliproxyapi`, and publishes the hub on the tailnet
with `tailscale serve --https=8317`. Port 8317 is in
`~/.config/devbox/serve-keep`, so `devbox-serve-gc` keeps the route while the
hub restarts.

| Piece | Where |
| --- | --- |
| Config (owned by the management panel after the first apply) | `~/.config/cliproxyapi/config.yaml` |
| Access and management keys | `~/.config/cliproxyapi/keys.env` |
| Account tokens | `~/.cli-proxy-api/` |
| Logs | `~/.local/state/cliproxyapi/` and `~/.cli-proxy-api/logs/` |
| Service | `local.cliproxyapi` (LaunchAgent) |

The seeded routing uses one account until its limit (`fill-first`), keeps each
conversation on its account (`session-affinity`), and moves it only for quota
or auth failures.

## Sign in the accounts

On the hub, once per account. Use a private browser window for each one, or
the browser reuses the session of the account you signed in before.

```sh
cliproxyapi -config ~/.config/cliproxyapi/config.yaml -claude-login
cliproxyapi -config ~/.config/cliproxyapi/config.yaml -codex-device-login
```

From another machine over SSH, add `-no-browser` and open a tunnel for the
OAuth callback first: `ssh -L 54545:localhost:54545 <hub>` for Claude (1455
for Codex's browser login). Then open `https://<hub>.<tailnet>.ts.net:8317/management.html`
with the management key from `keys.env` and check that every account appears.

## Point a client at the hub

Claude Code reads these from `settings.json` (`~/.claude/settings.json`, or the
config directory of the profile that should use the hub):

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://<hub>.<tailnet>.ts.net:8317",
    "ANTHROPIC_AUTH_TOKEN": "<access key from keys.env>"
  }
}
```

Check from the client: `curl -s https://<hub>.<tailnet>.ts.net:8317/v1/models -H "Authorization: Bearer <access key>" | head -c 300`
should print a JSON model list. The dotfiles do not configure clients yet.

## Operate it

- `devbox-doctor` checks the listener, the exit node, the public network, the
  signed-in accounts, and the config's mode.
- Restart: `launchctl kickstart -k gui/$(id -u)/local.cliproxyapi`.
- Upgrades: `dotfiles-autoupdate` upgrades Homebrew formulae daily and
  restarts the hub when its version changed.
- Reboots: with FileVault on, the Mac waits at the unlock screen after a
  restart, and neither Tailscale nor the hub runs until someone signs in. For a
  planned restart use `sudo fdesetup authrestart`, which unlocks once.
- Turn it off: set `llmHub = false`, apply, then
  `launchctl bootout gui/$(id -u)/local.cliproxyapi` and
  `tailscale serve --https=8317 off`, and delete
  `~/Library/LaunchAgents/local.cliproxyapi.plist`. The tokens stay in `~/.cli-proxy-api`
  until you delete them.
