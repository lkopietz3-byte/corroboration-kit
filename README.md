# corroboration-kit

A small, dependency-free function for rule-based grading of caller-supplied
signals about a claim, using caller-assigned source labels and coverage. Its
`'confirmed'` verdict means the supplied signals passed those rules; it is
not independent factual verification.

It is not a fact-checker, a search engine, or a scoring model. It takes
signals you already collected — from wherever you collect them — and applies
a fixed set of rules for turning them into a verdict bounded by the coverage
you report.

```ts
import { corroborate, coverageOf } from 'corroboration-kit'

const coverage = coverageOf(/* sampledUnits */ 40, /* totalUnits */ 400, /* hadStructuralReadAccess */ true)

const result = corroborate(
  [
    { source: 'api-response-2026-08-01', kind: 'declarative', vote: 'supports', detail: 'field is set to true' },
    { source: 'press-release', kind: 'textual', vote: 'supports', detail: 'press release repeats the claim' },
  ],
  coverage,
)

// coverage is 'thin' (40 of 400 units is below the 15% partial threshold),
// so result.verdict is 'likely' here — even though the two signals are from
// distinct sources and one is non-textual, which would otherwise be enough
// to reach 'confirmed'. That's the coverage ceiling: a thin sample caps the
// verdict no matter how the signals it did find line up.
```

## Why this exists

Most "corroboration" logic in the wild counts **citations**, not
**independence**. That distinction sounds academic until you see it fail in
public.

