# Agent skills

Every skill lives once in `~/.agents/skills`. Each skill has exactly one owner:

| Owner | Owns | Where it is declared |
| --- | --- | --- |
| chezmoi | personal and locally adapted skills | `home/dot_agents/skills/<name>/` |
| dotagents | third-party skills used unmodified | `home/dot_agents/agents.toml.tmpl` |

```text
chezmoi apply
  ├── personal skills        → ~/.agents/skills/<name>   (chezmoi)
  ├── ~/.agents/agents.toml  (chezmoi)
  └── run_after_32-install-agent-skills
        ├── dotagents install → ~/.agents/skills/<name>   (dotagents)
        └── ~/.claude/skills/<name> → ~/.agents/skills/<name>   (symlinks)
```

Codex, OpenCode, and Pi read `~/.agents/skills` directly. Claude Code does not,
so the script links every skill there into `~/.claude/skills`. It creates and
removes only symlinks; Claude's own `synced/` and `.trash/` directories are never
touched. That is also why `claude` is not a dotagents target: that target turns
`~/.claude/skills` into a symlink to the shared directory, which would expose
Claude's synced skills to every other agent.

## Inventory

Personal (chezmoi):

| Skill | Why it is personal |
| --- | --- |
| `devbox-network` | written for these devboxes (devbox only) |
| `herdr` | the output of `herdr --skill` for the pinned Herdr binary |
| `grill-me` | `mattpocock/skills`, adapted: model-invocable, links to `grilling` by path |
| `wait-what` | `mattpocock/skills`, adapted: model-invocable, explicit trigger |
| `show-me` | `humanlayer/skills`, adapted: no macOS `open`, model-invocable |
| `pr-description` | personal PR-writing workflow: problem, behavior, evidence, and rollout; optional `show-me` diagrams |

Third-party (dotagents): `diagnosing-bugs`, `grilling`, `prototype`, and
`writing-for-agents` from `mattpocock/skills`; `find-docs` from
`upstash/context7`; `find-skills` from `vercel-labs/skills`; `orchestration` from
`stablyai/orca`; and, on devboxes only, `agent-browser` from
`vercel-labs/agent-browser`.

An adapted copy is a fork, so it stays personal. Declaring it in dotagents would
replace the adaptation with upstream on the next install.

## Versions follow upstream

Third-party sources carry no `ref`. Each install takes the newest upstream
commit that is at least four hours old (`minimum_release_age = 240`), the same
quarantine mise and pnpm use. The daily `dotfiles-autoupdate` is therefore what
moves them forward. Pin a `ref` (tag or commit) only for a skill that must not
move.

`~/.agents/agents.lock` is not managed by chezmoi. dotagents rewrites it on every
install, and its `resolved_commit` is informational: dotagents 3 has no frozen
install mode (`--frozen` is deprecated and installs normally). Versioning it
would make every apply revert what the install just wrote.

The dotagents CLI itself is pinned in the mise inventory.

## Trust

Skills are executable agent instructions. `[trust]` in the manifest allowlists
exact repositories; dotagents rejects any other source before touching the
network. Adding a repository is a reviewed change to that list. Do not use
`allow_all`, and do not add a whole GitHub organization when one repository is
enough.

## Add, update, or remove a skill

Edit the chezmoi source, not the target: `dotagents add` writes to
`~/.agents/agents.toml`, and the next apply would revert it.

```sh
chezmoi edit ~/.agents/agents.toml   # add or remove a [[skills]] entry and its trust rule
chezmoi apply                         # installs, prunes, and relinks for Claude
dotagents list                        # every declared skill should be ✓
```

Removing an entry deletes that skill from `~/.agents/skills`; the script then
removes its dangling Claude link. To make a third-party skill personal (to adapt
it), remove its entry first, apply, then add the adapted copy under
`home/dot_agents/skills` and record why in the table above.

The install is skipped unless `~/.agents/agents.toml` or the dotagents version
changed, or the last successful install is over 20 hours old: dotagents fetches
every source on each install, and `stablyai/orca` moves so often that it
refetches its whole history each time. The stamp lives in
`~/.local/state/dotfiles/agent-skills-installed`. Relinking for Claude runs on
every apply.

To refresh before the next scheduled update, run
`DOTFILES_SKILLS_FORCE=1 chezmoi apply` or `(cd / && dotagents install)`.

## Discovery is not installation

Use `npx skills find` (or the `find-skills` skill) and https://skills.sh/ to
explore the ecosystem. Do not install with `npx skills add --global`: it writes
untracked copies and its own `~/.agents/.skill-lock.json`, which no other machine
reproduces. Declare what you keep in the manifest. Hosts migrated from that flow
may still carry `.skill-lock.json`; it is harmless and can be deleted.

## Diagnose

```sh
dotagents list        # ✓ installed, ✗ missing, ? unlocked
dotagents doctor
devbox-doctor         # includes the same check on devboxes
```

`dotagents sync` adopts unknown local skills into the manifest, so do not run it
on the global scope: the personal skills would gain a second owner.
