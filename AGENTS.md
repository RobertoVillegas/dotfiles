# Dotfiles

chezmoi source for the user's workstation and devboxes. chezmoi reads only `home/` (`.chezmoiroot`). Everything at the root, including this file, is for working on the repository. The repository is public.

## How changes reach machines

- Devboxes run `dotfiles-autoupdate` daily. It fetches the checked-out branch, refuses it unless `verify-commit` passes against `home/dot_config/dotfiles/allowed_signers`, then runs `chezmoi apply --keep-going`. Its log is `~/.local/state/dotfiles/autoupdate.log`.
- The workstation is applied by hand. Its checkout at `~/Developer/dotfiles` is also chezmoi's source, so the branch checked out there is what `chezmoi apply` installs.

## Commits and merges

- Every commit that reaches `main` must be signed with the workstation's key (SSH signing through 1Password). Merge locally with `git merge --no-ff -S <branch>` and push. Never merge with `gh pr merge` or the GitHub button: GitHub signs with its own key, and every devbox stops updating.
- Before pushing to `main`, check `git -c gpg.ssh.allowedSignersFile=home/dot_config/dotfiles/allowed_signers verify-commit HEAD`.
- A bug fix goes straight to `main`. A feature or chore goes through a pull request.
- Merge authority is granted per task. When the request says to merge, land, ship, "do all of it", or run autonomously, merge once the checks pass and report it; do not ask again. Without that grant, leave the PR ready and say so.
- No `Co-Authored-By` or "Generated with" lines.

## Checks

- Run `mise install && lefthook install` once per clone. The pre-commit hook runs gitleaks on the staged changes and `scripts/check-templates` on staged files under `home/`.
- `scripts/check-templates` renders each template for five kinds of machine and shellchecks the scripts as each would run them. Run it with no arguments to check everything.
- Fix a failing check. Do not skip the hook.

## Ownership

- One owner per file. A third-party skill comes from `home/dot_agents/agents.toml.tmpl` (dotagents). A personal or adapted skill lives in `home/dot_agents/skills/`. Never both. pstack is Pi-only and lives in `home/private_dot_pi/private_agent/pstack/`. See `docs/skills.md`.
- Edit the chezmoi source, never the target. `dotagents add` and `chezmoi add` on a managed path write to the target, and the next apply reverts them.
- Files that keep state, credentials, or tokens are listed in `home/.chezmoiignore` so `chezmoi add` refuses them. Keep that list in step with new tools.

## Versions

- Third-party releases wait four hours before install: `minimum_release_age` in mise, pnpm, and bun, and `minimum_release_age = 240` in dotagents. An exact pin skips mise's window, so check a release's age before bumping one by hand.
- First-party agent CLIs are exempt and follow their latest release. The list is `minimum_release_age_excludes` in `home/dot_config/mise/config.toml.tmpl`. Codex and Pi auto-update from `config.local.toml.tmpl`.
- Every other mise tool keeps an exact pin. `home/dot_config/mise/mise.lock` is shared by every profile.
- Third-party skills follow upstream with no `ref`.

## Agent context

`home/dot_config/agents/AGENTS.md.tmpl` is the global context for Claude Code, Codex, OpenCode, and Pi, linked as each one's `CLAUDE.md` or `AGENTS.md`. Sections that only apply to devboxes are gated on `.role`.
