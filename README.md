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

// result.verdict: 'confirmed' | 'likely' | 'mixed' | 'not-found' | 'inconclusive'
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
([LaunchPlanr](https://github.com/lkopietz3-byte/launchplanr)'s
`corroborate.ts`, which grades findings about a codebase from signals like
dependency manifests, sampled source files, and directory structure) into a
standalone, domain-agnostic form. Nothing here is specific to code: the same
five rules apply to grading a claim from news sources, a hypothesis from lab
results, or a support ticket from log lines — anywhere you have named,
distinct evidence sources of more than one kind.

## Install

```bash
npm install corroboration-kit
```

Zero runtime dependencies. ESM only.

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
  against one document, never manufactures extra independence.
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

### `coverageOf(sampledUnits: number, totalUnits: number, hadStructuralReadAccess: boolean): Coverage`

A generic helper for turning "how much did I actually look at" into a
`Coverage` level. `sampledUnits` and `totalUnits` are deliberately generic —
files in a repo, documents in a corpus, records in a dataset, sources on a
topic, whatever your evidence pool's unit is.

- An unknown or empty pool (`totalUnits <= 0`) is `'thin'`: coverage can't be
  claimed over a pool of unknown size.
- A small pool (`totalUnits <= 30`) read almost whole, or a high sample
  ratio (`>= 0.6`), is `'strong'` — but only if `hadStructuralReadAccess` is
  true. A structural/manifest-level read (a table of contents, a schema, an
  index) independent of the per-unit sample is what promotes a partial
  sample to strong, because it answers some questions without needing every
  unit's body read.
- A mid-range ratio (`>= 0.15`) is `'partial'`.
- Anything below that is `'thin'`.

### `verdictLabel(v: Verdict): string` / `coverageLabel(c: Coverage): string`

Human-readable labels, for display.

## Design principles

- **Independence is by source, not by check.** Counting is `new
  Set(signals.map(s => s.source)).size`, not `signals.length`.
- **`'confirmed'` requires a non-textual signal, symmetrically for both the
  positive and negative case.** Text repeating text is not corroboration.
- **Disagreement is surfaced, never blended.** `'mixed'` exists so real
  conflict in the evidence doesn't get averaged into false calm.
- **Coverage is a ceiling, not an input.** A verdict can be no more
  confident than the sample it was drawn from allows.
- **A null result respects sample size.** `'not-found'` is only earned under
  adequate coverage; a thin sample returns `'inconclusive'` instead.

## License

MIT
