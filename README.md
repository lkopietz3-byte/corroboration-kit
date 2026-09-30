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
// result.direction is 'supports': both counted sources voted that way.
```

Read `verdict` together with `direction`. `'confirmed'` is reachable on the
contradicting side too, so `verdict: 'confirmed'` with `direction:
'contradicts'` means the evidence **confirms the claim is false**, not that
it is true. See [`Corroboration`](#corroboratesignals-signal-coverage-coverage-corroboration).

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
- Your evidence only ever comes from text matching (e.g. only grep or keyword
  search). The non-textual gate means `'confirmed'` is then unreachable, which
  is the intended behavior, not a bug: such a pipeline gets `'likely'` at
  best. A pipeline whose signals are all one *non-textual* kind is not
  affected: two distinct structural sources can be `'confirmed'`.

## Install

```bash
npm install corroboration-kit
```

Zero runtime dependencies. Ships TypeScript declarations. Or build from
source: clone the repository and run `npm install && npm run build`.

It is an ESM package (`"type": "module"`). `import` is the supported way to
load it. `require()` also works where Node can `require(esm)`:

| How you load it | Node 20.19+ | Node 22.12+ | Node 24 and 26 | Older Node 20 or 22 |
| --- | --- | --- | --- | --- |
| `import { corroborate } from 'corroboration-kit'` | works | works | works | works |
| `require('corroboration-kit')` | works | works | works | fails (no `require(esm)`); use `import()` |

Recommended runtimes are Node 22 and 24 (LTS) and Node 26 (current). Node 20 is
end-of-life. CI still runs the tests and the installed-package probes on Node
20.19.0 and 22.12.0 (the `require(esm)` floors) to catch regressions, but that
is compatibility testing, not a recommendation. `engines` in `package.json` is
`>=20`.

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
type Direction = 'supports' | 'contradicts' | 'mixed' | 'none'

interface Corroboration {
  verdict: Verdict
  direction: Direction // which way the counted sources point (see below)
  coverage: Coverage
  signals: Signal[]    // the snapshot that was graded
  supports: number     // distinct supporting SOURCES, not signal count
  contradicts: number  // distinct contradicting SOURCES, not signal count
}
```

`direction` is derived only from the two counts: `'supports'` when only
supporting sources were counted, `'contradicts'` when only contradicting
sources were counted, `'mixed'` when both were (exactly when `verdict` is
`'mixed'`), and `'none'` when neither was (the verdict is then `'not-found'`
or `'inconclusive'`). Signals voting `'inconclusive'` are not counted. It never
changes the verdict.

**`'confirmed'` with `direction: 'contradicts'` means the evidence confirms
the claim is FALSE.** The bar for a confirmed contradiction is the same as
for a confirmed support (2+ distinct sources, at least one non-textual), and
the result is `verdict: 'confirmed'`, `supports: 0`, `contradicts: 2`. A
consumer that shows only the verdict would read that as confirmation of the
claim, so show the direction with it.

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
array nor its objects are mutated.

**Input is read once.** `corroborate` reads the array's length once and each
element once, and copies each signal by reading each of its fields once (an
own enumerable field, a non-enumerable one, and a field inherited from a
prototype or a class getter all count). Validation, grading and
`result.signals` all use that one copy, so a getter or proxy that answers
differently on a later read cannot make the verdict disagree with the
evidence in the result, and editing the input (or the result) afterward
cannot make one disagree with the other. Each returned signal is a new plain
object with ordinary data properties. Other own enumerable properties on a
signal are copied along shallowly: a nested object stored in one is shared
with the caller, not cloned.

**What throws.** `corroborate` throws `TypeError` for any value the type
system would have caught, so a typo cannot be silently mis-graded (a wrong
`kind` could otherwise unlock a false `'confirmed'`, and a wrong `coverage`
could skip the thin-coverage ceiling):

| Input | Result |
| --- | --- |
| `signals` is not an array, or an element is not an object | `TypeError` naming the index |
| a hole in `signals` (a sparse array, even if `Array.prototype` defines that index) | `TypeError` naming the index |
| `source` is not a string, or shows nothing (see below) | `TypeError` |
| `kind` or `vote` is not one of the listed literals | `TypeError` |
| `coverage` is not `'strong'`, `'partial'` or `'thin'` | `TypeError` |
| `detail` is anything at all | accepted and copied as read; it is free-form and never validated or graded |

