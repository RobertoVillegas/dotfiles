---
name: secret-safe-executor
description: Move secrets through Executor without the values entering your context. Use when an Executor call reads, sets or carries an env var, API key, password or token (Dokploy app env, service config), or when a secret value has already shown up in the conversation.
---

# secret-safe-executor

A secret is **exposed** once its value is in your context: you typed it, a tool printed it, or a response echoed it. Exposure is permanent; the only remedy is rotation. Executor makes exposure easy in two ways:

- The MCP `execute` and `call` tools take code you write, so any value you pass is one you have seen.
- An `approval-required` response echoes the call's whole input. A Dokploy `applicationSaveEnvironment` resends the entire env block, so approving "add one public variable" prints every secret the app already holds.

`executor-pipe` (in `~/.local/bin`) closes both: it splices values from env files into the program and redacts every response before you see it. Run `executor-pipe --help` for usage.

## Steps

1. **Values live in files.** The secret goes in an env file with mode 600, written by the user, by a tool, or by a pipe (`umask 077; … > file`). Done when you have a path and have never printed its contents. Check a value with `executor-pipe fp <file> <NAME>` (length and fingerprint) or `awk -F= '{print $1, length($2)}'`.
2. **Read names, not values.** To inspect stored config, run a program that returns names, lengths or `fp(value)`, never the value. The MCP `execute` tool is fine for this when the program filters before returning.
3. **Write through the pipe.** Any write that carries a secret, or resends a block that holds secrets, goes through `executor-pipe run <program.js> --secrets <file>`, with `__NAME__` where the value belongs. Use the MCP tools only for calls whose full input you could paste in public.
4. **Review the redacted approval.** Every `NAME=value` line prints as `NAME=<redacted>` unless you name it in `--show`, so pass the public names you need to check (`--show S3_BUCKET,EMDASH_STORAGE`). Done when every name you expect is present, every `--show` value is right, and nothing else is legible. Otherwise `executor-pipe resume <id> decline`, fix the program, and run it again. Accept with `executor-pipe resume <id> accept --secrets <file>`.
5. **Verify by fingerprint.** Read the stored value back as `fp(value)` and compare it with `executor-pipe fp <file> <NAME>`. Done when length and fingerprint match.

The first time you write to a new kind of target, rehearse steps 3–5 with a fake secret on a throwaway target (a scratch Dokploy environment, a test key), then delete it.

## Rules

- The fingerprint is a collision-prone checksum for "did the whole value arrive". It identifies nothing, so returning it is safe; a hash of a short password is not. Return length and `fp` only.
- The mask is an allowlist: env-style values are hidden by default because a secret's name says nothing reliable (`DATABASE_URL`, `JWT`, `SENTRY_DSN`). On top, it hides the exact values from `--secrets`, `user:pass@` in URLs, and JSON fields with secret-looking keys. A secret in another shape (a multi-line key, a bare value with no name) is hidden only if it is in a `--secrets` file, so rehearse new formats with a fake value.
- `executor-pipe` runs its redaction self-test before every call and refuses to send if it fails.
- Deploy, restart and other calls with no secret in their input can stay on the MCP tools.

## When a secret is exposed

Stop and tell the user at once, in this order:

1. Decline any pending approval that carries it.
2. Name what leaked (variable names, never values), where it now lives (this conversation, the Executor call log), and which environments use it.
3. Give a rotation list: per secret, its blast radius (does production share it?), what rotating it breaks (an encryption key orphans data encrypted with it), and who does it. Rotate the widest blast radius first.
4. Rotate through `executor-pipe`, with new values generated straight into files (`umask 077; printf 'NAME=%s\n' "$(openssl rand -hex 32)" > file`) so they are never exposed.
