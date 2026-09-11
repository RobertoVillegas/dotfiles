# Agent skills

Chezmoi owns the canonical, reviewed copy of every portable skill in
`~/.agents/skills`. Claude only gets symlinks from `~/.claude/skills`; do not
keep a second copy per agent and do not symlink directly to a checkout of an
upstream repository. A checkout can disappear, and a plain `git pull` would
otherwise change executable agent instructions without review.

## Exact upstream skills

`orchestration` is installed without local modifications. Update it on the
authoring workstation, then import the reviewed result back into the source
state:

```sh
npx skills update orchestration --global
chezmoi re-add ~/.agents/skills/orchestration
chezmoi diff
```

The global `~/.agents/.skill-lock.json` remains machine-local. It contains the
inventory and install timestamps for every skill installed with `npx skills` on
that host, so synchronizing it would delete unrelated registrations on another
machine. On a machine where `orchestration` has not been registered yet, run
`npx skills add stablyai/orca@orchestration --global --yes` once; chezmoi still
owns the reviewed skill contents delivered to every host.

Commit and merge that change before applying it on another machine. The devbox
does not need to contact the skill repository: its normal signed dotfiles update
delivers the reviewed files.

## Adapted upstream skills

The following skills are vendored because they contain small portability or
invocation adaptations:

- `mattpocock/skills`: `diagnosing-bugs`, `grill-me`, `grilling`, `prototype`,
  `wait-what`, and `writing-for-agents` (last reviewed at
  `3cca18b368ae95cdbdebbff572ccafa662551015`).
- `humanlayer/skills`: `show-me` (last reviewed at
  `3c2629142c5d437428269b1b722b08c0b87f574d`).

Do not register these as globally updatable skills: an unattended
`npx skills update --global` would overwrite the local adaptations. To audit a
new upstream revision, install clean copies in a temporary project and compare
them with the chezmoi source:

```sh
audit_dir="$(mktemp -d /tmp/dotfiles-skills-audit.XXXXXX)"
cd "$audit_dir"
npx skills add mattpocock/skills \
  --skill diagnosing-bugs --skill grill-me --skill grilling \
  --skill prototype --skill wait-what --skill writing-for-agents \
  --agent codex --yes
npx skills add humanlayer/skills --skill show-me --agent codex --yes
for skill in diagnosing-bugs grill-me grilling prototype wait-what \
  writing-for-agents show-me; do
  diff -ru "$(chezmoi source-path)/home/dot_agents/skills/$skill" \
    ".agents/skills/$skill"
done
```

Port the wanted upstream changes into `home/dot_agents/skills`, preserving the
local adaptations, then run `chezmoi diff` and `chezmoi apply`. Update the
reviewed commit IDs above in the same change.