A `source` shows nothing when it is empty or made only of whitespace,
control characters, invisible formatting characters (zero-width spaces and
joiners, the soft hyphen, bidi controls such as U+061C and U+2066-2069,
variation selectors, the interlinear annotation characters U+FFF9-FFFB, every
other Unicode `Cf` format character) and the braille blank U+2800. Visible text in any script, emoji, and visible text
wrapped in bidi controls are accepted.

Error messages describe the offending value without calling into it (no
`toString`, `toJSON` or getter runs), cut a long string to 40 characters, and
write control and bidi characters as visible escapes such as `\u001b`, so a
message cannot forge a log line or send a terminal escape.

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
that is not one of the fixed `Verdict` / `Coverage` string literals. That
includes inherited-property names like `'constructor'` or `'__proto__'`, and
values that would only coerce to a valid string, such as `['confirmed']`, a
boxed `new String('confirmed')` or an object with a `toString`.

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
  the library has no way to know that. The "Why this
  exists" example (a text-only tool that confirmed all six distorted claims
  in its benchmark because real coverage of the topic satisfied its
  independence check) is a case where this library's non-textual gate keeps
  citation count from being enough, but a caller still has to supply an
  honestly-distinct `source` and an honestly-assigned `kind`, or even this
  design can be defeated. Label a topic-level text match `'structural'` and
  the same failure is back.
- **It has no search, no fetch, no parsing, and does no stance detection of
  its own.** It never reads the claim's text, a source's content, or
  determines what a source actually says — `vote` is entirely the caller's
  judgment call, made before `corroborate` is ever invoked.
- **`'confirmed'` and `'not-found'` are not certifications.** They mean "met
  this library's bar for its counting rules," not "true" or "false" in any
  externally verifiable sense, and neither implies legal, scientific, or
  journalistic sign-off.
- **`direction` reports the counted labels, not the truth.** It says which
  way the sources you labeled `'supports'` or `'contradicts'` point. It does
  not say the claim is true or false, and a `'confirmed'` verdict in either
  direction is still a statement about this library's counting rules.
- **Invisible characters inside a longer `source` still make it distinct.**
  Only a `source` that shows nothing at all is rejected. `'a'` and
  `'a\u200b'` are counted as two artifacts, which errs toward a false
  "independent" (see the note on under-merging above), so canonicalize
  sources before calling if your source strings can carry invisible
  characters.
- **Coverage is only as honest as `sampledUnits` and `totalUnits`.**
  `coverageOf` does the arithmetic correctly, but it cannot check that the
  caller's counts describe the evidence pool honestly.

## Relationship to sibling kits

- [`grounding-kit`](https://github.com/lkopietz3-byte/grounding-kit) checks,
  mechanically, that a citation marker in AI-generated text points at an
  evidence span related to its sentence (its default matcher is word overlap,
  not semantic entailment, and it does not judge whether the evidence is
  true). `corroboration-kit` applies fixed counting rules to signals you have
  already collected and labeled for a claim. Run `grounding-kit` first to find
  which sentences claim support, then `corroboration-kit` if you want its rules
  applied to the signals you gathered. The two share no code.
- [`provenance-kit`](https://github.com/lkopietz3-byte/provenance-kit) labels
  claims with an evidence tier and checks that public wording is not stronger
  than the tier allows; it never looks at evidence and does not know about
  corroboration verdicts or signals. The two are not integrated in code. A
  `corroboration-kit` verdict could be one input to a person's decision about
  which tier a claim is entitled to, and nothing more.

## Relationship to LaunchPlanr's `corroborate.ts`

This is a from-scratch rewrite of the same five rules, not a re-export. The
original is private and no comparison test against it ships in this
repository, so this README does not claim the two agree on every input; the
tests here pin the behavior of this package. What changed in extraction:
input validation that throws on malformed `Signal`/`Coverage` values instead
of silently mis-grading them, source-identity normalization (whitespace,
Unicode, URL variants), and a `Corroboration.signals` result that is a
snapshot copy rather than the caller's own array.

## License

MIT
