---
name: devbox-network
description: Run, expose, inspect, verify, or stop development services on a headless devbox. Use Portless for HTTP lifecycle and Tailscale Serve for raw TCP or an incompatible HTTP fallback.
---

# Devbox Network

Treat every exposed process as a lease: one owner, one route, and one teardown.

## Workflow

1. Read repository instructions, manifests, lockfiles, and start scripts. Reuse its package manager and an existing Herdr pane when the current agent is already Herdr-managed.
2. Inspect listeners, `portless list`, and `tailscale serve status`. Resolve ownership before replacing a route or stopping a process.
3. For HTTP, run the real foreground command as `portless run --tailscale -- <command...>`. Use an explicit Portless name only when repository inference is ambiguous. Worktree branch prefixes provide route isolation.
4. Verify the local URL and `PORTLESS_TAILSCALE_URL`, then confirm both in `portless list`. Keep the Portless parent attached to the child so normal exit removes the Tailscale registration.
5. After a crashed Portless session, confirm its owner process is gone before running `portless prune`; verify that only orphaned routes disappeared.
6. For raw TCP or an incompatible HTTP server, bind the backend to loopback, create one exact Tailscale Serve mapping, and pair it with the matching `off` command in the same supervisor or shell trap. Verify both endpoints and preserve unrelated mappings.
7. Report the owning process, worktree, local endpoint, tailnet URL, verification result, and exact teardown. Completion requires the route to disappear when its owner stops.

## Rules

- Never use Tailscale Funnel or another public tunnel unless explicitly requested.
- Do not bind to `0.0.0.0` unless loopback plus Serve cannot support the application and the user accepts broader LAN exposure.
- Keep `PORTLESS_FUNNEL=0`; `--funnel`, `--ngrok`, and `--lan` require explicit user authorization.
- Use `--force` only after proving the existing route belongs to the same project and the user intended replacement.
- Diagnose HMR, websocket, callback, origin, and trusted-host settings before changing the bind address.
- Do not expose a database without its own authentication.
- Do not print credentials or place them in commands, repositories, logs, or URLs.
- Do not remove mappings, containers, or processes belonging to another project.
- Remove only obsolete mappings that this workflow created or whose owner the user explicitly selected.
