# MCP servers in Pi

Pi reads its MCP servers from `~/.pi/agent/mcp.json`. Chezmoi manages that
file, so every host gets the same servers. Credentials stay outside the
dotfiles, one file per machine, like the provider keys in
[pi-models.md](pi-models.md).

| File | Holds | In the dotfiles |
| --- | --- | --- |
| `~/.pi/agent/mcp.json` | server URLs and how each reads its key | yes |
| `~/.config/executor/pi.key` | the Executor API key, mode 600 | never |
| `~/.pi/agent/mcp-auth.json` | OAuth tokens from `pi mcp login` | never |

## Executor

[Executor](https://executor.roberto.lol) authenticates with an API key sent as
`Authorization: Bearer`. The header in `mcp.json` is a command that reads
`EXECUTOR_PI_API_KEY` first, then the key file, like the `apiKey` lines in
`models.json`. A server with an `Authorization` header never uses OAuth, so
`pi mcp login executor` is not needed.

Create a key in Executor under **API keys**, then on each host:

```sh
install -d -m 700 ~/.config/executor
pbpaste | tr -d '[:space:]' > ~/.config/executor/pi.key
chmod 600 ~/.config/executor/pi.key
pi mcp list    # executor: connected, N tools
```

Every harness on every host gets its own key, so one can be revoked without
touching the others. Name each key in Executor after its host and harness
(`mac-pi`, `devbox-pi`, `devbox-hermes`):

| Harness | Host | Key lives in | Read through |
| --- | --- | --- | --- |
| Pi | each host | `~/.config/executor/pi.key` | `EXECUTOR_PI_API_KEY`, then the file |
| Hermes | devbox | `EXECUTOR_HERMES_API_KEY` in `~/.hermes/.env` | `${EXECUTOR_HERMES_API_KEY}` in `~/.hermes/config.yaml` |

Hermes resolves `${VAR}` only from its environment and its own `.env`, so its
key lives there rather than in a key file. Hermes is not managed by these
dotfiles. Each harness reads its own variable name, so a Pi started by Hermes
does not pick up Hermes's key.

To store the devbox key for Pi from the Mac clipboard, without it reaching the
shell history or the process list:

```sh
pbpaste | tr -d '[:space:]' | ssh devbox 'install -d -m 700 ~/.config/executor && umask 077 && cat > ~/.config/executor/pi.key'
```

## Reaching the tools

Servers use `codemode` exposure, Pi's default: the model calls their tools from
`codemode` scripts (`mcp__executor`) or loads them with `tool_search`. After
changing `mcp.json`, start a new session or run `/reload`.

pi-fabric was removed because its full-code mode hid Pi's native `codemode`
and `tool_search` behind `fabric_exec` and reached MCP through mcporter
instead of `mcp.json`, so servers configured here were invisible to the model.
