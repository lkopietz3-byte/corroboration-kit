# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - unreleased

Minor release. `'confirmed'` now counts independent origins instead of
different strings, so some inputs that were `'confirmed'` in 0.2.x are now
`'likely'`. A verdict can only get stricter (`'confirmed'` to `'likely'`), never
more generous, and a few malformed inputs now throw. New exports: `originOf`,
`sourceIdentity`. Still no runtime dependencies.

### Breaking changes

Each item says what to do about it.

- **Pages of one site or repository count once by default.** Two pages of one
  host, hosts that share a registered domain, and two URLs into one repository
  on github.com, gitlab.com, bitbucket.org or codeberg.org are now one source,
  so a verdict that was `'confirmed'` on them is now `'likely'`. Migration: if
  the pages really are independent, give each its own `origin`; to keep the
  0.2.x counts, pass `corroborate(signals, coverage, { inferOrigins: false })`.
- **Three more URL spellings are one page, even with `inferOrigins: false`.**
  The letter case of a percent escape (`%c3%a9` and `%C3%A9`), a trailing dot on
  the host, and an empty query (`x?` and `x`) used to count as two sources.
  Migration: none needed; these were one page cited twice. A verdict that relied
  on the double count drops to `'likely'`.
- **Plain file ids fold `./` and runs of slashes.** `./src//a.ts` and `src/a.ts`
  are now one source. Migration: none needed for the same file; spell files
  differently on purpose only if you need them apart (declare an `origin`).
- **New `TypeError`s.** `origin` or `derivedFrom` of the wrong type, empty or
  invisible (including `null`), an `options` that is not an object, and an
  `inferOrigins` that is not a boolean now throw. A `source` made only of
  U+FFFC, private-use, unassigned or base-less combining characters now throws
  too. Migration: omit the field instead of passing `null` (use `undefined`),
  pass a real boolean, and clean junk source strings before calling.
- **The result has a new field, `groups`.** Code that compares a whole
  `Corroboration` with deep equality sees it. Migration: compare `verdict`,
  `direction`, `supports` and `contradicts`, or update the expected objects.

### Added

- **Origins: `'confirmed'` now means independent origins, not different strings.**
  Signals are counted by origin. Two pages of one site, two files of one
  repository and a copy next to its upstream count once. The grouping is
  offline and has no public-suffix list:
  - `Signal.origin` (optional string): signals that declare the same origin
    count once. A signal that declares one is not grouped by its URL.
  - `Signal.derivedFrom` (optional list of strings): sources that share an
    upstream, or one that names another signal's `source`, count once.
  - URL inference for `http(s)` sources: the same repository on github.com,
    gitlab.com, bitbucket.org or codeberg.org (including raw, codeload and API
    hosts); the same host once `www`, `m`, `mobile`, `amp`, `docs`, `blog` and
    `api` are ignored; and hosts that share a registered domain. Shared hosting
    platforms (`github.io`, `vercel.app` and others) are one origin per
    subdomain, sites where each page is its own publication (forum threads,
    social posts, preprints, shared documents) are one origin per page, a
    web.archive.org snapshot is read as the page it archives (one level), and country codes whose structure cannot be judged keep subdomains
    apart. Declared lineage always wins over inference.
  - `Corroboration.groups`: which signals were counted together and why, one
    entry per counted source, with a `merges` list (`same-page`,
    `declared-origin`, `derived-from`, `same-repo`, `same-site`, `same-domain`)
    and a plain sentence for each.
  - `corroborate(signals, coverage, { inferOrigins: false })` turns the URL
    inference off. Spellings of one page still fold, and declared lineage still
    applies.
  - New exports `originOf(source)` and `sourceIdentity(source)`, new types
    `CorroborateOptions`, `MergeRule`, `SourceGroup` and `SourceMerge`.
- Plain file ids fold a leading `./` and a run of slashes (`./src//a.ts` is
  `src/a.ts`). Case, backslashes, `../`, a leading `/` and any string that
  starts with a scheme are left as written.
- `test/origins-table.test.ts`: the origin and lineage verdict table, with every
  changed verdict listed by input, two seeded fuzz oracles and CPU-time scaling
  tests.
- `test/verdict-table.test.ts`: a named verdict regression table (source
  identity, the non-textual gate, blank sources, `coverageOf`, README
  examples) and a seeded 15,000-case fuzz checked against an independent
  oracle.

### Changed (behavior; every change makes a verdict equal or stricter)

Counts can only go down from 0.2.1 for the same input, never up, so a verdict
can only go from `'confirmed'` to `'likely'`. Each input below was two sources
and `'confirmed'` (with one textual and one structural signal, strong coverage)
and is now one source and `'likely'`. With `{ inferOrigins: false }` every one
is two again.

- Two pages of one host: path case (`/X` and `/x`), a trailing slash (`/x` and
  `/x/`), a query against none, different query values, the same query pairs
  in another order, a bare-key query against an empty one, `%2F` against `/`,
  `%41` against `A`, `+` against `%20`, `%7E` against `~`, `(` `)` against
  `%28` `%29`, a literal `%` against `%25`, `&` against `%26`, a trailing `&`,
  a trailing dot on the path, a double slash, a directory against
  `index.html`, a tracking parameter, a non-default port (`:8443`, `http` on
  `:443`, `https` on `:80`), `http` against `https`, `www` against the bare
  host, and userinfo against none. Rows D01 to D16 and D22 to D30 of
  `test/verdict-table.test.ts`, and L03 (the documented workaround of moving a
  route out of the fragment, which now needs a declared `origin` per page).