[corroborate-mcp](https://github.com/chefcohen/corroborate-mcp) is a real,
open-source MCP server built for exactly this problem — an honest,
zero-API-key claim-corroboration tool with verdict tiers `CONFIRMED` (2+
independent origins), `SINGLE_SOURCE`, and `UNCORROBORATED`. It's a
well-built tool, and unusually for the category, it publishes its own
accuracy numbers against a public 40-claim benchmark instead of only
asserting rigor. Its README's benchmark table, latest run 2026-07-22,
reports one line plainly:

> **Distorted claims falsely CONFIRMED: 6/6**

All six deliberately distorted test claims — real, currently-reported topics
with a false specific detail swapped in, such as reporting that Samsung had
cancelled a phone it had in fact just unveiled — came back `CONFIRMED`. The
tool's own honest-limitations section explains why: its
entire evidence pipeline is text. It searches news text (Google News RSS,
GDELT, Hacker News), gates relevance by keyword overlap in headlines, and
clusters near-duplicate headlines into "independent origins." Every signal in
that pipeline is textual, and every corroboration decision is made from
text alone. So when a topic has real, independent textual coverage but the
*specific* claim about it is wrong, nothing in the pipeline can tell the
difference — the independence check is satisfied by topical text volume,
not by any signal that actually verifies the distorted detail. Multiple
outlets independently writing about the real event is not multiple outlets
independently confirming the false detail grafted onto it, but a
text-only independence count cannot see that gap.

This is exactly the failure mode this library's core design rule exists to
close: **`confirmed` is structurally unreachable from textual signals alone.**
Two, five, or fifty text matches from distinct sources still cap at
`'likely'` here, because a `Signal` with `kind: 'textual'` can never by
itself clear the bar. Reaching `'confirmed'` requires at least one signal of
a genuinely different kind — `'structural'`, `'behavioral'`, or
`'declarative'` — something that isn't just more text saying the same thing,
because more text saying the same thing is precisely what corroborate-mcp's
own published benchmark shows can be wrong six times out of six. This isn't
a claim that this library is "more rigorous" in the abstract; it's one
specific design choice (a non-textual gate on `'confirmed'`), aimed
directly at one specific, documented, cited failure in a close cousin of
this exact problem.

Two other rules follow the same standard of not overstating what was found:
independence is counted by **distinct source artifact**, not by number of
checks run (grepping the same file three times is one signal, not three),
and coverage of the evidence pool is a **ceiling** on the verdict, not an
input averaged in — a scan that only sampled a sliver of a large pool cannot
land on `'confirmed'` regardless of how clean its signals look, and a null
result from a thin sample is `'inconclusive'`, not `'not-found'`, because you
cannot prove a negative from a small sample.

This library was extracted from a code-honesty scanner
(`corroborate.ts` in LaunchPlanr, a private project, which grades findings about a codebase from signals like
dependency manifests, sampled source files, and directory structure) into a
standalone, domain-agnostic form. Nothing here is specific to code: the same
five rules apply to grading a claim from news sources, a hypothesis from lab
results, or a support ticket from log lines — anywhere you have named,
distinct evidence sources of more than one kind.

## When not to use it

- You need something to actually go find or fetch evidence. This library
  grades signals you already collected; it has no search, no crawling, no
  I/O of any kind.
- You want a numeric confidence score. Verdicts are the five fixed labels
  above, not a 0–1 probability — see "Honest limits" below.
- You need stance or fact-level verification of what a source says, not just
  whether independent sources exist. A signal's `vote` is whatever the
  caller decided it means; this library does not read text or judge claims.
- Your evidence only ever comes from one kind of check (e.g. only grep). The
  non-textual gate means `'confirmed'` is then structurally unreachable —
  which is the intended behavior, not a bug, but it means this tool won't do
  anything for a single-signal-type pipeline beyond report `'likely'`.

## Install

```bash
npm install corroboration-kit
```

Or build from source: clone the repository and run `npm install && npm run build`.

Zero runtime dependencies. ESM package, Node >= 20; CommonJS
`require("corroboration-kit")` also works on Node versions that support
`require(esm)` (>=20.19.0, >=22.12.0).

## API

### `Signal`

One piece of evidence bearing on a claim.

```ts
interface Signal {
  source: string   // the distinct artifact this signal was read from
  kind: 'textual' | 'structural' | 'behavioral' | 'declarative'
  vote: 'supports' | 'contradicts' | 'inconclusive'
  detail: string    // free-form explanation of what this signal found
}
```

- `source` is what independence is counted against. Two `Signal`s with the
  same `source` count as **one** distinct source, however many of them
  there are — so re-running the same check, or running several checks
  against one document, never manufactures extra independence. Two `source`
  strings are folded into the same identity when the only difference is
  surrounding whitespace, Unicode normalization (NFC vs NFD — how macOS and
  Linux can spell the same accented file name differently), or, for an
  `http(s)://` URL, the fragment, the case of the scheme or host, an
  explicit default port, or `.`/`..` path segments. Everything else —
  including path case, a trailing slash, and a query string — is kept
  distinct, because it can name a different artifact. `source` must be a
  non-empty string once trimmed; `corroborate` throws `TypeError` otherwise.
- `kind` is assigned by the caller. `'textual'` means a text/keyword/pattern
  match. The other three kinds are meant for anything that isn't just text
  matching text: a structural read (a schema, a directory listing, a parsed
  AST), a behavioral observation (something actually run or watched), or a
  declarative value (a config flag, a field in a manifest, a database
  record). Only non-`'textual'` signals can unlock `'confirmed'`.

### `Coverage`

`'strong' | 'partial' | 'thin'` — how much of the total evidence pool the
signals being graded were drawn from. This describes the scan as a whole,
not any one signal.

### `Verdict`

`'confirmed' | 'likely' | 'mixed' | 'not-found' | 'inconclusive'`

### `corroborate(signals: Signal[], coverage: Coverage): Corroboration`

The core grading function.

```ts
interface Corroboration {
  verdict: Verdict
  coverage: Coverage
  signals: Signal[]
  supports: number     // distinct supporting SOURCES, not signal count
  contradicts: number  // distinct contradicting SOURCES, not signal count
}
```

Rules, applied in order:

1. Distinct sources voting both `'supports'` and `'contradicts'` is real
   disagreement: `'mixed'`. It is never averaged into a false middle ground.
2. Only contradicting sources exist: the negative case reaches a
   confirmed-bad verdict under the same bar as the positive case — 2+
   distinct sources **and** at least one non-textual one. Short of that,
   it's `'likely'`.
3. No supporting sources at all: `'not-found'` under adequate coverage,
   `'inconclusive'` under thin coverage, because a small sample cannot prove
   a negative.
4. 2+ distinct supporting sources with at least one non-textual: `'confirmed'`.
5. Otherwise (one source, or several sources that are all `'textual'`):
   `'likely'`.
6. Coverage is then applied as a ceiling: `'thin'` coverage downgrades a
   would-be `'confirmed'` to `'likely'`, full stop.

Grading does not depend on the order of `signals`. Neither the `signals`
array nor its objects are mutated; `result.signals` is a separate copy, so
editing the input afterward (or editing the result) cannot make one
disagree with the other.

`corroborate` throws `TypeError` if `signals` is not an array of valid
`Signal` objects, or `coverage` is not one of the three `Coverage` values.
This is deliberate: a value the type system would have caught (a typo like
`kind: 'Textual'`, or `coverage: 'Thin'`) must fail loudly instead of being
silently mis-graded — a wrong `kind` could otherwise unlock a false
`'confirmed'`, and a wrong `coverage` could skip the thin-coverage ceiling.

### `coverageOf(sampledUnits: number, totalUnits: number, hadStructuralReadAccess: boolean): Coverage`

A generic helper for turning "how much did I actually look at" into a
`Coverage` level. `sampledUnits` and `totalUnits` are deliberately generic —
files in a repo, documents in a corpus, records in a dataset, sources on a
topic, whatever your evidence pool's unit is.

- Both `sampledUnits` and `totalUnits` must be finite numbers greater than
  0. Zero, `NaN`, or infinite values are `'thin'` — you cannot claim coverage
  for a sample that examined nothing, or over a pool whose size isn't known.
- A negative `sampledUnits`/`totalUnits`, or `sampledUnits` greater than
  `totalUnits`, throws `RangeError` instead of returning `'thin'`: both
  describe an impossible scan (a negative count, or sampling more than the
  pool contains), almost always a caller bug rather than a real thin sample.
- A small pool (`totalUnits <= 30`) with any valid sample, or a high sample
  ratio (`>= 0.6`), is `'strong'` — but only if `hadStructuralReadAccess` is
  exactly `true` (a truthy non-boolean does not count). A
  structural/manifest-level read (a table of contents, a schema, an index)
  independent of the per-unit sample is what promotes a partial sample to
  strong, because it answers some questions without needing every unit's
  body read.
- A mid-range ratio (`>= 0.15`) is `'partial'`.
- Anything below that is `'thin'`.

### `verdictLabel(v: Verdict): string` / `coverageLabel(c: Coverage): string`

Human-readable labels, for display. Both throw `TypeError` for any value
outside the fixed `Verdict` / `Coverage` sets — including inherited-property
names like `'constructor'` or `'__proto__'`, which a plain object lookup
would otherwise have returned instead of a label.

## Design principles

- **Independence is by source, not by check.** Counting is the size of a
  `Set` of normalized `source` identities, not `signals.length`.
- **`'confirmed'` requires a non-textual signal, symmetrically for both the
  positive and negative case.** Text repeating text is not corroboration.
- **Disagreement is surfaced, never blended.** `'mixed'` exists so real
  conflict in the evidence doesn't get averaged into false calm.
- **Coverage is a ceiling, not an input.** A verdict can be no more
  confident than the sample it was drawn from allows.
- **A null result respects sample size.** `'not-found'` is only earned under
  adequate coverage; a thin sample returns `'inconclusive'` instead.

## Honest limits

This library grades the signals you give it. It cannot verify that a signal
is honest, correctly labeled, or actually independent in reality:

- **It trusts `kind` and `vote` completely.** If a caller mislabels a second
  grep of the same file as `'structural'`, or labels a source's silence as
  `'contradicts'`, `corroborate` has no way to catch that — the non-textual
  gate only protects against *unlabeled* repetition, not mislabeled evidence.
- **It trusts that two different `source` strings really are two different
  artifacts.** Source identity is normalized for whitespace, Unicode, and a
  few URL variations (see `Signal` above), but two different URLs that both
  happen to mirror the same underlying wire story, or two file paths that
  happen to be symlinks to the same file, are still counted as independent —
  the library has no way to know that. The `README.md`'s own "Why this
  exists" example (a claim confirmed 6/6 by real, distinct outlets that had
  all copied one distorted detail) is a case this library's rules were built
  to make impossible to *game with citation count*, but a caller still has to
  supply an honestly-distinct `source` and an honestly-assigned `kind`, or
  even this design can be defeated.
