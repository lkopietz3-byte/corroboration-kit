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
5. A null result (no supporting sources) is `'not-found'` only under
   non-thin coverage; under `'thin'` it is `'inconclusive'`.
6. `corroborate` and `coverageOf` fail closed: any input the type system
   would reject (bad `kind`/`vote`/`coverage`, non-numeric or non-positive
   counts, a non-string or empty `source`) throws `TypeError` rather than
   being silently mis-graded.
7. Grading is a pure function of the signal set: order-independent, and
   neither the input array/objects nor the returned `signals` alias them.

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
on Node 26, plus a separate compatibility job that installs the packed
tarball and runs the consumer probe on Node 20, 22, and 24.

## What this is NOT certified to do

See the README's "Honest limits" section. In short: it trusts the caller's
`kind` and `vote` labels completely, it does not verify that two `source`
strings naming different artifacts are genuinely independent in reality
beyond the normalization rules above, and it has no search, fetch, or
stance-detection logic of its own. `'confirmed'` and `'not-found'` describe
what this library's counting rules concluded, not an external certification.

## Release and rollback

`npm run verify` (lint, typecheck, test, build, verify:package) runs
automatically before publish via the `prepublishOnly` script. To cut a
release: bump `version` in `package.json`, add a `CHANGELOG.md` entry, tag
the commit, then `npm publish`. npm allows `npm unpublish` only within 72
hours of publishing, so prefer publishing a fixed patch release over trying
to unpublish a bad one — this package has no server component and no
migration state to reverse either way.
