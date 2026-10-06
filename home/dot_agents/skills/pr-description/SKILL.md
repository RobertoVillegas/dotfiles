---
name: pr-description
description: Write or revise pull request titles and descriptions, prepare a PR for publication, or review a draft for scope, evidence, and rollout clarity.
---

# PR descriptions

Write for the person deciding whether to review, approve, or deploy the change. Lead with the user's problem, explain the cause and the behavioral difference, then provide evidence and operational requirements. Scale the structure to the change; a small fix needs a few paragraphs, not every heading below.

## 1. Establish the context

Read the repository's contribution rules, PR template, and relevant agent instructions. Inspect the actual base-to-head diff and verification results. For stacked PRs, identify the base and merge order; separate this PR's own changes from its dependencies.

When the repository or audience is unfamiliar, read a small sample of recent descriptions by the user or relevant maintainers. Adopt their language and level of detail without copying unsupported claims. The skill is in English; the PR uses the language requested by the user or expected by reviewers. Roberto's aptomx PRs normally use natural Spanish.

Before publishing a new PR, search existing issues, PRs (open and closed), and relevant discussions using both the symptom and affected subsystem. Try alternate terms such as the model, error, endpoint, or cache behavior; inspect plausible matches and their diffs. Record the search scope rather than claiming nobody has mentioned the problem anywhere. If work overlaps, explain what is genuinely missing and coordinate with the existing author. Preserve credit and original authorship when taking over work. With no distinct contribution, recommend using the existing PR instead of opening a duplicate.

**Done when:** the diff, target, audience, contribution requirements, dependency order, prior work, and available evidence are understood. Flag inaccessible sources or missing maintainer approval explicitly.

## 2. Draft in reading order

Open with what failed or was missing, why it matters, and what changes for the user. Describe the cause before implementation when known. A hypothesis stays labeled as a hypothesis.

Use only the sections the reviewer needs:

- **Problem / Context:** observable symptom and cause. Avoid making the reader infer the defect from a file list.
- **Changes:** behavior grouped by responsibility or workflow. Mention paths to locate an important boundary, not to narrate datasource → repository → hook wiring already visible in the diff.
- **Compatibility / What stays the same:** contracts, historical data, permissions, failure behavior, and preserved guarantees. Distinguish these from unfinished work.
- **Contracts / Design decisions:** request/response changes, migrations, concurrency rules, and non-obvious tradeoffs. Explain reasons a reviewer might challenge; leave obvious implementation details to code.
- **Rollout / Related:** configuration, migration order, paired API/client PRs, merge order, and production steps. Put deployment-blocking requirements near the opening. Distinguish configured in development from still required in production.
- **Verification / Limits:** evidence for the changed behavior and what remains unchecked.

Give each fact one home. The summary states impact; changes explain behavior; design explains why; verification proves it. Link to an existing PR's explanation instead of copying it into an integration-only PR. Collapse lengthy scenario lists or raw evidence, keeping the verdict and important limitations visible.

### Visuals only when they earn their space

Use a before/after table for behavioral differences. When ordering, ownership, state transitions, or component interactions remain difficult to follow, read the neighboring [`show-me` skill](../show-me/SKILL.md) and choose the smallest useful view. Prefer a focused Mermaid sequence/state diagram or code-shape sketch that renders in the PR. Place it next to the decision it explains and verify it against actual code. An illustrative diagram is not runtime evidence. Follow the repository's attachment policy for screenshots, recordings, or HTML artifacts; keep credentials and personal data out of them.

**Done when:** the opening stands alone, the body adds necessary detail without repetition, and rollout requirements and preserved guarantees are easy to find.

## 3. Ground the verification

State what ran, where it ran when relevant, and what was observed. Use exact commands and meaningful outcomes, not a bare "tests pass" or checklist. Separate automated tests, manual API/browser checks, and build/lint/typecheck results; a build does not prove behavior.

For fixes, include the failing scenario and post-change result when actually observed. Bind measurements to the tested version or commit when revisions matter. If verification used several stacked PRs together, say so rather than attributing the result to this PR alone.

Mark untested platforms, unreconstructed packaged clients, external configuration, and unresolved cases as limits. Separate verified facts, inference, and pending work. A test count describes checks run, not complete coverage. Respect the project's existing test policy; describing a PR is not authorization to add tests, run broad suites, deploy, or create infrastructure.

**Done when:** behavioral claims have traceable evidence or explicit limits, commands/results come from actual receipts, and readers know what those checks do not establish.

## 4. Review and publish

Use a concrete title naming the affected behavior and follow the repository's convention. Prefer "remove stale Pi models after discovery" over "improve model management." Avoid invented issue IDs, exaggerated claims, and review-bot boilerplate.

Read as a reviewer: can you identify the problem, reason for the fix, preserved behavior, rollout requirements, and actual verification? Remove empty headings. Preserve the user's voice instead of producing an agent activity report.

Only create or update a PR when authorized. Verify the target repository/base, head branch, GitHub account, and requested commit identity. A requested commit name/email does not change the GitHub account authoring the PR. Include model/harness disclosure when the repository or user requires it, using actual tools rather than copied attribution.

After publication, read back the title, body, target, and URL. Report publication separately from merge, CI success, deployment, or skill installation.

**Done when:** the description matches the final diff and evidence, authority and identity are confirmed, and the published PR has been checked.
