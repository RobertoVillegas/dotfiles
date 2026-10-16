# pstack in Pi

pstack was written for Cursor. This machine runs it in Pi. Read this file before `poteto-mode` or any pstack skill. Whenever a pstack file names a Cursor feature, use the Pi equivalent below. Everything else in pstack applies as written, including its Autonomy section.

## Subagents

pstack's `Task` tool is the `subagent` tool from pi-subagents. A fresh session may expose only `subagents_enable`. Call it once, and `subagent` is available from the next request. Running `/poteto-mode` authorizes delegation.

| pstack says | Call `subagent` with |
|---|---|
| `subagent_type: "poteto-agent"` | `agent: "poteto-agent"` |
| `subagent_type: "comment-sicko"` | `agent: "comment-sicko"` |
| `subagent_type: "generalPurpose"` | `agent: "delegate"` |
| `readonly: true` | a read-only agent: `scout` for exploration, `reviewer` or `oracle` for judgment |
| `run_in_background: true` | `async: true`, then `bg_wait` for the results |
| model `claude-opus-5-5-<effort>` | `model: "pi-claude/claude-opus-5-5:<effort>"` |
| model `inherit-parent` or `auto` | no `model` |
| one worktree or directory per attempt | a workflow with `worktree: true` on each child |

Model roles come from `~/.cursor/rules/pstack-models.mdc`, which chezmoi manages for this machine. Every role runs Claude Opus 5.5, so a panel such as `interrogate reviewers` is several independent Opus runs, not different model families. When those runs agree, the agreement is weaker evidence than pstack assumes, and the report must say so.

## Other Cursor features

- **`AskQuestion`.** Ask in the reply with numbered options, and put your recommendation first.
- **Todo list.** Use pi-loop's task tools (`TaskCreate`, `TaskList`, `TaskUpdate`). If they are not loaded, keep the playbook steps as a checklist in your replies.
- **Custom Mode.** Pi has none. The mode lasts until the task ends or the user says "new task". The user starts each task with `/poteto-mode`.
- **`/loop`.** pi-loop's `/loop` command, with a finish condition that can pass or fail.
- **Cloud subagents, `/in-cloud`, Cursor Projects.** None here. Run parallel work in local worktrees, and long-lived processes in Herdr.
- **Past chats** (`~/.cursor/projects/*/agent-transcripts/`). Pi sessions are JSONL files in `~/.pi/agent/sessions/`, one directory per working directory, named after its path (`--Users-rob-Developer-milumo--`).
- **`/deslop` from `cursor-team-kit`.** Not installed. Do the same pass by hand before a commit: remove narrating comments, unsupported guards, dead compatibility paths, and unrelated edits.
- **`control-ui`.** Use the `agent-browser` skill. **`control-cli`.** Run the CLI directly, or in Herdr when it is interactive.
- **`create-skill`.** Use the `writing-for-agents` skill. Personal skills live in the dotfiles repo under `home/dot_agents/skills/`, not in `~/.cursor/skills/`.
- **Project skills** (`.cursor/skills/verify-<app>/`). Write them to `.agents/skills/verify-<app>/` in the repository.
- **Origin.** Not available. Use `gh`.
- **Cursor's Bugbot and agentic security review.** Not configured. Treat review comments from people and other bots with the same skeptical triage.

## This workspace

The repository's own instructions and `~/.pi/agent/AGENTS.md` still apply where they are stricter than pstack:

- Worktrunk (`wt`) creates and removes worktrees. Ask it for a fresh worktree off the right base instead of calling `git worktree` directly, and keep one writer per checkout.
- Merging follows the agent context: authority is granted per task ("merge", "land", "ship", "do all of it", "full autopilot"), as in pstack's Shipping and Autopilot playbooks. Without it, Babysit stops at merge-ready.
- Local services stay private to the host or the tailnet.
