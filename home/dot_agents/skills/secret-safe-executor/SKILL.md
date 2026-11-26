---
name: secret-safe-executor
description: Move secrets through Executor without the values entering your context. Use when an Executor call reads, sets or carries an env var, API key, password or token (Dokploy app env, service config), or when a secret value has already shown up in the conversation.
---

# secret-safe-executor

A secret is **exposed** once its value is in your context: you typed it, a tool printed it, or a response echoed it. Exposure is permanent; the only remedy is rotation. Executor makes exposure easy in two ways:

- The MCP `execute` and `call` tools take code you write, so any value you pass is one you have seen.
- An `approval-required` response echoes the call's whole input. A Dokploy `applicationSaveEnvironment` resends the entire env block, so approving "add one public variable" prints every secret the app already holds.

`executor-pipe` (in `~/.local/bin`) closes both. It splices values from env files into the program, and its output is deny by default: every string and number prints as `<redacted:N>` unless you mark it public. Run `executor-pipe --help` for usage.

## Steps

1. **Values live in files.** The secret goes in an env file with mode 600, written by the user, by a tool, or by a pipe (`umask 077; … > file`). Done when you have a path and have never printed its contents. Check a value with `executor-pipe fp <file> <NAME>` (length and fingerprint) or `awk -F= '{print $1, length($2)}'`.
2. **Read names, not values.** To inspect stored config, run a program that returns names, lengths or `fp(value)`, wrapped in `pub()` so they print. Through `executor-pipe` anything left unwrapped stays masked, which makes it the safe default for reads too.
3. **Write through the pipe.** Any write that carries a secret, or resends a block that holds secrets, goes through `executor-pipe run <program.js> --secrets <file>`, with `__NAME__` where the value belongs. Use the MCP tools only for calls whose full input you could paste in public.
4. **Review the redacted approval.** Multi-line env blocks print one line per `UPPER_SNAKE` entry as `NAME=<redacted:N>`, and every other value as `<redacted:N>`, unless you name the entry or key in `--show`, so pass the public ones you need to check (`--show S3_BUCKET,EMDASH_STORAGE,applicationId`). Done when every name you expect is present, every `--show` value is right, and nothing else is legible. Otherwise `executor-pipe resume <id> decline`, fix the program, and run it again. Accept with `executor-pipe resume <id> accept --secrets <file>`.
5. **Verify by fingerprint.** Read the stored value back as `fp(value)` and compare it with `executor-pipe fp <file> <NAME>`. Done when length and fingerprint match.

The first time you write to a new kind of target, rehearse steps 3–5 with a fake secret on a throwaway target (a scratch Dokploy environment, a test key), then delete it.

## Rules

- The fingerprint is a collision-prone checksum for "did the whole value arrive". It identifies nothing, so returning it is safe; a hash of a short password is not. Return length and `fp` only.
- Deny by default is deliberate. Three reviews of looser masks kept finding shapes they missed: `export NAME=`, JSON keyed by variable name, `{name, value}` arrays, names like `DATABASE_URL`, and base64 values whose `=` padding made them look like `NAME=value`. Reveal with `pub()` and `--show`, and keep both to values you would paste in public. `--show KEY` reveals everything under that key, so name leaves, not parents.
- Error messages and non-JSON replies print as `<redacted:N>`. When you need one to debug, rerun with `--show-errors`: it prints the text with only the `--secrets` values masked, so a secret the target already held can show. Use it on calls that do not read stored secrets.
- `executor-pipe` runs its redaction self-test before every call and refuses to send if it fails.
- Deploy, restart and other calls with no secret in their input can stay on the MCP tools.

## When a secret is exposed

Stop and tell the user at once, in this order:

1. Decline any pending approval that carries it.
2. Name what leaked (variable names, never values), where it now lives (this conversation, the Executor call log), and which environments use it.
3. Give a rotation list: per secret, its blast radius (does production share it?), what rotating it breaks (an encryption key orphans data encrypted with it), and who does it. Rotate the widest blast radius first.
4. Rotate through `executor-pipe`, with new values generated straight into files (`umask 077; printf 'NAME=%s\n' "$(openssl rand -hex 32)" > file`) so they are never exposed.