- Different hosts that share a registered domain, or differ only by `www`, `m`,
  `mobile`, `amp`, `docs`, `blog` or `api` (`learn.corp.example` and
  `support.corp.example`, `docs.acme.example` and `blog.acme.example`,
  `news.acme.co.uk` and `shop.acme.co.uk`, `en.wiki.example` and
  `de.wiki.example`).
- Two URLs into one repository on a code host (`github.com/acme/release/...`,
  `raw.githubusercontent.com/acme/release/...`,
  `api.github.com/repos/acme/release/...`, `codeload.github.com/acme/release/...`,
  and the GitLab, Bitbucket and Codeberg equivalents).
- `./src/a.ts`, `././src/a.ts` and `src//a.ts` against `src/a.ts`.
- The `Corroboration` result has a new field, `groups`. Code that compares a
  whole result with deep equality sees the new field.
- `Signal.origin` or `Signal.derivedFrom` of the wrong type, or empty or
  invisible, throws `TypeError` (`null` is not "absent"), like the other
  fields. `corroborate` also throws `TypeError` for an `options` that is not an
  object or an `inferOrigins` that is not a boolean.
- Page identity: the three URL folds listed under Fixed. Sources that differed
  only in percent-escape hex case, a trailing host dot or an empty query used to
  count as two; they now count as one, so a verdict that relied on that can drop
  from `'confirmed'` to `'likely'`. Path case, a trailing slash, a query with
  content, a non-default port, `%2F` versus `/`, and `%41` versus `A` are still
  different pages (see the origin changes above for when pages still count once).
- Validation: a `source` that is only U+FFFC, private-use, unassigned or
  base-less combining characters is rejected (see Fixed). A letter next to
  any of them is still accepted.
- `tsconfig.json` now includes `test/` so the verdict table is type-checked
  and linted; the build still compiles only `src/`.

### Fixed

- Page-level sites ignore the prefixes `www`, `m`, `mobile`, `amp`, `old` and `np`, so `m.reddit.com` and `www.reddit.com` spellings of one thread are one source (different pages stay apart).
- The Bitbucket API (`api.bitbucket.org/2.0/repositories/<owner>/<repo>/...`), the Codeberg API (`/api/v1/repos/<owner>/<repo>/...`) and the GitLab API with an escaped project path (`/api/v4/projects/<group>%2F<proj>/...`) map to the repository, as the GitHub API already did. A numeric GitLab project id is not guessed.
- A declared `origin` that is not a URL compares exactly after trim and NFC; it no longer goes through the file-path folding (`left//right` and `left/right` are two origins).
- Repository names read from a code-host URL are percent-decoded and then lower-cased (an escaped slash stays an escape), so `%41cme` and `Acme` are one owner on every code host, including the GitLab API project path.
- Merge explanations no longer serialize every source string for every shared identity; duplicate reasons are found with a constant-time key of small numbers.
- A host made of a very long run of dots took quadratic time (about 0.4 s at
  20,000 dots and 6 s at 80,000): the trailing-dot step used a suffix regex.
  It is now a backward scan, and hosts over 253 characters are not analyzed
  further. Scaling tests cover it.
- **One page no longer counts as several sources through URL spelling.** For
  `http(s)://` sources, these now fold into one identity: the letter case of a
  percent escape (`%c3%a9` and `%C3%A9`), a trailing dot on the host
  (`a.example.` and `a.example`), and an empty query (`x?` and `x`). Before,
  each pair counted as two independent sources, so citing one page twice under
  two spellings could reach `'confirmed'`. Explicit default ports, which the
  README already listed, are pinned by tests.
- **More strings are rejected as "shows nothing".** A `source` made only of
  U+FFFC, private-use code points, unassigned code points (including the
  noncharacters) or combining marks with no base character now throws
  `TypeError`, like the other invisible characters. Before, two such strings
  (for example U+E000 and U+E001) counted as two independent sources.
- `coverageOf` documentation (README and TSDoc) now matches the code: a small
  pool or a ratio of 0.6 or more is `'strong'` with structural read access and
  `'partial'` without it. The code did not change.

### Documented

- The fragment is dropped on every `http(s)://` URL, so hash-routed
  single-page app pages (`#/inbox`) and line anchors (`#L10`) fold into one
  page. The README says so; to keep such pages apart, declare a different
  `origin` for each.
- `coverageOf` has a cliff at 30 units: `coverageOf(1, 30, true)` is
  `'strong'` and `coverageOf(1, 31, true)` is `'thin'`, so a very small sample
  of a small pool can reach `'confirmed'`. The README states the exact
  boundary and shows a caller-side floor. No option was added and defaults are
  unchanged.
- The non-textual signal that unlocks `'confirmed'` may come from any counted
  source on that side, including one that also has a textual signal.
- A single textual contradiction turns a supported claim into `'mixed'` even
  though a textual signal can never confirm. This asymmetry is by design.
- Lone surrogates and U+FFFD are still accepted as sources.
- Known limit: a GitLab project id that double-encodes a slash (`%252F`) is
  merged with the single-encoded form (`%2F`), so two such projects can count
  as one repository. This can only lower a confirmation count, never raise it.
  Declare an `origin` per project to keep them apart.

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
  for impossible input (`sampledUnits` greater than `totalUnits`, or either
  argument negative) instead of surfacing the caller bug. It now throws
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
