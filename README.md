# corroboration-kit

**[Try it in your browser →](https://lkopietz3-byte.github.io/honesty-kits/#corroboration-kit)** · Part of [honesty kits](https://github.com/lkopietz3-byte/honesty-kits), a family of small checks for the claims an AI product makes.

**Who it is for.** Engineers who already collect typed evidence about a claim
(scanner findings, data-QA checks, the sources behind an AI answer) and want
one small, readable rule for how strongly the claim stands. It is a counting
core: it takes the signals you collected and labeled, and returns a verdict you
can explain line by line.

**What `'confirmed'` means.** At least two *independent origins* agree, at
least one of the agreeing signals is not just text (it is `structural`,
`behavioral` or `declarative`), and the sample you report is not thin. An
origin is a publisher, a repository, a dataset or an author, so two pages of
one site, two files of one repository, and a copy next to the thing it was
copied from each count once. The library finds the obvious cases from URLs,
offline, and you declare the rest with `origin` and `derivedFrom`. The result
lists which sources were counted together and why, so you can check it.

It does not verify that the claim is true. It never reads a source, fetches
anything or judges what a source says; `kind` and `vote` are your labels, and
lineage you do not declare (a data set that quietly copies another) is
invisible to it. `'confirmed'` means the signals you supplied passed these
counting rules.

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
independence is counted by **distinct origin**, not by number of checks run
or strings written (grepping the same file three times is one signal, and so
are two pages of one site),
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
  same `source` count as **one** distinct source, however many of them there
  are, so re-running the same check, or running several checks against one
  document, never manufactures extra independence. Two `source` strings are
  folded into the same page when the only difference is surrounding
  whitespace, Unicode normalization (NFC vs NFD, how macOS and Linux can spell
  the same accented file name differently), or, for an `http(s)://` URL, one
  of these:

  | Folded (one page) | Example |
  | --- | --- |
  | the fragment | `https://a.example/doc#s1` and `https://a.example/doc#s2` |
  | scheme and host case | `HTTPS://A.Example/x` and `https://a.example/x` |
  | a trailing dot on the host (the DNS root label) | `https://a.example./x` and `https://a.example/x` |
  | an explicit default port | `https://a.example:443/x` and `https://a.example/x` |
  | `.` and `..` path segments | `https://a.example/a/../x` and `https://a.example/x` |
  | an empty query | `https://a.example/x?` and `https://a.example/x` |
  | the letter case of a percent escape | `/caf%c3%a9` and `/caf%C3%A9` |

  For a plain id that does not start with a scheme (a file path), a run of
  slashes and a leading `./` are folded too: `./src//a.ts` is `src/a.ts`. Case
  and backslashes are not (`README.md` and `readme.md` are different files on
  some systems), and a string with a scheme (`db://t/1`, `file:///a`) is left
  as written.

  Everything else is a different **page**: path case, a trailing slash on a
  path, a query string that has content (including the order of its pairs), a
  non-default port, `%2F` versus `/`, `%41` versus `A`, `www.` versus the bare
  host, `http` versus `https`. Different pages can still share an **origin**,
  and the origin is what is counted; see [Origins](#origins-what-counts-as-one-source).
  **The fragment is dropped on every `http(s)://` URL, including a hash route
  such as `https://app.example/#/reports/2023`, so two pages of a hash-routed
  single-page app, or two line anchors in one code host file, are one page.**
  `source` must be a string that shows something; `corroborate` throws
  `TypeError` otherwise.
- `origin` (optional) names the origin this source belongs to, in your own
  words: a publisher, a repository, a dataset, an author. Signals that declare
  the same `origin` count once. A signal that declares an `origin` is not
  grouped by its URL, so this is also how to keep two pages of one host apart.
  Compared after trimming and Unicode NFC, otherwise exactly (case matters).
  To name a repository or a site, write it as a URL
  (`https://github.com/acme/release`) so it is read with the same rules as a
  `source`. Must be a string that shows something; `null` and `''` throw.
- `derivedFrom` (optional) lists what this source was copied or derived from,
  each entry read like an `origin` (a label or a URL). Sources that share an
  upstream, and a copy together with the signal it came from, count once. An
  entry also matches a signal whose `source` is that entry, compared as a page
  (so `./src//a.ts` names `src/a.ts`); an `origin` label is compared exactly. Must be an array
  of strings that show something; anything else throws `TypeError`.
- `kind` is assigned by the caller. `'textual'` means a text/keyword/pattern
  match. The other three kinds are meant for anything that isn't just text
  matching text: a structural read (a schema, a directory listing, a parsed
  AST), a behavioral observation (something actually run or watched), or a
  declarative value (a config flag, a field in a manifest, a database
  record). Only non-`'textual'` signals can unlock `'confirmed'`.

### Origins: what counts as one source

`corroborate` counts **origins**. Two signals share an origin, and count once,
when any of these holds. The result's `groups` says which one applied.

| Rule | When | Example |
| --- | --- | --- |
| `same-page` | spellings of one page | `https://a.example/doc#s1` and `HTTPS://A.EXAMPLE/doc` |
| `declared-origin` | the signals declare the same `origin` | two copies, both `origin: 'country-dataset'` |
| `derived-from` | the signals share a `derivedFrom` upstream, or one names the other's `source` | a tracker page with `derivedFrom: ['https://github.com/acme/release']` and a file of that repository |
| `same-repo` | URLs into one repository on github.com, gitlab.com, bitbucket.org or codeberg.org (including raw, codeload and API hosts) | `github.com/acme/release/blob/main/a.json` and `raw.githubusercontent.com/acme/release/main/b.md` |
| `same-site` | URLs on one host, ignoring the prefixes `www`, `m`, `mobile`, `amp`, `docs`, `blog` and `api`, the scheme and the port | `https://venue.example/menu` and `https://www.venue.example/contact` |
| `same-domain` | URLs on hosts that share one registered domain | `https://learn.corp.example/a` and `https://support.corp.example/b` |

Lineage you declare wins over inference. A signal with an `origin` is not
grouped by its URL, and nothing you declare can split two spellings of one
page. So the count can only go down from what 0.2.1 gave for the same input,
never up, and you can always keep two pages apart by giving them different
origins. `corroborate(signals, coverage, { inferOrigins: false })` turns the
URL rules off entirely (only spellings of one page fold, as in 0.2.x), and
declared lineage still applies.

**How the URL rules decide, and what they leave alone.** Everything runs
offline with no public-suffix list, so the rules are short and err toward
keeping sources apart when they cannot tell:

- A repository is `host/owner/name`, case-insensitive, `.git` dropped. Two
  repositories of one owner stay apart, and so does a repository from the code
  host's own docs site. On GitLab the repository is the path before `/-/`.
- The registered domain is the last two labels, or the last three under a
  country code with a known second level (`acme.co.uk`, `acme.com.au`). For a
  country code that hands out regional names (`city.osaka.jp`, `x.on.ca`), the
  rule cannot tell, so subdomains stay separate.
- A host on a shared hosting platform (`github.io`, `vercel.app`,
  `blogspot.com`, `herokuapp.com` and about fifty more) is its own origin per
  subdomain, never merged by registered domain.
- On sites where each page is its own publication, the **page** is the origin:
  forum threads and social posts (reddit.com, x.com, news.ycombinator.com,
  stackoverflow.com), writing platforms (medium.com, dev.to), shared documents
  (docs.google.com), preprints and papers (arxiv.org, doi.org) and link
  shorteners. A `web.archive.org/web/<timestamp>/<url>` snapshot is read as
  the page it archives, one level deep, so a snapshot and the live page (or
  two snapshots of one site) share an origin.
- An IP address or a one-label host (`localhost`) is its own origin, port
  included.
- Mirrors under a different registered domain, a symlink, a data set that
  copies another and a syndicated wire story are not visible from the text of a
  URL. Declare them with `derivedFrom` or `origin`.

`originOf(source)` returns the origin the URL rules give a source
(`repo:github.com/acme/release`, `domain:corp.example`, `site:alice.github.io`,
`page:medium.com/@alice/post`), or `undefined` if it is not an `http(s)` URL.
`sourceIdentity(source)` returns the page identity the folds above produce.
Use them to show or pre-group sources before calling `corroborate`.

```ts
// A tracker that copies a project's release data is not a second origin.
const result = corroborate(
  [
    { source: 'https://tracker.example/product/node', kind: 'declarative', vote: 'supports', detail: 'release date matches',
      derivedFrom: ['https://github.com/acme/release'] },
    { source: 'https://github.com/acme/release/blob/main/schedule.json', kind: 'declarative', vote: 'supports', detail: 'start date' },
    { source: 'https://github.com/acme/release/blob/main/README.md', kind: 'textual', vote: 'supports', detail: 'table row' },
  ],
  'strong',
)
// result.supports === 1 and result.verdict === 'likely': one origin.
// result.groups[0].merges says why, for example:
//   { rule: 'derived-from', key: 'https://github.com/acme/release', ... }
//   { rule: 'same-repo', key: 'github.com/acme/release', ... }
```

### Choosing `kind` for web evidence

The `'confirmed'` gate depends on the `kind` you assign, so label honestly.
A web article, a vendor help page, a news story or a government notice that
says the thing in prose is `'textual'`: it can support `'likely'` but never
reach `'confirmed'` on its own. These are non-textual, because they are
records or observations, not prose: a field in an API response or a data file
(`declarative`), a parsed table or schema you read by structure (`structural`),
and something you ran or watched (`behavioral`). Matching a file *name* is not
a structural read of the file's contents; label it `'textual'`. When two
sources disagree because they define a field differently (a planned date and
an actual date), vote `'inconclusive'` for the one that does not measure the
same thing instead of `'contradicts'`.

### `Coverage`

`'strong' | 'partial' | 'thin'` — how much of the total evidence pool the
signals being graded were drawn from. This describes the scan as a whole,
not any one signal.

### `Verdict`

`'confirmed' | 'likely' | 'mixed' | 'not-found' | 'inconclusive'`

### `corroborate(signals: Signal[], coverage: Coverage, options?: CorroborateOptions): Corroboration`

The core grading function.

```ts
type Direction = 'supports' | 'contradicts' | 'mixed' | 'none'

interface Corroboration {
  verdict: Verdict
  direction: Direction // which way the counted sources point (see below)
  coverage: Coverage
  signals: Signal[]    // the snapshot that was graded
  supports: number     // distinct supporting ORIGINS, not signal count
  contradicts: number  // distinct contradicting ORIGINS, not signal count
  groups: SourceGroup[] // which signals were counted together, and why
}

interface SourceGroup {
  side: 'supports' | 'contradicts'
  source: string        // the first source string of the group, as given
  sources: string[]     // every distinct source string in the group
  signals: number[]     // indexes into `signals`
  merges: Array<{
    rule: 'same-page' | 'declared-origin' | 'derived-from' | 'same-repo' | 'same-site' | 'same-domain'
    key: string         // the shared identity: repo, host, domain, declared text
    sources: string[]   // the source strings this reason joins
    explanation: string // one plain sentence
  }>
}

interface CorroborateOptions {
  inferOrigins?: boolean // default true; false = fold spellings of one page only
}
```

`groups` is the audit trail. It lists the counted sources, supporting groups
first, with one entry in `merges` per reason that joined two or more source
strings. A group with no `merges` is a single source string. Signals that
voted `'inconclusive'` are in no group. The explanation text escapes control
and bidi characters from your source strings.

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

Rules, applied in order. "Source" below means one counted origin, a group in
`groups`:

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

Two consequences of these rules are intended, so they are spelled out:

- **The non-textual signal can come from any counted source on that side.**
  Rule 4 needs 2+ distinct supporting sources and at least one non-`'textual'`
  signal among the signals that voted `'supports'`. It does not need the
  non-textual signal to come from a different source than the textual one, so
  source A with a textual and a structural signal plus source B with a textual
  signal is `'confirmed'`. That is the same evidence as A (structural) plus B
  (textual), because A's extra textual signal adds nothing. A non-textual
  signal that votes `'inconclusive'`, or votes for the other side, never
  unlocks `'confirmed'`.
- **A textual signal can lower a verdict but never raise it to `'confirmed'`.**
  Rule 1 counts any distinct contradicting source, however weak, so one
  textual contradiction beside ten confirming structural sources is
  `'mixed'`. This is deliberate: disagreement is surfaced, not outvoted. Check
  `supports` and `contradicts` to see how lopsided a `'mixed'` verdict is.

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
other Unicode `Cf` format character), the braille blank U+2800, the object
replacement character U+FFFC, private-use code points, unassigned code points
(including the noncharacters U+FFFE and U+FFFF) and combining marks that have
no base character in the string. None of these names an artifact, and without
them two junk strings such as U+E000 and U+E001 would count as two independent
sources. Visible text in any script, emoji, and visible text wrapped in bidi
controls are accepted, and so is a letter next to any of the characters above
(`'e\u0301'` and `'a\ufffc'` are fine; `'\u0301'` alone is not). Which code
points are unassigned follows the Unicode data of the Node version you run, so
a source made only of a character newer than that data is rejected there.

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
- A value that is not a number (a string, `null`) is `'thin'` too, not a
  `TypeError`: `coverageOf` never throws for a type problem, only for an
  impossible count. `corroborate` throws for a wrong type.
- A negative `sampledUnits`/`totalUnits`, or `sampledUnits` greater than
  `totalUnits`, throws `RangeError` instead of returning `'thin'`: both
  describe an impossible scan (a negative count, or sampling more than the
  pool contains), almost always a caller bug rather than a real thin sample.
- A small pool (`totalUnits <= 30`) with any valid sample, or a high sample
  ratio (`>= 0.6`), is `'strong'` if `hadStructuralReadAccess` is exactly
  `true` (a truthy non-boolean does not count) and `'partial'` if it is not.
  A structural/manifest-level read (a table of contents, a schema, an index)
  independent of the per-unit sample is what promotes these to strong,
  because it answers some questions without needing every unit's body read.
- Any other ratio of `0.15` or more is `'partial'`.
- Anything below `0.15` is `'thin'`.

**The 30-unit cliff.** The small-pool rule looks at the size of the pool, not
the size of the sample. `coverageOf(1, 30, true)` is `'strong'` (one unit out
of thirty, about 3%), while `coverageOf(1, 31, true)` is `'thin'` and
`coverageOf(4, 31, true)` is still `'thin'`. Combined with `corroborate`, a
single unit sampled from a 30-unit pool can therefore reach `'confirmed'`.
That is how the helper is defined, not an accident, but if a tiny sample
should never be trusted in your domain, apply your own floor and pass the
result in, since `corroborate` accepts any `Coverage`:

```ts
const coverage = sampled < 5 ? 'thin' : coverageOf(sampled, total, hadStructuralRead)
```

### `verdictLabel(v: Verdict): string` / `coverageLabel(c: Coverage): string`

Human-readable labels, for display. Both throw `TypeError` for any value
that is not one of the fixed `Verdict` / `Coverage` string literals. That
includes inherited-property names like `'constructor'` or `'__proto__'`, and
values that would only coerce to a valid string, such as `['confirmed']`, a
boxed `new String('confirmed')` or an object with a `toString`.

## Design principles

- **Independence is by origin, not by check or by string.** Counting is the
  number of groups of signals that share an origin, not `signals.length`.
  Folding only ever reduces a count, and lineage you declare is never second-guessed.
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
- **It sees only the lineage it can read or you declare.** Origins come from
  the text of a URL and from `origin` and `derivedFrom`. A mirror under a
  different registered domain, a symlink, a data set that copies another (a
  tracker built from a project's release data, three country files that all
  trace to one standard) and a syndicated wire story look independent unless
  you say otherwise, and the result is then stronger than the evidence. The
  "Why this exists" example (a text-only tool that confirmed all six distorted
  claims in its benchmark because real coverage of the topic satisfied its
  independence check) is a case where the non-textual gate keeps citation count
  from being enough, but a caller still has to supply honestly-distinct sources,
  honest lineage and an honestly-assigned `kind`, or even this design can be
  defeated. Label a topic-level text match `'structural'` and the same failure
  is back.
- **Inference can merge sources that are independent.** The built-in lists are
  short and cannot know every platform. A host on a shared platform that is
  not listed (a new hosting service where each customer has a subdomain), a
  university or company host that carries many authors' personal pages, and a
  vendor's user forum next to the vendor's own site are each counted as one
  origin. That makes a verdict weaker, never stronger. Give each page its own
  `origin` to keep them apart, or pass `{ inferOrigins: false }`.
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
- **Hash-routed pages are one source.** The fragment is dropped on every
  `http(s)://` URL, because a fragment is never sent to a server. For a
  single-page app that routes on the fragment (`#/inbox`, `#!/report/7`), or
  a code host that anchors lines (`#L10`), different pages or lines fold into
  one page, and pages of one host are one origin anyway. If they really are
  separate publications, declare a different `origin` for each.
- **`coverageOf` has a cliff at 30 units.** A pool of 30 or fewer units is
  `'strong'` for any sample with structural read access, so one unit of 30
  can unlock `'confirmed'`. See `coverageOf` above for the exact boundary and a
  caller-side floor.
- **Only the invisible characters listed above are rejected.** A source of
  nothing but lone UTF-16 surrogates or U+FFFD (which draws a visible
  replacement mark) is accepted, so two different strings of that kind can
  count as two sources. Clean such input before calling.
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
