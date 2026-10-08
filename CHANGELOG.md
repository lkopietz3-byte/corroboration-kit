# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-10-07

No change to the library's behavior or API.

### Changed

- The README links to the [in-browser playground](https://lkopietz3-byte.github.io/honesty-kits/#corroboration-kit) and the honesty kits family, and the npm homepage now points to the playground.
- Added the `honesty-kits` npm keyword so the family shows up together in search.

### Security

- Development lockfile: `source-map-js` 1.2.2 (GHSA-68fv-2mgg-jv7q). Development tooling only; the published package has no runtime dependencies.

## [0.2.0] - 2026-09-29

Minor release: a few inputs that used to be accepted now throw or give a
different result, and the `Corroboration` result has a new `direction` field.
Every verdict for ordinary input is unchanged. No new runtime exports (one new
type, `Direction`) and no runtime dependencies.

### Added

- **`Corroboration.direction` (CK-003)**: `'supports' | 'contradicts' |
  'mixed' | 'none'`, derived only from the counted sources. It never changes
  the verdict. `'confirmed'` is reachable on the contradicting side, so a
  `'confirmed'` verdict with `direction: 'contradicts'` means the evidence
  confirms the claim is false; consumers that show only the verdict can read
  that as confirmation. The README and TSDoc say so. New exported type
  `Direction`.

### Changed (breaking)

- **A `source` that shows nothing is rejected.** A source made only of
  whitespace, control characters and invisible formatting characters
  (zero-width spaces and joiners, the soft hyphen, U+061C, the isolate
  controls U+2066-2069, variation selectors, Hangul fillers, every Unicode
  `Cf` format character such as the interlinear annotation anchor U+FFF9) or
  the braille blank U+2800 now throws a
  `TypeError`, like an empty one. Before, `'\u200b'` passed and could be
  counted as an artifact with no visible name. Visible text in any script,
  emoji and bidi-wrapped visible text are unchanged.
- **Fields inherited from a prototype, or on a class getter, are kept in
  `result.signals` (CK-AUD-001c).** Validation always accepted them, but the
  returned copy dropped them (`signals: [{}]` next to `supports: 1`). Each
  returned signal now carries `source`, `kind`, `vote` and, when there is
  one, `detail` as plain own data properties.
- **A hole in `signals` is refused even when `Array.prototype` defines that
  index.** Before, the inherited value was read through the hole. The message
  now says the array has a hole.
- **`verdictLabel` and `coverageLabel` accept only primitive strings
  (CK-AUD-002).** `['confirmed']`, a boxed `new String('confirmed')` and an
  object with a `toString` used to return a label because the lookup coerced
  the key; they now throw `TypeError`, and an object whose `toString` throws
  no longer leaks that error.
- **Error messages escape control and bidi characters** from the value they
  describe, as visible escapes such as `\u202e`, and describing a revoked
  `Proxy` no longer throws while the message is built. The `source` message
  now reads "must not be empty or show nothing".

### Fixed

- **Input is read once (CK-001, CK-AUD-001a and 001b).** The signals array
  (length once, each index once) and each signal's fields (each once) are
  copied into one snapshot, and validation, grading and `result.signals` all
  use it. Before, a getter that answered differently on each read produced a
  verdict (`confirmed` from two textual signals, or from a kind that never
  passed validation) that the returned signals contradicted; grading the
  returned signals again gave a different answer.
- Copying an inherited field cannot run a setter, or hit a read-only
  property, that something put on `Object.prototype`.

### Docs

- README: an ESM and CommonJS compatibility table (`require()` works on Node
  20.19+ and 22.12+), Node support consistent with ENGINEERING (22 and 24 LTS
  recommended, 26 current, 20 is end-of-life and compatibility-tested only),
  a table of what throws, the read-once and shallow-copy behavior, `direction`,
  and the invisible-character limit. There is no date-dependent example to pin.
- CK-004: README "When not to use it" said any single-kind pipeline can never
  reach `'confirmed'`; only textual-only evidence cannot (two structural
  sources can confirm). ENGINEERING invariant 6 said non-positive counts throw
  `TypeError`; `coverageOf` returns `'thin'` for an unusable count and throws
  `RangeError` for an impossible one, and `detail` is free-form. Both now
  match the tests, and ENGINEERING links npm's unpublish policy.
- README sibling-kit statements now match the siblings' own limits:
  `grounding-kit` checks that a citation marker points at related evidence
  (not that the evidence is true) and `provenance-kit` labels claims with
  evidence tiers (it does not track content origin, and its records are not
  `Signal`s).
- The README "Why this exists" example was misdescribed in the limits
  section (the cited tool confirmed six distorted claims because it does no
  stance detection, not because outlets copied one detail); corrected. The
  0.1.0 notes below said grading matched the private original "verified by a
  200,000-case randomized differential test"; that test is not in this
  repository and is not claimed any more, and `coverageOf` never threw
  `TypeError` for a non-numeric count (it returns `'thin'`).
- TSDoc for `Direction` and the changed fields; `PROJECT_CONTEXT.md`'s
  purpose line no longer says the library avoids "overstating the inspected
  evidence" (it counts caller labels and does not inspect evidence).

### Tests and CI

- New regression tests for each item above, the confirmed-contradiction
  boundary (exactly two sources), the exact error messages, and http versus
  non-http source identity. Mutation score 90.9% -> 99.7% (the one survivor
  is an equivalent mutant), v8 line and branch coverage 100%.
- `verify.yml`: the compatibility job also runs Node 20.19.0 and 22.12.0
  (the exact `require(esm)` floors) with the tests and `verify-package.mjs`.
- `release.yml`: runs `audit:dependencies`, `verify` and `attw`; both
  triggers must run on a `v*` tag that matches `package.json`; only a
  confirmed `E404` counts as "not published" and any other registry error
  fails the job.
- The consumer probes check `direction`, single-read snapshots and the
  stricter label helpers.

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