- **It has no search, no fetch, no parsing, and does no stance detection of
  its own.** It never reads the claim's text, a source's content, or
  determines what a source actually says — `vote` is entirely the caller's
  judgment call, made before `corroborate` is ever invoked.
- **`'confirmed'` and `'not-found'` are not certifications.** They mean "met
  this library's bar for its counting rules," not "true" or "false" in any
  externally verifiable sense, and neither implies legal, scientific, or
  journalistic sign-off.
- **Coverage is only as honest as `sampledUnits` and `totalUnits`.**
  `coverageOf` does the arithmetic correctly, but it cannot check that the
  caller's counts describe the evidence pool honestly.

## Relationship to sibling kits

- [`grounding-kit`](https://github.com/lkopietz3-byte/grounding-kit) checks
  whether individual sentences in AI-generated text are backed by a citation;
  `corroboration-kit` grades whether the evidence for a claim, once gathered,
  is actually independent and sufficient. Use `grounding-kit` first to find
  which sentences claim support, then `corroboration-kit` to grade the
  quality of that support.
- [`provenance-kit`](https://github.com/lkopietz3-byte/provenance-kit) tracks
  where a piece of content or data came from; `corroboration-kit` grades
  whether independent evidence backs a claim once you have it. The two don't
  share code — a provenance record is one kind of `Signal` you can feed into
  `corroborate`.

## Relationship to LaunchPlanr's `corroborate.ts`

This is a from-scratch rewrite of the same five rules, not a re-export. The
grading behavior for well-formed input is identical to the original (checked
with a 200,000-case randomized differential test against the original
source). What changed in extraction: input validation that throws on
malformed `Signal`/`Coverage` values instead of silently mis-grading them,
source-identity normalization (whitespace, Unicode, URL variants), and a
`Corroboration.signals` result that is a snapshot copy rather than the
caller's own array. None of those change the verdict for any input that was
already well-formed.

## License

MIT
