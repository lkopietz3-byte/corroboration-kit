# Engineering contract

## Invariants (the promises the code is tested against)

1. Independence is counted by distinct source **artifact**, never by signal
   count. Two signals sharing one (normalized) `source` count once.
2. `'confirmed'` is unreachable from `'textual'` signals alone, symmetrically
   for `supports` and `contradicts`; it requires 2+ distinct sources and at
   least one non-`'textual'` kind.
3. Disagreement (both `supports` and `contradicts` non-empty) is `'mixed'`,
   never averaged into a middle verdict.
4. `'thin'` coverage caps the verdict below `'confirmed'`, unconditionally.
5. A null result (no supporting and no contradicting source counted) is
   `'not-found'` only under non-thin coverage; under `'thin'` it is
   `'inconclusive'`.
6. `corroborate` fails closed: any input the type system would reject (bad
   `kind`/`vote`/`coverage`, a non-string source, a source that is empty or
   shows nothing, a non-object element, a hole in the array) throws
   `TypeError` rather than being silently mis-graded. `detail` is free-form
   and is never validated or graded.
7. `coverageOf` treats an unusable count (zero, `NaN`, infinite, or not a
   number) as `'thin'`, and throws `RangeError` for an impossible one (a
   negative count, or `sampledUnits` above `totalUnits`). It never throws
   `TypeError`.
8. Grading is a pure function of the signal set: order-independent, and
   neither the input array/objects nor the returned `signals` alias them.
9. Input is read once. The signals array (length once, each index once) and
   each signal's fields (each once, inherited and getter-backed fields
   included) are copied into one snapshot; validation, grading and the
   returned `signals` all use that snapshot, never the caller's objects.
10. `direction` (`'supports' | 'contradicts' | 'mixed' | 'none'`) is derived
    only from the two counted-source totals and never changes the verdict. A
    `'confirmed'` verdict with direction `'contradicts'` means the evidence
    confirms the claim is false.
11. Error messages never call into caller values (no `toString`, `toJSON` or
    getter) and escape control and bidi characters, so building one cannot
    throw and cannot forge log structure. The label helpers accept only
    primitive strings.

## Setup and verification

```bash
npm ci                # install pinned dependencies
npm run verify         # lint + typecheck + test + build + verify:package
npm audit --include=dev
```

`npm run verify:package` packs the real tarball, installs it into a scratch
project, imports it by name, runs `scripts/consumer-probe.mjs` against the
real API, type-checks `scripts/consumer-probe.mts` under strict NodeNext,
and diffs the exported names against `api-surface.json` so an API change is
always a deliberate, reviewed diff (`--update-api` to accept one).

CI (`.github/workflows/verify.yml`) runs this on every PR and push to `main`
on Node 26.3.0 (plus `npm run attw`), and a compatibility job that runs the
tests, the build and `verify:package` (which installs the packed tarball and
runs the consumer probes) on Node 20, 20.19.0, 22, 22.12.0 and 24. 20.19.0 and
22.12.0 are the exact `require(esm)` floors.

## What this is NOT certified to do

See the README's "Honest limits" section. In short: it trusts the caller's
`kind` and `vote` labels completely, it does not verify that two `source`
strings naming different artifacts are genuinely independent in reality
beyond the normalization rules above, and it has no search, fetch, or
stance-detection logic of its own. `'confirmed'` and `'not-found'` describe
what this library's counting rules concluded, not an external certification.

## Are the types wrong? (attw)

CI runs [`arethetypeswrong`](https://github.com/arethetypeswrong/arethetypeswrong.github.io)
(`npm run attw`, which is `attw --pack . --ignore-rules cjs-resolves-to-esm`)
against the packed tarball after the build step. The `cjs-resolves-to-esm` rule is ignored on
purpose: this is an ESM-only package (`"type": "module"`, no `require` entry point), so a
CommonJS consumer must use Node's `require(esm)` support (Node >=20.19 or >=22.12 — see
"Runtime support policy" below) rather than a native `require`. A dual CJS+ESM build was
rejected to avoid the dual-package hazard (two separately-identified copies of the same module,
with broken `instanceof` checks and duplicated module state across the CJS and ESM entry
points).

## Release and rollback

`npm run verify` (lint, typecheck, test, build, verify:package) runs automatically before
publish via the `prepublishOnly` script, so a broken build cannot reach the registry by
accident. To release: add a dated entry to `CHANGELOG.md`, bump `version` in
`package.json`, commit, and push a `vX.Y.Z` tag that matches the new version, then let
`.github/workflows/release.yml` install, audit, verify, and publish it. (You can also run
`npm publish` locally; `prepublishOnly` still guards it.)

npm's unpublish policy ([official text](https://docs.npmjs.com/policies/unpublish)) is
deliberately narrow. Within 72 hours of publishing a new package, a version can be unpublished
only if no other published package depends on it. After 72 hours, unpublishing also requires
fewer than 300 downloads in the last week and a single owner or maintainer — most released
versions won't qualify either way. A given `name@version` can never be reused, published or
not, even after an unpublish. Treat unpublish as unavailable: prefer fixing forward with a new
patch version, and use `npm deprecate <name>@"<range>" "<message>"` to warn consumers off a
bad release while it stays installable for anyone already pinned to it.

This package has no server component and no migration state to reverse either way.

### Runtime support policy

- **Supported (recommended for production):** Node 22 and 24 LTS; Node 26 current.
- **Compatibility-tested:** Node 20. Node 20 is end-of-life — nodejs.org's release page
  (<https://nodejs.org/en/about/previous-releases>) lists it as `EOL`, with its final release
  dated Mar 24, 2026. The `compat` job in `verify.yml` still runs on Node 20 to catch
  regressions, but that runtime gets no security fixes upstream; don't run production traffic
  on it.
- CommonJS `require()` of this package needs Node >=20.19 or >=22.12 (`require(esm)`
  support). ESM `import` works on every version this package tests (20, 22, 24).
- `engines` in `package.json` is unchanged by this policy.

### Publishing with provenance

`.github/workflows/release.yml` publishes using npm trusted publishing: it triggers on
`workflow_dispatch` or a pushed `v*` tag, requests a short-lived OIDC token instead of
reading a stored npm token (`permissions: id-token: write`), and runs a plain `npm publish`
with no token and no `--provenance` flag, because provenance attestation is generated
automatically under trusted publishing. Before publishing, the workflow requires that it is
running on a tag (for both triggers, so a manual run from a branch fails) and that the tag
matches `package.json`'s `version`, then runs `audit:dependencies`, `verify` and `attw`. It
then asks the registry whether that version is already published: only a confirmed `E404`
counts as "not published", a success means there is nothing to do, and any other registry
error fails the job instead of guessing. Trusted publishing must be configured for this package on npmjs.com (linking it to this
GitHub repository and the `release.yml` workflow) before the first automated release will
work.
