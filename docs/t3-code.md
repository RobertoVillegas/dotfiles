# T3 Code on the devboxes

T3 Code is the control surface for coding agents. The devbox remains the owner
of the filesystem, Git checkout, terminals, provider authentication, and T3
runtime state. Clients on desktop, web, and mobile connect to that server over
the tailnet.

```text
T3 Desktop / Web / Mobile
            |
        HTTPS / WSS
       over Tailscale
            |
       T3 on devbox
            |
  Codex / Claude / OpenCode
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
| Codex / Claude / OpenCode | coding-agent execution on the devbox |
| Git | branches and history |
| Worktrunk | worktrees |
| Herdr | independent persistent terminal workflows |
| Pi | Herdr/CLI workflows for now |

## What is installed

All development profiles receive the pinned `t3` CLI through mise. Workstations
and macOS devboxes receive the T3 Code cask. A native Linux devbox registers the
official systemd user service after mise is ready. WSL registers the same service
inside Ubuntu while its managed `tailscale` wrapper delegates network operations
to the Windows-owned `tailscale.exe`; it never installs a second `tailscaled`.

Verify the prerequisites in the same non-interactive shell an SSH launcher uses:

```sh
ssh DEVBOX 'sh -lc "command -v node && node --version"'
ssh DEVBOX 'sh -lc "codex --version; claude --version; opencode --version; t3 --version"'
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

`@latest` is appropriate for a fresh manual install, but not for resolving a
client/server mismatch: the server and client work best at the same version.
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

Pi remains outside T3 until it becomes an officially supported provider.

## Validate one server

Run the read-only local audit:

```sh
devbox-doctor
```

Then verify behavior from the clients:

1. Tailscale HTTPS opens from a second tailnet device.
2. Desktop and mobile/web can open the same environment, project, and T3 thread.
3. Codex, Claude Code, and OpenCode start on the devbox using its local auth.
4. The chosen thread uses **Current checkout** and does not create a `t3code/*`
   branch or worktree.
5. Closing a client does not stop the Linux service or macOS server.
6. `ssh DEVBOX` and `herdr` still work independently.

The server owns T3-created threads and provider sessions. This does not imply
that every thread created earlier in a provider's standalone CLI is automatically
imported into T3.

## References

- [T3 Code README and supported providers](https://github.com/pingdotgg/t3code)
- [Remote access, pairing, Tailscale, and SSH launch](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)
- [Linux background service](https://github.com/pingdotgg/t3code/blob/main/docs/user/background-service.md)
- [Keeping client and server versions in sync](https://github.com/pingdotgg/t3code/blob/main/docs/user/updating.md)
- [Microsoft WSL networking and localhost forwarding](https://learn.microsoft.com/en-us/windows/wsl/networking)
- [Tailscale Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve)
