# T3 Code on the devboxes

T3 Code is the control surface for coding agents and, with Orchestrator V2, the
layer that delegates work across them. The devbox remains the owner of the
filesystem, Git checkout, terminals, provider authentication, and T3 runtime
state. Clients on desktop, web, and mobile connect to that server over the
tailnet.

```text
T3 Desktop / Web / Mobile
            |
        HTTPS / WSS
       over Tailscale
            |
       T3 on devbox
            |
  Claude / Codex / OpenCode / Pi
```

The dotfiles provision the app or CLI and, on native Linux with systemd, register
the official user service once. They never manage `~/.t3`, pairing credentials,
client sessions, provider tokens, projects, threads, branches, or worktrees.

| Component | Owner of |
| --- | --- |
| Dotfiles | machine provisioning and pinned CLI |
| Tailscale | private HTTPS/WSS connectivity |
| T3 server | agent/runtime state, projects, terminals, and T3 threads |
| T3 clients | prompts, approvals, and change review |
| Codex / Claude / OpenCode / Pi | coding-agent execution and their own authentication |
| Git | branches and history |
| Worktrunk | worktrees |
| Herdr | independent persistent terminal workflows |
| Pi packages | Pi extensions, including `pi-subagents` and `pi-multi-account` |

## Version and channel

Orchestrator V2 (the Pi provider, `delegate_task`, and the orchestration MCP
tools) ships only in the `0.0.46` nightlies; stable `0.0.45` does not have it.
These dotfiles therefore track the nightly channel:

| Piece | Where | Channel |
| --- | --- | --- |
| `t3` CLI and Linux service | `npm:t3` in `dot_config/mise/config.toml.tmpl` | exact nightly pin |
| Desktop app (macOS) | `t3-code@nightly` cask in the Brewfile | nightly, self-updating |

A V1 app cannot talk to a V2 server, and the client refuses a server with a
different orchestration protocol. When a client reports a mismatch, bump the
`npm:t3` pin to the version it names and apply; `dotfiles-outdated` compares the
pin against the `nightly` dist-tag. Move back to stable once a stable release
contains V2.

