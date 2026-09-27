# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-24

First release. Not yet published to npm; install from GitHub (see README).

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
