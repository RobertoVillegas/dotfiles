# pstack outside Cursor

pstack was written for Cursor. This machine runs it in Pi inside T3 Code, and sometimes in Claude Code. Read this file before `poteto-mode` or any pstack skill. Whenever a pstack file names a Cursor feature, use the equivalent for your harness below. Everything else in pstack applies as written, including its Autonomy section.

pstack's skills live in `~/.pi/agent/pstack/.agents/skills/`; `poteto-mode` is `~/.pi/agent/pstack/.agents/skills/poteto-mode/SKILL.md`. The two pstack roles are `~/.pi/agent/pstack/agents/poteto-agent.md` and `~/.pi/agent/pstack/agents/comment-sicko.md`.

## Which harness you are in

Decide once, at the start, from the tools you actually have:

1. **Claude Code.** You have the `Agent` tool, which takes a `subagent_type`. Use [Claude Code](#claude-code), even when Claude Code runs inside T3.
2. **Pi inside T3 Code.** You can reach tools named `mcp__t3-code__*`, such as `mcp__t3-code__delegate_task`: declared to you directly, or listed under `t3-code` in the `mcp_servers` section of your system prompt and reachable through `codemode` or `tool_search`. Use [Pi inside T3 Code](#pi-inside-t3-code).
3. **Pi without T3.** Neither of the above. Pi has no subagents here: do each role yourself, one after another, and say in the report that the roles ran in one context, so their agreement is weaker evidence than pstack assumes.

State the harness you detected in your first reply.

## Pi inside T3 Code

pstack's `Task` tool is T3's `delegate_task`. Each child is a T3 thread the user can open. Running `/poteto-mode` authorizes delegation.

Before the first delegation, call `orchestrator_capabilities` for the provider instances and models that can run a child now, and read the `delegate_task` schema with `describeTool`. Prefer the Pi instance with Claude Opus 5.5, so the child keeps Pi's extensions and pstack.

The child receives only the task text and its role, never your history, so every task is self-contained: goal, repository path, branch, what done means, and what to report back.

| pstack says | Call `delegate_task` with |
|---|---|
| `subagent_type: "poteto-agent"` | a `task` that starts with "Read `~/.pi/agent/pstack/agents/poteto-agent.md` and act as that agent." |
| `subagent_type: "comment-sicko"` | the same with `comment-sicko.md`, `role: "review"` and `runtimeMode: "approval-required"` |
| `subagent_type: "generalPurpose"` | the task alone |
| `readonly: true` | `role: "review"` and `runtimeMode: "approval-required"` |
| `run_in_background: true`, or any task | `mode: "async"`, then `task_status` until it finishes |
| model `claude-opus-5-5-<effort>`, `inherit-parent` or `auto` | `target: { providerInstanceId, model }` for Opus 5.5 from `orchestrator_capabilities` |
| one worktree or directory per attempt | a Worktrunk worktree per attempt, its path in the task |

Rules in T3 0.1.x:

- Always `mode: "async"`. A `mode: "wait"` call longer than about five minutes dies without returning the `taskId`.
- Give every task its own `clientRequestId`, stable across retries, so a retry returns the same child instead of starting a second one.
- One writer per checkout. A read-only reviewer can share the checkout with one writer; two writers need separate worktrees or must run in sequence.
- Cancel a child that stops making progress with `task_cancel`.

## Claude Code

pstack's `Task` tool is Claude Code's `Agent` tool. `poteto-agent` and `comment-sicko` are installed as Claude Code agents in `~/.claude/agents/`.

| pstack says | Call `Agent` with |
|---|---|
| `subagent_type: "poteto-agent"` | `subagent_type: "poteto-agent"` |
| `subagent_type: "comment-sicko"` | `subagent_type: "comment-sicko"` (its tools are read-only) |
| `subagent_type: "generalPurpose"` | `subagent_type: "general-purpose"` |
| `readonly: true` | `subagent_type: "Explore"` for search, `comment-sicko` for review |
| `run_in_background: true` | the default: agents run in the background and report when done |
| model `claude-opus-5-5-<effort>` | `model: "opus"` and `effort: "<effort>"` |
| model `inherit-parent` or `auto` | no `model` |
| one worktree or directory per attempt | `isolation: "worktree"` |

- **`AskQuestion`.** `AskUserQuestion`, with your recommendation first.
- **Todo list.** Claude Code's task tools if they are loaded; otherwise a checklist in your replies.
- **`/loop`.** Claude Code's `loop` skill.
- **Past chats.** Claude Code transcripts are JSONL files in `~/.claude/projects/<working directory with / replaced by ->/`.

## Pi in either case

- **`AskQuestion`.** Ask in the reply with numbered options, and put your recommendation first.
- **Todo list.** Use pi-loop's task tools (`TaskCreate`, `TaskList`, `TaskUpdate`). If they are not loaded, keep the playbook steps as a checklist in your replies.
- **`/loop`.** pi-loop's `/loop` command, with a finish condition that can pass or fail.
- **Past chats.** Pi sessions are JSONL files in `~/.pi/agent/sessions/`, one directory per working directory, named after its path (`--Users-rob-Developer-milumo--`).

## Every harness

Model roles come from `~/.cursor/rules/pstack-models.mdc`, which chezmoi manages for this machine. Every role runs Claude Opus 5.5, so a panel such as `interrogate reviewers` is several independent Opus runs, not different model families. When those runs agree, the agreement is weaker evidence than pstack assumes, and the report must say so.

- **Custom Mode.** None. The mode lasts until the task ends or the user says "new task". The user starts each task with `/poteto-mode`.
- **Cloud subagents, `/in-cloud`, Cursor Projects.** None here. Run parallel work in local worktrees, and long-lived processes in Herdr.
- **`/deslop` from `cursor-team-kit`.** Not installed. Do the same pass by hand before a commit: remove narrating comments, unsupported guards, dead compatibility paths, and unrelated edits.
- **`control-ui`.** Use the `agent-browser` skill where it exists, or the harness's browser tools. **`control-cli`.** Run the CLI directly, or in Herdr when it is interactive.
- **`create-skill`.** Use the `writing-for-agents` skill. Personal skills live in the dotfiles repo under `home/dot_agents/skills/`, not in `~/.cursor/skills/`.
- **Project skills** (`.cursor/skills/verify-<app>/`). Write them to `.agents/skills/verify-<app>/` in the repository.
- **Origin.** Not available. Use `gh`.
- **Cursor's Bugbot and agentic security review.** Not configured. Treat review comments from people and other bots with the same skeptical triage.

## This workspace

The repository's own instructions and the agent context (`~/.pi/agent/AGENTS.md`, `~/.claude/CLAUDE.md`) still apply where they are stricter than pstack:

- Worktrunk (`wt`) creates and removes worktrees. Ask it for a fresh worktree off the right base instead of calling `git worktree` directly, and keep one writer per checkout.
- Merging follows the agent context: authority is granted per task ("merge", "land", "ship", "do all of it", "full autopilot"), as in pstack's Shipping and Autopilot playbooks. Without it, Babysit stops at merge-ready.
- Local services stay private to the host or the tailnet.
