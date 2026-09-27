# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-09-27

### Fixed

- `coverageOf` returned an ordinary-looking coverage value (e.g. `'strong'`)
  for impossible input — `sampledUnits` greater than `totalUnits`, or either
  argument negative — instead of surfacing the caller bug. It now throws
  `RangeError` for both cases, matching `corroborate`'s own fail-closed
  validation. `NaN`/`Infinity` are unchanged (still `'thin'`: no usable
  count, not an impossible one).
- The shipped `.js.map` pointed at `../src/*.ts`, which isn't in the
  published tarball. `tsconfig.build.json` now sets `inlineSources`, so the
  map embeds the original source. `.d.ts.map` generation is turned off
  instead of shipping `src/` (see README's "Install").

### Added

- CommonJS `require()` support: `package.json` `exports` now has a
  `"default"` condition alongside `"import"`, so
  `require("corroboration-kit")` works on Node versions that support
  `require(esm)` (>=20.19.0, >=22.12.0). ESM `import` is unaffected.
  `scripts/consumer-probe.cjs`, run by `verify-package.mjs`, guards it in CI.
- A "Relationship to sibling kits" section in the README, cross-linking
  `grounding-kit` and `provenance-kit`.

## [0.1.0] - 2026-09-27

First release.

### Added

- `corroborate(signals, coverage)`: grades a claim from caller-supplied
  evidence signals. Independence is counted by distinct source artifact, not
  by signal count; `'confirmed'` requires at least one non-textual signal on
  the winning side; disagreement is surfaced as `'mixed'`; a null result
  under thin coverage is `'inconclusive'`, not `'not-found'`; coverage is a
  ceiling on the verdict, never averaged in.
- `coverageOf(sampledUnits, totalUnits, hadStructuralReadAccess)`: derives a
  `Coverage` level from how much of an evidence pool was actually sampled.
- `verdictLabel(verdict)` / `coverageLabel(coverage)`: human-readable display
  labels for the two enums.
- Source-artifact identity is normalized for whitespace, Unicode canonical
  form, and (for `http(s)://` URLs) the fragment, scheme/host case, default
  port, and dot segments, so two citations of the same artifact under a
  differently-spelled `source` still count once.
- `corroborate` and `coverageOf` validate their input and throw `TypeError`
  on a malformed `Signal`, an unrecognized `kind`/`vote`/`coverage`, or a
  non-numeric sample count, instead of silently mis-grading it.
- Zero runtime dependencies. ESM only, Node >= 20.

### Notes

Extracted from LaunchPlanr's internal `corroborate.ts` and rewritten as a
domain-agnostic, standalone package. Grading behavior for well-formed input
matches the original (verified by a 200,000-case randomized differential
test); the validation, source-identity normalization, and result-snapshot
behavior above are new in this extraction. See the README's "Relationship to
LaunchPlanr's `corroborate.ts`" section for detail.
