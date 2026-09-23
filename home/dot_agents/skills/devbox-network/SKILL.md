---
name: devbox-network
description: Run, expose, inspect, verify, or stop development services on a headless devbox. Use Portless (`dev`) for HTTP and `expose` for raw TCP or an incompatible HTTP server.
---

# Devbox Network

Treat every exposed process as a lease: one owner, one route, and a route that ends when its owner does. A tailnet route with no live service behind it is a leaked lease.

## Workflow

1. Read repository instructions, manifests, lockfiles, and start scripts. Reuse its package manager and an existing Herdr pane when the current agent is already Herdr-managed.
2. Inspect listeners, `dev list`, `tailscale serve status`, and `devbox-serve-gc --check`. Resolve ownership before replacing a route or stopping a process.
3. For HTTP, run the real foreground command as `dev <name> <command...>` (Portless with Tailscale on). Pass a name only when repository inference is ambiguous. Worktree branch prefixes provide route isolation.
4. For raw TCP or an HTTP server Portless cannot front, bind the backend to loopback and run `expose <port> -- <command...>` (or `expose <port>` for a service already running). It holds a foreground Serve session, so the route ends with the process even under SIGKILL. See `expose --help`.
5. Verify the local URL and the tailnet URL, then confirm the route in `dev list` or `tailscale serve status`.
6. Report the owning process, worktree, local endpoint, tailnet URL, verification result, and how the lease ends (Ctrl+C on the owning process). Completion requires the route to disappear when its owner stops.

## Leaked leases

Portless registers persisted (`--bg`) routes, so a session that dies uncleanly leaves its route behind. `devbox-serve-gc` withdraws routes whose loopback backend has stayed down past a grace period; it runs on a timer and whenever `dev` starts. Use `devbox-serve-gc --check` to list them and `devbox-serve-gc` to withdraw them now; see `devbox-serve-gc --help`. It leaves live Portless sessions and the ports in `~/.config/devbox/serve-keep` alone.

## Rules

- Every route is a foreground lease (`dev` or `expose`). Reserve `tailscale serve --bg` for a service shared on purpose, and add its port to `~/.config/devbox/serve-keep` in the dotfiles.
- Keep sharing inside the tailnet. Tailscale Funnel, `--funnel`, `--ngrok`, `--lan`, or another public tunnel require an explicit user request.
- Bind to loopback. Use `0.0.0.0` only when loopback plus Serve cannot support the application and the user accepts broader LAN exposure.
- Use `--force` only after proving the existing route belongs to the same project and the user intended replacement.
- Diagnose HMR, websocket, callback, origin, and trusted-host settings before changing the bind address.
- Expose a database only when it has its own authentication.
- Keep credentials out of commands, repositories, logs, and URLs.
- Touch only the mappings, containers, and processes this workflow created or whose owner the user explicitly selected.
