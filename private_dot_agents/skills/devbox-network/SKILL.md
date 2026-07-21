---
name: devbox-network
description: Start, expose, inspect, verify, or stop web servers, APIs, databases, and other development services on a headless devbox through Tailscale. Use when a local development environment must be reachable from the user's remote client, or when checking and cleaning up an existing Tailscale Serve mapping.
---

# Devbox Network

Expose only the service requested by the user and keep it private to the tailnet.

## Workflow

1. Read repository instructions, manifests, lockfiles, and existing start scripts. Reuse the selected package manager and existing Herdr session when available.
2. Determine the local port and protocol. Check it with `lsof -nP -iTCP:<port> -sTCP:LISTEN` on macOS or `ss -lntp` on Linux. Do not stop an unrelated listener.
3. Inspect existing mappings with `tailscale serve status`. Do not overwrite or reset unrelated mappings.
4. Bind the application to `127.0.0.1` by default. For Docker, publish only to loopback, for example `127.0.0.1:5432:5432`.
5. Start the service using the repository's normal command. Verify it locally with an appropriate health check before exposing it.
6. Confirm `tailscale status` succeeds. For HTTP, run `tailscale serve --bg --https=<port> http://127.0.0.1:<port>`. For raw TCP, run `tailscale serve --bg --tcp=<port> tcp://127.0.0.1:<port>`.
7. Run `tailscale serve status` again and report the actual URL or host and port shown by Tailscale. Never invent a tailnet hostname.
8. Report the process, local port, remote address, verification result, and exact command that disables only the mapping created for this task.

## Rules

- Never use Tailscale Funnel or another public tunnel unless explicitly requested.
- Do not bind to `0.0.0.0` unless loopback plus Serve cannot support the application and the user accepts broader LAN exposure.
- Diagnose HMR, websocket, callback, origin, and trusted-host settings before changing the bind address.
- Do not expose a database without its own authentication.
- Do not print credentials or place them in commands, repositories, logs, or URLs.
- Do not remove mappings, containers, or processes belonging to another project.
- Remove only obsolete mappings that the user asked to remove or that this workflow created.
