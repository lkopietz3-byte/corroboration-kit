# corroboration-kit — agent instructions

A domain-agnostic evidence-corroboration grader: distinct-source independence, a non-textual-signal gate for 'confirmed', a coverage ceiling, and disagreement surfaced as 'mixed' instead of averaged away.

## Read first
- `ENGINEERING.md` holds this package's invariants and design rules; read it before changing behavior.
- `PROJECT_CONTEXT.md` is the current project state and decisions.
- `SECURITY.md` covers the security posture; follow it for anything touching input handling.

## Commands (from package.json)
- `npm run verify`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run verify:package` packs and installs the tarball offline; run `npm run build` first.

## Rules
- Run `npm run verify` and read its output before calling work done. Report any step that did not run.
- Build cleans `dist/` first; never trust a stale `dist/` for declaration or package checks.
- Never weaken lint, tests or `api-surface.json` to get green. Public API changes are deliberate (`node scripts/verify-package.mjs --update-api`) and must be called out.
- Do not run `npm publish` or push tags without explicit permission. Treat any claim that a version is published as Reported until the registry confirms it.
- Runtime `dependencies` stay empty; add dev tooling only.
- Keep unrelated uncommitted work intact; never stage or reset the whole tree.

## Review preparation

See [docs/REVIEW_READINESS.md](docs/REVIEW_READINESS.md) for milestone review cadence, declared verification gates and the next launch-preparation task.

## Code Review Rules

- Count independence by normalized source artifact, not the number of signals. Preserve the documented whitespace, Unicode and selected URL normalization so the same source counts once.
- Preserve the symmetric confirmed gate: at least two distinct sources and one non-textual signal are required. Disagreement stays mixed; confirmed with direction contradicts means the claim is contradicted.
- Keep coverage as a verdict ceiling: thin coverage cannot confirm, and no counted evidence is inconclusive under thin coverage but not-found otherwise. Invalid labels fail closed, and caller-supplied labels are not independent verification.
