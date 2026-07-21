---
name: devbox-network
description: Start, expose, inspect, verify, or stop web servers, APIs, databases, and other development services on a headless devbox through Tailscale. Use when a local development environment must be reachable from the user's remote client, or when checking and cleaning up an existing Tailscale Serve mapping.
---

# Devbox Network

Expose only the service requested by the user and keep it private to the tailnet.

## Workflow

1. Read repository instructions, manifests, lockfiles, and existing start scripts. Reuse the selected package manager and existing Herdr session when available.
2. Determine the local port and protocol. Check it with `lsof -nP -iTCP:<port> -sTCP:LISTEN` on macOS or `ss -lntp` on Linux. Do not stop an unrelated listener.
3. Inspect existing routes with `portless list` when Portless is available and mappings with `tailscale serve status`. Do not overwrite or reset unrelated routes.
4. For a compatible HTTP development server, prefer running the repository's normal development command through `portless run --tailscale`. Portless should infer the project name, select an available port, preserve worktree-specific names, and register the private Tailscale mapping. Do not add Portless configuration to the repository unless the user requests it.
5. Verify the service locally, then run `portless list` and `tailscale serve status`. Report both the local named URL and the actual tailnet URL emitted by the tools. Never invent a hostname.
6. If Portless is unavailable or incompatible, bind the application to `127.0.0.1`, verify it locally, and expose HTTP with `tailscale serve --bg --https=<port> http://127.0.0.1:<port>`.
7. For Docker, publish only to loopback, for example `127.0.0.1:5432:5432`. For raw TCP, verify locally and run `tailscale serve --bg --tcp=<port> tcp://127.0.0.1:<port>`.
8. Report the process, local port, remote address, verification result, and the exact project-scoped command or process action that stops what this task created.

## Rules

- Never use Tailscale Funnel or another public tunnel unless explicitly requested.
- Do not enable Portless LAN mode; use its explicit Tailscale integration.
- Do not bind to `0.0.0.0` unless loopback plus Serve cannot support the application and the user accepts broader LAN exposure.
- Diagnose HMR, websocket, callback, origin, and trusted-host settings before changing the bind address.
- Do not expose a database without its own authentication.
- Do not print credentials or place them in commands, repositories, logs, or URLs.
- Do not remove mappings, containers, or processes belonging to another project.
- Remove only obsolete mappings that the user asked to remove or that this workflow created.