The first V2 start copies `state.sqlite` to `statev2.sqlite` and migrates the
copy. Titles, messages, modes, and branches carry over; live provider sessions,
old checkpoints, diffs, and tool activity do not. See upstream issue
[#14871](https://github.com/pingdotgg/t3code/issues/14871).

### Provider versions

T3 publishes a compatibility table per release. For `0.0.46`:

| Provider | Supported | Pinned here |
| --- | --- | --- |
| Claude Code | `>= 2.1.280` | floor in `run_onchange_after_20-install-runtime-tools` |
| Codex | `>= 0.156` (recommended `>= 0.159`) | mise |
| OpenCode 2 | `>= 2.0.18` | floor in `run_onchange_after_20-install-runtime-tools` |
| Pi | `>= 0.80.5` (recommended `>= 1.0`) | mise |

The Settings → Providers **Update all** button installs providers with a global
`npm install`, outside mise and these pins. Do not use it on machines managed by
these dotfiles; bump the pin instead. If it happens anyway, the next apply removes
any global npm copy of a package mise pins
(`run_after_21-remove-shadowing-npm-globals`).

## What is installed

All development profiles receive the pinned `t3` CLI through mise. Workstations
and macOS devboxes receive the T3 Code nightly cask. A native Linux devbox registers the
official systemd user service after mise is ready. WSL registers the same service
inside Ubuntu while its managed `tailscale` wrapper delegates network operations
to the Windows-owned `tailscale.exe`; it never installs a second `tailscaled`.

Verify the prerequisites in the same non-interactive shell an SSH launcher uses:

```sh
ssh DEVBOX 'sh -lc "command -v node && node --version"'
ssh DEVBOX 'sh -lc "codex --version; claude --version; opencode --version; pi --version; t3 --version"'
ssh DEVBOX 'sh -lc "tailscale status"'
```

T3 currently requires Node `^22.16 || ^23.11 || >=24.10`; the Node pin in these
dotfiles satisfies that range.

## Start the server

### macOS devbox

Open T3 Code and go to **Settings → Connections → This environment → Network
access**. Enable network access, then use **Tailscale HTTPS → Setup**. T3 restarts
its backend and configures Tailscale Serve for a private URL such as:

```text
https://devbox.example-tailnet.ts.net/
```

Add T3 Code as a macOS Login Item when the devbox should normally stay available.
Do not add a custom LaunchAgent: the app owns this lifecycle.

### Linux and WSL devboxes

Bootstrap installs the official user service once. Inspect it with:

```sh
t3 service status
```

On `devbox-gpu`, the existing Windows scheduled task keeps the WSL distro alive,
Ubuntu systemd keeps T3 alive, and Windows Tailscale owns the HTTPS edge. This
route requires mirrored networking so Windows can reach T3 on WSL loopback.
Verify both sides before pairing:

```sh
# Inside WSL
systemctl --user is-active t3code.service
tailscale status

# In Windows PowerShell
curl.exe -I http://127.0.0.1:3773
```

If the Windows loopback check fails, fix or deliberately replace the mirrored
networking path first; do not install `tailscaled` inside WSL as a workaround.
Tailscale Serve changes on Windows may require an elevated terminal. If pairing
from the WSL shell is denied, run it through the existing distro from elevated
PowerShell so the interop-launched `tailscale.exe` inherits that context:

```powershell
wsl.exe -d Ubuntu-26.04 -- zsh -lc "t3 pair --tailscale"
```

Service updates restart the server and can interrupt active agents or terminals.
Let them finish, then use the exact version requested by the client mismatch
warning:

```sh
npx t3@CLIENT_VERSION service update
```

`@latest` installs the stable channel, which has no Orchestrator V2; use the
nightly version from the mise pin or from the client's mismatch notice. In any
case use the exact version for a client/server mismatch: the server and client
must speak the same orchestration protocol.
Removal is explicit and destructive to availability, so it is never automated:

```sh
t3 service uninstall
```

### Temporary headless server

For a test without the background service:

```sh
t3 serve --tailscale-serve
```

Or bind directly to the private Tailnet address:

```sh
t3 serve --host "$(tailscale ip -4)"
```

Do not use Tailscale Funnel or expose the backend directly to the Internet.

## Pair clients

On the server, publish the existing background server through Tailscale HTTPS
and mint a five-minute pairing credential:

```sh
tailscale serve status
t3 pair --tailscale
```

Inspect the existing Serve map before pairing because the default uses HTTPS
port 443. If its root is already owned by another service, preserve that mapping
and choose an unused HTTPS port instead:

```sh
t3 pair --tailscale --tailscale-serve-port 8443
```

Use the printed URL in **T3 Desktop → Settings → Connections → Add environment**,
scan its QR code in T3 Mobile, or open it with `https://app.t3.codes`. The hosted
web app connects directly from the browser to the devbox; it does not proxy the
traffic through T3 Code's servers.

Each client exchanges the one-time credential for its own session. Treat pairing
URLs like passwords and do not put them in shell history, dotfiles, screenshots,
or tickets. Create, inspect, and revoke later access with:

```sh
t3 auth --help
```

## Add projects

Remote project creation is currently CLI-first. Run this on the devbox for each
existing checkout, then reopen or refresh the remote environment:

```sh
t3 project add /absolute/path/to/repository
t3 project add --title PROJECT /absolute/path/to/repository
```

If T3 reports a client/server version mismatch, use the exact-version form
`npx t3@SERVER_VERSION project add ...` instead of letting a different CLI
version touch the same T3 data directory. The Homebrew cask and npm package can
land on different days, so follow the exact version shown by T3 rather than
assuming both release channels have already converged.

Do not add secrets, provider state, or T3 state to the dotfiles repository.

## Checkout and worktree policy

The normal T3 thread uses **Current checkout**. T3 controls the agent session;
it does not own branch or worktree strategy.

```text
Normal:    existing checkout -> T3 Current checkout -> provider thread
Isolated:  Worktrunk worktree -> add/use that checkout -> provider thread
```

Select **New worktree** only when explicitly abandoning this policy. Worktrunk
remains the source of branch/worktree naming and lifecycle. The concurrency rule
is simple: **one writer per checkout**.

Herdr remains an independent terminal-first fallback:

```sh
ssh DEVBOX
herdr
```

## Pi as a provider

Pi is a first-class T3 provider. T3 runs the user's own `pi` (the mise pin,
found on the server's `PATH`) in RPC mode, so Pi keeps its models, extensions,
skills, `AGENTS.md`, and authentication. Nothing Pi-specific is configured in
T3 beyond enabling the provider in **Settings → Providers**.

- Models come from Pi's own catalog, including every account alias created by
  `pi-multi-account`, and the thinking picker shows the levels each model
  supports. Do not copy model IDs into notes or scripts; `pi --list-models`
  answers for the installed Pi.
- Threads use Pi's native session files, so resume, rollback, and forks keep the
  native conversation.
- Blocking extension dialogs appear in the composer. Status lines and widgets do
  not.
- T3's permission modes act through Pi's tool hook. They are not a sandbox: a
  trusted extension's own code still runs with Pi's permissions.

## Two ways to run subagents

```text
Pi directly over SSH                 T3 as parent
        |                                  |
  Pi parent → pi-subagents           delegate_task → Claude / Codex / OpenCode / Pi
  (children are Pi processes)        (children are T3 threads)
```

`pi-subagents` stays the tool for a Pi session opened directly in a terminal:
its children are Pi processes with an explicit model and fallback chain.
`delegate_task` is T3's: each child is a durable T3 thread on any provider and
model, with its own history, and the result returns to the parent. Use T3 when
the children should run on different harnesses, for example a Claude parent with
Pi + GLM and Pi + DeepSeek children.

### delegate_task

Inside a T3 thread, the agent sees the orchestration tools under the `t3-code`
MCP server (`mcp__t3-code__delegate_task` on Pi). Start with
`orchestrator_capabilities`: it lists the provider instances and models that can
run a child right now.

The child receives only the task text and an optional role, never the parent's
history, so the task must be self-contained. Runtime and interaction modes can
stay equal or narrow; a child cannot escalate past its parent.

Rules for reliable delegation on the current nightly:

1. **Prefer `mode: "async"`** and follow up with `task_status`. A
   `mode: "wait"` call longer than about five minutes dies in Node-based MCP
   clients (Pi among them) without returning the `taskId`
   ([#11168](https://github.com/pingdotgg/t3code/issues/11168)).
2. **Always pass a `clientRequestId`**, unique per task and stable across
   retries. Retrying with the same ID returns the same child instead of
   dispatching a second one into the same checkout.
3. **One writer per checkout.** A read-only reviewer can share the checkout with
   one writer. Two writers need separate worktrees (`t3_thread_launch` with
   `workspaceStrategy: "worktree"`, or Worktrunk) or must run in sequence.

### Smoke test

In a T3 project with a test suite, start a Claude thread and ask it to:

1. call `orchestrator_capabilities` and confirm Pi lists the intended GLM and
   DeepSeek models;
2. `delegate_task` a read-only review to Pi + GLM (`role: "review"`,
   `runtimeMode: "approval-required"`, `mode: "async"`, its own
   `clientRequestId`);
3. `delegate_task` the fix to Pi + DeepSeek (`role: "implementation"`,
   `mode: "async"`, another `clientRequestId`), with instructions to run the
   relevant tests and report the modified files;
4. poll both with `task_status` and summarize their results.

Pass when both children appear as separate threads on the requested
provider and model, run at the same time, return their results to the parent,
the reviewer changed no files, the tests pass, and repeating step 2 with the
same `clientRequestId` returns the existing task.

## Accounts

Each harness owns its authentication; T3 does not unify it.

- **Claude in T3:** keep one account in the default `~/.claude` and give each
  additional account its own config directory on the server, then add a Claude
  instance for it in **Settings → Providers** with that **CLAUDE_CONFIG_DIR**:

  ```sh
  mkdir -p ~/.claude_personal
  CLAUDE_CONFIG_DIR=~/.claude_personal claude auth login
  ```

  Those directories hold credentials and stay outside chezmoi. A thread can only
  switch between instances that share a config directory.
- **Pi:** `pi-multi-account` rotates the accounts logged in through Pi's
  `/login`; T3 sees them as Pi models.
- **Codex and OpenCode:** their own login on the devbox.

No credential, `auth.json`, or T3 state belongs in these dotfiles. See
[Pi accounts](pi-accounts.md).

## Known V2 caveats

- [#15221](https://github.com/pingdotgg/t3code/issues/15221): on Pi 1.0, a T3
  turn is rejected with "Agent is already processing" when an extension starts a
  run as the session resumes (for example a pending `pi-loop` iteration). Stop
  the loop in Pi, or start a new thread.
- [#15173](https://github.com/pingdotgg/t3code/issues/15173): a Claude parent
  can be idle-released while it waits on a child; stopping it afterwards fails.
  Another reason to prefer async delegation.
- [#15581](https://github.com/pingdotgg/t3code/issues/15581): OpenCode 2 children
  can stay running without output. Check `task_status` and cancel with
  `task_cancel`.
- Pi's `$` menu does not list project-local `.agents/skills` yet
  ([#15810](https://github.com/pingdotgg/t3code/issues/15810)); global skills
  work.

## Validate one server

Run the read-only local audit:

```sh
devbox-doctor
```

Then verify behavior from the clients:

1. Tailscale HTTPS opens from a second tailnet device.
2. Desktop and mobile/web can open the same environment, project, and T3 thread.
3. Codex, Claude Code, OpenCode, and Pi start on the devbox using its local auth,
   and Pi lists its models and thinking levels.
4. The chosen thread uses **Current checkout** and does not create a `t3code/*`
   branch or worktree.
5. Closing a client does not stop the Linux service or macOS server.
6. `ssh DEVBOX` and `herdr` still work independently.

The server owns T3-created threads and provider sessions. This does not imply
that every thread created earlier in a provider's standalone CLI is automatically
imported into T3.

## References

- [T3 Code README and supported providers](https://github.com/pingdotgg/t3code)
- [Pi provider](https://github.com/pingdotgg/t3code/blob/main/docs/user/providers-pi.md)
- [Orchestrator MCP server and delegate_task](https://github.com/pingdotgg/t3code/blob/main/docs/orchestration-v2/orchestrator-mcp-server.md)
- [Remote access, pairing, Tailscale, and SSH launch](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)
- [Linux background service](https://github.com/pingdotgg/t3code/blob/main/docs/user/background-service.md)
- [Keeping client and server versions in sync](https://github.com/pingdotgg/t3code/blob/main/docs/user/updating.md)
- [Microsoft WSL networking and localhost forwarding](https://learn.microsoft.com/en-us/windows/wsl/networking)
- [Tailscale Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve)
