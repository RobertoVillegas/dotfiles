---
name: poteto-mode
description: Work in pstack's poteto mode (playbooks, principles, verified work). Use only when the user invokes /poteto-mode.
argument-hint: "<goal and how to tell it's done>"
disable-model-invocation: true
---

Read `~/.pi/agent/pstack/HARNESSES.md` in full and follow its Claude Code section, then read `~/.pi/agent/pstack/.agents/skills/poteto-mode/SKILL.md` in full and work under poteto mode for this task. Its bundled skills are the sibling directories of `poteto-mode`; read one from there when poteto mode calls for it. Put the absolute path of that `SKILL.md` in every `poteto-agent` task.

Task: $ARGUMENTS
