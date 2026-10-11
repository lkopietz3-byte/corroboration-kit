// corroboration-kit — a domain-agnostic evidence-corroboration grader.
//
// The core idea: a claim is not "confirmed" because one check happened to
// match. It is graded by how many INDEPENDENT sources actually agree, what
// TYPE of evidence they are, and how much of the total evidence pool was
// even looked at. Concretely:
//
//   - Independence is counted by distinct ORIGIN, never by number of checks
//     run or strings written. Two text matches against the same document are
//     one signal, and so are two pages of one site, two files of one repository
//     and two copies that declare the same upstream. The caller can declare
//     lineage (`origin`, `derivedFrom`); URL origins are inferred offline.
//   - "confirmed" is unreachable on textual signals alone — it requires at
//     least one NON-TEXTUAL signal (structural, behavioral, or declarative),
//     because text that merely repeats is trivially gamed by anything that
//     gets repeated. See README.md for a real, cited example of this failure.
//   - The same bar is symmetric for the negative case: a confirmed CONTRADICTION
//     also needs a non-textual signal, or it is downgraded to "likely".
//   - Disagreement among signals is surfaced as "mixed", never averaged away.
//   - The result says which way the counted evidence points (`direction`),
//     because "confirmed" is also reachable on the contradicting side: a
//     confirmed verdict with direction "contradicts" means the evidence
//     confirms the claim is FALSE.
//   - A null result is "not-found" only under adequate coverage. Under thin
//     coverage it is "inconclusive" — you cannot prove a negative from a
//     small sample of a large pool.
//   - Coverage is a ceiling on confidence, never additive: a scan that only
//     sampled a sliver of the evidence pool cannot land on "confirmed" no
//     matter how the signals it did find line up.

/** The evidence type a signal carries, caller-assigned per signal.
 * "textual" means a text/keyword/pattern match — the kind of signal that is
 * cheap to produce and cheap to fake by repetition. The other three kinds
 * are non-textual: some form of structural, behavioral, or declarative
 * observation that cannot be satisfied by mere repeated text. */
export type SignalKind = 'textual' | 'structural' | 'behavioral' | 'declarative'

/** What a single signal concluded about the claim under evaluation. */
export type Vote = 'supports' | 'contradicts' | 'inconclusive'

/** How much of the total evidence pool was actually sampled to produce the
 * signals being graded. This is not a property of any one signal — it
 * describes the scan as a whole, and it caps the verdict `corroborate` can
 * reach. See `coverageOf` for one way to derive it. */
export type Coverage = 'strong' | 'partial' | 'thin'

/** The final grade `corroborate` assigns to a claim. */
export type Verdict = 'confirmed' | 'likely' | 'mixed' | 'not-found' | 'inconclusive'

/** Which way the counted evidence points, independent of how strong the
 * verdict is. `'supports'` and `'contradicts'` mean sources voted only that
 * way, `'mixed'` means sources voted both ways, and `'none'` means no source
 * voted either way (inconclusive votes are not counted). */
export type Direction = 'supports' | 'contradicts' | 'mixed' | 'none'

/** One piece of evidence bearing on a claim.
 *
 * `source` is the distinct artifact this signal was read from — a document
 * id, a URL, a file path, a database table, an API response, a sampled
 * record. Independence in `corroborate` is counted by how many DISTINCT
 * `source` values back a vote, not by how many `Signal` objects exist, so
 * two signals sharing the same `source` only ever count once.
 */
export interface Signal {
  /** The distinct source artifact this signal was read from. Two signals
   * with the same `source` count as ONE independent source, however many
   * of them there are. Must be a string that shows something: not empty and
   * not made only of whitespace, control characters, invisible formatting
   * characters, the braille blank, U+FFFC, private-use or unassigned code
   * points, or combining marks with no base. `corroborate` throws `TypeError`
   * otherwise. */
  source: string
  /** The evidence type, assigned by the caller. Only non-'textual' kinds
   * can unlock a 'confirmed' verdict — see the module doc comment. */
  kind: SignalKind
  /** What this signal concluded: for the claim, against it, or neither. */
  vote: Vote
  /** Free-form, human-readable explanation of what this signal found. It is
   * never validated or graded; `corroborate` copies it as read. */
  detail: string
  /** Optional. The origin this source belongs to, in your own words (a
   * publisher, a repository, a dataset, an author). Signals that declare the
   * same origin count as ONE source, whatever their `source` strings say.
   * When a signal declares an origin, no origin is inferred from its URL, so
   * this is also how to keep two pages of one host apart. Compared after
   * trimming and Unicode NFC, exactly otherwise (case matters). A URL is
   * read with the same rules as a `source` URL. Must be a string that shows
   * something, like `source`; `corroborate` throws `TypeError` otherwise. */
  origin?: string | undefined
  /** Optional. The upstream origins or sources this one was copied or derived
   * from. Every entry is read like `origin` (a label or a URL), and also
   * matches any signal whose `source` is that entry. Signals that share an
   * upstream, and a copy together with the signal it was derived from, count
   * as ONE source. `corroborate` throws `TypeError` unless this is an array of
   * strings that each show something. */
  derivedFrom?: readonly string[] | undefined
}

/** Why sources were counted together. */
export type MergeRule =
  /** Spellings of one page: surrounding whitespace, Unicode form, a URL fragment, host case, and so on. */
  | 'same-page'
  /** The signals declared the same `origin`. */
  | 'declared-origin'
  /** The signals share a `derivedFrom` upstream, or one was derived from the other's source. */
  | 'derived-from'
  /** URLs into one repository on a code host (github.com, gitlab.com, bitbucket.org, codeberg.org). */
  | 'same-repo'
  /** URLs on one host, once the prefixes www, m, mobile, amp, docs, blog and api are ignored. */
  | 'same-site'
  /** URLs on hosts that share one registered domain, judged without a public-suffix list. */
  | 'same-domain'

/** One reason the sources of a group were counted as one. */
export interface SourceMerge {
  rule: MergeRule
  /** The shared identity: the repository (`github.com/acme/release`), the host, the registered domain, the declared origin or upstream text, or the normalized page. */
  key: string
  /** The distinct `source` strings, as given, that this reason joins. Two or more. */
  sources: string[]
  /** One plain sentence saying why. Control and bidi characters in `source` text are escaped. */
  explanation: string
}

/** One counted source: every signal on one side that shares an origin. */
export interface SourceGroup {
  /** Which vote these signals cast. A group never mixes sides. */
  side: 'supports' | 'contradicts'
  /** The first `source` string of the group, as given. */
  source: string
  /** Every distinct `source` string in the group, as given, in first-seen order. */
  sources: string[]
  /** Indexes into `Corroboration.signals` of the signals in this group. */
  signals: number[]
  /** Why more than one source string was counted as one. Empty when the group is a single source string. */
  merges: SourceMerge[]
}

/** Options for `corroborate`. */
export interface CorroborateOptions {
  /** Infer an origin from each `http(s)` URL: the repository on a code host,
   * otherwise the site (the host without www, m, mobile, amp, docs, blog and
   * api prefixes) and its registered domain. Default `true`. With `false`,
   * only spelling variants of one page are folded, as in 0.2.x, and only the
   * lineage you declare (`origin`, `derivedFrom`) merges anything else. */
  inferOrigins?: boolean | undefined
}

/** The result of grading a set of signals. */
export interface Corroboration {
  /** The grade `corroborate` assigned. See `corroborate`'s doc comment for
   * exactly how it is derived. Read it together with `direction`: the
   * verdict grades how well the evidence meets the counting rules, not
   * whether the claim is true, and `'confirmed'` can be reached by
   * contradicting evidence. */
  verdict: Verdict
  /** Which way the counted evidence points, derived only from `supports` and
   * `contradicts`: `'supports'` (only supporting sources), `'contradicts'`
   * (only contradicting sources), `'mixed'` (both, which is exactly when
   * `verdict` is `'mixed'`) or `'none'` (neither, so `verdict` is
   * `'not-found'` or `'inconclusive'`). A `'confirmed'` verdict with
   * direction `'contradicts'` means the evidence confirms that the claim is
   * FALSE, not that it is true. */
  direction: Direction
  /** The `coverage` value passed in, echoed back for convenience. */
  coverage: Coverage
  /** The signals that were graded, in the order they were passed. This is a
   * snapshot taken by reading each signal once: it is a different array (and
   * different objects) from whatever was passed to `corroborate`, so mutating
   * either side afterward cannot make a result disagree with the input it was
   * graded from, or vice versa. Each signal is a plain object whose fields
   * (including inherited ones) are ordinary data properties. */
  signals: Signal[]
  /** Count of DISTINCT origins that voted 'supports': the number of
   * `groups` with `side` `'supports'`. */
  supports: number
  /** Count of DISTINCT origins that voted 'contradicts': the number of
   * `groups` with `side` `'contradicts'`. */
  contradicts: number
  /** The counted sources behind `supports` and `contradicts`: which signals
   * were counted together and why. Supporting groups come first, each side in
   * the order of its first signal. Signals that voted `'inconclusive'` are not
   * in any group. A snapshot: changing it changes nothing else. */
  groups: SourceGroup[]
}

const SIGNAL_KINDS: readonly SignalKind[] = ['textual', 'structural', 'behavioral', 'declarative']
const VOTES: readonly Vote[] = ['supports', 'contradicts', 'inconclusive']
const COVERAGES: readonly Coverage[] = ['strong', 'partial', 'thin']

// A value that "shows nothing" to a reader: only whitespace, control
// characters, Default_Ignorable_Code_Point characters (zero-width spaces and
// joiners, the soft hyphen, the word joiner, every bidi control such as
// U+061C and U+2066-2069, variation selectors, Hangul fillers), the rest of
// the Cf format characters (for example the interlinear annotation anchors
// U+FFF9-FFFB), the braille blank U+2800, which has no dots, and four more
// kinds that name no artifact on their own:
//   - U+FFFC, the object replacement character, a placeholder for an embedded
//     object that is not in the text;
//   - private-use code points (Co), which have no standard glyph and render as
//     nothing or as a font-specific box;
//   - unassigned code points (Cn, including the noncharacters), which render
//     as nothing or as a missing-glyph box. Which code points are unassigned
//     follows the Unicode data of the running JavaScript engine;
//   - combining marks (M) with no base character in the string, which render
//     as nothing or as a dotted circle. A mark after a visible character is
//     fine, and a string of marks after invisible characters is still blank.
// String.trim alone misses all of these. Without them two junk strings such as
// U+E000 and U+E001 would count as two independent artifacts. Visible text in
// any script, emoji (including ZWJ sequences), and visible text wrapped in
// bidi controls all still count as present, because one visible character is
// enough.
const BLANK = /^[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{M}\u2800\ufffc]*$/u

// Everything that could end a line, move the cursor, send a terminal escape or
// reorder the text around it when a caller-supplied string is printed:
// C0 and C1 controls and DEL (`\p{Cc}`), U+2028/2029, U+061C, U+200E/F,
// U+202A-202E and U+2066-2069.
const UNSAFE_FOR_DISPLAY = /[\p{Cc}\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu

/** Replace each control or bidi formatting character with a visible `\uXXXX` escape. */
function escapeForDisplay(text: string): string {
  return text.replace(UNSAFE_FOR_DISPLAY, (ch) => `\\u${(ch.codePointAt(0) as number).toString(16).padStart(4, '0')}`)
}

/**
 * Render an untrusted value for an error message without dumping it whole.
 * Never calls into the value (no `toString`, `toJSON` or getters), so building
 * a message cannot throw, and escapes control and bidi characters in strings
 * so a message cannot forge a log line or send a terminal escape.
 */
function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    return escapeForDisplay(JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value))
  }
  if (value === null) return 'null'
  try {
    if (Array.isArray(value)) return 'an array'
  } catch {
    // Array.isArray throws on a revoked Proxy, which is still just an object.
  }
  return typeof value
}

const SIGNAL_FIELDS = ['source', 'kind', 'vote', 'detail', 'origin', 'derivedFrom'] as const
// Fields a signal may leave out. A missing one is not stored as `undefined`.
const OPTIONAL_FIELDS: readonly string[] = ['detail', 'origin', 'derivedFrom']

/**
 * Copy one caller signal, reading each of its fields exactly once.
 *
 * The spread reads every own enumerable field once (a getter runs once). A
 * field the spread did not reach, an inherited one or a non-enumerable own
 * one, is read once here and stored on the copy as plain data. The three
 * required fields are always stored, so validation reads only the copy's own
 * properties and never the prototype chain. `detail`, `origin` and
 * `derivedFrom` are stored only when they have a value, so a signal without
 * one does not gain an `undefined` field.
 */
function snapshotSignal(raw: object): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...raw }
  for (const field of SIGNAL_FIELDS) {
    if (Object.hasOwn(copy, field)) continue
    const value: unknown = (raw as Record<string, unknown>)[field]
    // defineProperty, not assignment: an assignment would run a setter (or hit
    // a read-only property) that someone put on Object.prototype.
    if (value !== undefined || !OPTIONAL_FIELDS.includes(field)) {
      Object.defineProperty(copy, field, { value, writable: true, enumerable: true, configurable: true })
    }
  }
  return copy
}

/** Throw a TypeError unless `value` is a string that shows something. */
function assertLabel(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new TypeError(`corroboration-kit: ${name} must be a string, got ${describeValue(value)}`)
  }
  if (BLANK.test(value)) {
    throw new TypeError(`corroboration-kit: ${name} must not be empty or show nothing (whitespace and invisible characters only)`)
  }
}

/** Throw a TypeError unless the snapshotted signal at `index` is well formed. */
function assertValidSignal(copy: Record<string, unknown>, index: number): void {
  const { source, kind, vote, origin, derivedFrom } = copy
  if (typeof source !== 'string') {
    throw new TypeError(`corroboration-kit: signals[${index}].source must be a string, got ${describeValue(source)}`)
  }
  if (BLANK.test(source)) {
    throw new TypeError(
      `corroboration-kit: signals[${index}].source must not be empty or show nothing (whitespace and invisible characters only); a signal with no identifiable artifact cannot be counted as independent`,
    )
  }
  if (!SIGNAL_KINDS.includes(kind as SignalKind)) {
    throw new TypeError(
      `corroboration-kit: signals[${index}].kind must be one of ${SIGNAL_KINDS.join(', ')}, got ${describeValue(kind)}`,
    )
  }
  if (!VOTES.includes(vote as Vote)) {
    throw new TypeError(
      `corroboration-kit: signals[${index}].vote must be one of ${VOTES.join(', ')}, got ${describeValue(vote)}`,
    )
  }
  // Lineage fails closed too: a malformed value must not quietly mean "no
  // lineage", because that would count a copy as independent.
  if (origin !== undefined) assertLabel(origin, `signals[${index}].origin`)
  if (derivedFrom !== undefined) {
    let isList = false
    try {
      isList = Array.isArray(derivedFrom)
    } catch {
      // A revoked Proxy: not a usable list.
    }
    if (!isList) {
      throw new TypeError(`corroboration-kit: signals[${index}].derivedFrom must be an array of strings, got ${describeValue(derivedFrom)}`)
    }
    const list = derivedFrom as unknown[]
    const length: number = list.length
    const entries: string[] = []
    for (let i = 0; i < length; i++) {
      if (!Object.hasOwn(list, i)) {
        throw new TypeError(`corroboration-kit: signals[${index}].derivedFrom[${i}] must be a string, but the list has a hole there`)
      }
      const entry: unknown = list[i]
      assertLabel(entry, `signals[${index}].derivedFrom[${i}]`)
      entries.push(entry)
    }
    // Replace the caller's list with our copy, so it cannot change later.
    Object.defineProperty(copy, 'derivedFrom', { value: entries, writable: true, enumerable: true, configurable: true })
  }
}

/**
 * Fail closed on input the type system would have rejected, and return the
 * ONE snapshot the rest of `corroborate` works from. Without validation a
 * JavaScript caller (or a cast) could pass `kind: 'Textual'` and have it
 * counted as non-textual, or `coverage: 'Thin'` and skip the thin-coverage
 * ceiling, and get a 'confirmed' verdict out of it.
 *
 * One indexed traversal reads `length` once and each element once, refuses a
 * hole (an inherited index does not fill one), copies each signal with
 * `snapshotSignal`, and validates that copy. Validation, grading and the
 * returned `signals` all use these copies, never the caller's objects again.
 */
function snapshotAndValidate(signals: unknown, coverage: unknown): Signal[] {
  if (!Array.isArray(signals)) {
    throw new TypeError(`corroboration-kit: signals must be an array of Signal objects, got ${describeValue(signals)}`)
  }
  const length: number = signals.length
  const copies: Record<string, unknown>[] = []
  for (let i = 0; i < length; i++) {
    if (!Object.hasOwn(signals, i)) {
      throw new TypeError(`corroboration-kit: signals[${i}] must be a Signal object, but the array has a hole there`)
    }
    const raw: unknown = signals[i]
    if (typeof raw !== 'object' || raw === null) {
      throw new TypeError(`corroboration-kit: signals[${i}] must be a Signal object, got ${describeValue(raw)}`)
    }
    const copy = snapshotSignal(raw)
    assertValidSignal(copy, i)
    copies.push(copy)
  }
  if (!COVERAGES.includes(coverage as Coverage)) {
    throw new TypeError(`corroboration-kit: coverage must be one of ${COVERAGES.join(', ')}, got ${describeValue(coverage)}`)
  }
  return copies as unknown as Signal[]
}

// The build targets ES2022 with no DOM or Node type packages, so the WHATWG
// `URL` global is not declared. It exists at runtime on every supported Node
// version and in browsers; declare only the members used below.
declare const URL: new (input: string) => {
  hash: string
  search: string
  hostname: string
  readonly port: string
  readonly pathname: string
  readonly href: string
}

/** The parts of a parsed `http(s)` URL that origin inference reads. */
interface UrlParts {
  host: string
  port: string
  pathname: string
  search: string
}

interface Parsed {
  /** The artifact identity: what two spellings of one page share. */
  key: string
  /** Set when the text is an `http(s)` URL the parser accepted. */
  url?: UrlParts
}

/** `s` without trailing dots, by a backward scan (a suffix regex retries over long runs). */
function trimTrailingDots(s: string): string {
  let end = s.length
  while (end > 0 && s.charCodeAt(end - 1) === 46) end--
  return end === s.length ? s : s.slice(0, end)
}

const SCHEME_PREFIX = /^[A-Za-z][A-Za-z0-9+.-]*:/

/**
 * Plain file-style ids: fold what cannot change which file is meant on any
 * platform, a run of slashes and a leading `./`. Case, backslashes, `../`,
 * a leading `/` and anything that starts with a scheme are left alone.
 */
function foldPlainPath(text: string): string {
  if (SCHEME_PREFIX.test(text)) return text
  let out = text.includes('//') ? text.replace(/\/{2,}/g, '/') : text
  let i = 0
  while (out.startsWith('./', i)) i += 2
  // A lone "./" would fold to nothing: keep it as written.
  if (i > 0 && i < out.length) out = out.slice(i)
  return out
}

/** Parse once: the artifact identity, plus the URL parts when it is an `http(s)` URL. */
function parseSource(source: string): Parsed {
  const text = source.trim().normalize('NFC')
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      url.hash = ''
      // An empty query still prints a bare "?" in the href; assigning '' clears it.
      if (url.search === '') url.search = ''
      // Drop the DNS root label. Never reduce a host to nothing ("http://./").
      const host = trimTrailingDots(url.hostname)
      if (host !== '' && host !== url.hostname) url.hostname = host
      // The parser keeps the case of escapes it did not write itself.
      const upper = (t: string): string => t.replace(/%[0-9a-f]{2}/gi, (escape) => escape.toUpperCase())
      return {
        key: upper(url.href),
        url: { host: trimTrailingDots(url.hostname), port: url.port, pathname: upper(url.pathname), search: upper(url.search) },
      }
    } catch {
      // Not a parseable URL after all: fall through and use the trimmed text.
    }
  }
  return { key: foldPlainPath(text) }
}

/**
 * The identity a `source` string is counted under.
 *
 * Only differences that cannot change WHICH artifact is meant are folded:
 * surrounding whitespace, Unicode canonical equivalence (NFC vs NFD, which
 * differ between operating systems' file names), and, for http(s) URLs, the
 * fragment, the case of scheme and host, a trailing dot on the host (the DNS
 * root label: `a.example.` is `a.example`), an explicit default port, dot
 * segments, an empty query (`x?` is `x`), and the hex case of percent escapes
 * (`%c3%a9` is `%C3%A9`, RFC 3986 section 2.1). All via the WHATWG URL parser
 * plus those three small steps. A fragment is never sent to the server, so
 * `https://a.example/doc#s1` and `https://a.example/doc#s2` are one page.
 * For anything else that does not start with a scheme (a file path), a run of
 * slashes and a leading `./` are folded: `./src//a.ts` is `src/a.ts`.
 *
 * Everything else stays distinct, because it can name a different artifact:
 * path case, a trailing slash, a query string with content (including the
 * order of its pairs), a non-default port, `%2F` vs `/`, `%41` vs `A`, and
 * any non-http(s) string with a scheme. Whether two DIFFERENT pages belong to
 * one origin is a separate question, answered by `originOf` and the lineage a
 * caller declares.
 *
 * Known limit: dropping the fragment merges hash-routed single-page apps,
 * where `https://app.example/#/a` and `https://app.example/#/b` are different
 * pages. See the README.
 */
function sourceKey(source: string): string {
  return parseSource(source).key
}

// ---------------------------------------------------------------------------
// Origin inference for http(s) URLs. Offline, no public-suffix list. Every list
// below only ever REDUCES the number of counted sources, never raises it, and
// the caller can override all of it by declaring `origin`.
// ---------------------------------------------------------------------------

// Prefixes that name a face of one site, not a different publisher.
// Prefixes that name another face of one page on a page-level site (m.reddit.com,
// old.reddit.com, np.reddit.com, mobile.twitter.com). docs, blog and api are not
// here: on these sites they are separate publications.
const PAGE_PREFIXES: ReadonlySet<string> = new Set(['www', 'm', 'mobile', 'amp', 'old', 'np'])
const SITE_PREFIXES: ReadonlySet<string> = new Set(['www', 'm', 'mobile', 'amp', 'docs', 'blog', 'api'])

// Second-level labels that sit under a two-letter country code (bbc.co.uk,
// acme.com.au): the registered domain then has three labels.
const SECOND_LEVEL: ReadonlySet<string> = new Set([
  'co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne', 'go', 'gob', 'gv', 'mil', 'ltd', 'plc', 'sch', 'nhs', 'gouv', 'asso',
])

// Two-letter country codes that are used as plain top-level domains (one label
// before them is the registered domain). Any OTHER two-letter code with three
// or more labels is treated as unsure, because many of them hand out names
// below regions or cities (city.osaka.jp, city.toronto.on.ca) and no
// public-suffix list is available here: subdomains are then kept separate.
const FLAT_COUNTRY_CODES: ReadonlySet<string> = new Set([
  'de', 'fr', 'nl', 'ch', 'io', 'ai', 'me', 'co', 'tv', 'fm', 'ly', 'gg', 'sh', 'cc', 'ws', 'to', 'so', 'im', 'is', 'ms', 'sc', 'vc', 'la',
  'gl', 'am', 'be', 'at', 'dk', 'fi', 'se', 'ie', 'eu', 'lu', 'li', 'lt', 'lv', 'ee', 'cl', 'ag', 'bz', 'gs', 'tk', 'xyz',
])

// Platforms where one registered domain hosts many unrelated publishers, each
// on its own subdomain. The whole host is the origin, never the registered domain.
const TENANT_SUFFIXES: readonly string[] = [
  'github.io', 'gitlab.io', 'pages.dev', 'workers.dev', 'vercel.app', 'netlify.app', 'herokuapp.com', 'blogspot.com', 'wordpress.com',
  'substack.com', 'tumblr.com', 'wixsite.com', 'weebly.com', 'squarespace.com', 'web.app', 'firebaseapp.com', 'appspot.com',
  'azurewebsites.net', 'azurestaticapps.net', 'cloudfront.net', 'amazonaws.com', 'onrender.com', 'fly.dev', 'glitch.me', 'repl.co',
  'replit.app', 'surge.sh', 'ngrok.io', 'ngrok-free.app', 'trycloudflare.com', 'readthedocs.io', 'gitbook.io', 'notion.site',
  'ghost.io', 'hashnode.dev', 'webflow.io', 'carrd.co', 'godaddysites.com', 'myshopify.com', 'atlassian.net', 'zendesk.com',
  'freshdesk.com', 'statuspage.io', 'sharepoint.com', 'sourceforge.io', 'codeberg.page', 'gitee.io', 'itch.io', 'neocities.org',
  'livejournal.com', 'typepad.com', 'bubbleapps.io', 'framer.app', 'streamlit.app', 'huggingface.co', 'hf.space', 'eu.org',
  'dyndns.org', 'duckdns.org', 'nip.io', 'sslip.io',
]

// Sites where each page is its own publication by its own author, so the page
// (not the host) is the origin: social posts, forum threads, user blogs,
// shared documents, preprints and papers, link shorteners, web archives.
const PAGE_HOSTS: readonly string[] = [
  'medium.com', 'dev.to', 'reddit.com', 'redd.it', 'news.ycombinator.com', 'lobste.rs', 'stackoverflow.com', 'stackexchange.com',
  'superuser.com', 'serverfault.com', 'askubuntu.com', 'mathoverflow.net', 'quora.com', 'x.com', 'twitter.com', 'facebook.com',
  'instagram.com', 'linkedin.com', 'youtube.com', 'youtu.be', 'tiktok.com', 'threads.net', 'bsky.app', 'mastodon.social',
  'archive.org', 'archive.ph', 'archive.is', 'archive.today', 'docs.google.com', 'drive.google.com', 'sites.google.com',
  'groups.google.com', 'notion.so', 'gist.github.com', 'pastebin.com', 'imgur.com', 'flickr.com', 'slideshare.net', 'scribd.com',
  'researchgate.net', 'academia.edu', 'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'doi.org', 'arxiv.org', 'openreview.net',
  'semanticscholar.org', 'biorxiv.org', 'medrxiv.org', 'ssrn.com', 'jstor.org', 'ncbi.nlm.nih.gov', 'europepmc.org', 'zenodo.org',
  'figshare.com', 'osf.io', 'discord.com', 't.me',
]

// Code hosts whose first path segments name the repository.
const GITHUB_RESERVED: ReadonlySet<string> = new Set([
  'features', 'pricing', 'about', 'orgs', 'topics', 'search', 'sponsors', 'marketplace', 'settings', 'login', 'join', 'notifications',
  'explore', 'collections', 'security', 'enterprise', 'apps', 'issues', 'pulls', 'new', 'trending', 'site', 'customer-stories',
  'solutions', 'resources', 'community', 'readme', 'sitemap', 'contact', 'codespaces', 'copilot', 'team', 'education', 'mobile',
  'organizations', 'users', 'teams', 'tags', 'signup', 'sessions', 'github-copilot', 'models', 'premium-support',
])
const GITLAB_RESERVED: ReadonlySet<string> = new Set(['explore', 'users', 'groups', '-', 'help', 'api', 'dashboard', 'admin', 'projects'])
const GITLAB_SUBPAGES: ReadonlySet<string> = new Set([
  'blob', 'tree', 'raw', 'commit', 'commits', 'issues', 'merge_requests', 'pipelines', 'wikis', 'releases', 'tags', 'branches',
  'compare', 'blame', 'jobs', 'snippets', 'badges', 'graphs', 'archive',
])

/** Whether `host` ends in one of `entries` on a label boundary. A bounded backward scan: at most six suffixes are built. */
function hostMatches(host: string, entries: readonly string[]): boolean {
  let end = host.length
  // Entries have at most five labels; look at no more than six suffixes.
  for (let step = 0; step < 6 && end > 0; step++) {
    const dot = host.lastIndexOf('.', end - 1)
    const candidate = dot === -1 ? host : host.slice(dot + 1)
    if (entries.includes(candidate)) return true
    if (dot === -1) return false
    end = dot
  }
  return false
}

/** The first `max` non-empty path segments, lower-cased, by a scan that stops early. */
function firstSegments(pathname: string, max: number): string[] {
  const out: string[] = []
  let start = 0
  const n = pathname.length
  while (out.length < max && start < n) {
    let end = pathname.indexOf('/', start)
    if (end === -1) end = n
    if (end > start) out.push(pathname.slice(start, end).toLowerCase())
    start = end + 1
  }
  return out
}

type Entry = { id: string; rule: MergeRule; label: string }

/** `s` without leading and trailing slashes, by scans from each end. */
function trimSlashes(s: string): string {
  let start = 0
  let end = s.length
  while (start < end && s.charCodeAt(start) === 47) start++
  while (end > start && s.charCodeAt(end - 1) === 47) end--
  return s.slice(start, end)
}

const withoutDotGit = (name: string): string => (name.endsWith('.git') && name.length > 4 ? name.slice(0, -4) : name)

/** The repository an `http(s)` code-host URL points into, as "host/owner/name", or undefined. */
function repoOf(u: UrlParts): string | undefined {
  const bare = u.host.startsWith('www.') ? u.host.slice(4) : u.host
  if (bare === 'github.com' || bare === 'raw.githubusercontent.com' || bare === 'codeload.github.com') {
    const segs = firstSegments(u.pathname, 2)
    const owner = segs[0]
    if (owner === undefined || (bare === 'github.com' && GITHUB_RESERVED.has(owner))) return undefined
    const name = segs[1]
    return name === undefined ? `github.com/${owner}` : `github.com/${owner}/${withoutDotGit(name)}`
  }
  if (bare === 'api.github.com') {
    const segs = firstSegments(u.pathname, 3)
    return segs[0] === 'repos' && segs[1] !== undefined && segs[2] !== undefined ? `github.com/${segs[1]}/${withoutDotGit(segs[2])}` : undefined
  }
  if (bare === 'api.bitbucket.org') {
    const segs = firstSegments(u.pathname, 4)
    return segs[1] === 'repositories' && segs[2] !== undefined && segs[3] !== undefined ? `bitbucket.org/${segs[2]}/${withoutDotGit(segs[3])}` : undefined
  }
  if (bare === 'codeberg.org' && u.pathname.startsWith('/api/v1/repos/')) {
    const segs = firstSegments(u.pathname, 5)
    return segs[3] !== undefined && segs[4] !== undefined ? `codeberg.org/${segs[3]}/${withoutDotGit(segs[4])}` : undefined
  }
  if (bare === 'bitbucket.org' || bare === 'codeberg.org') {
    const segs = firstSegments(u.pathname, 2)
    const owner = segs[0]
    if (owner === undefined) return undefined
    return segs[1] === undefined ? `${bare}/${owner}` : `${bare}/${owner}/${withoutDotGit(segs[1])}`
  }
  if (bare === 'gitlab.com') {
    const segs = firstSegments(u.pathname, 16)
    if (segs[0] === 'api' && segs[1] === 'v4' && segs[2] === 'projects' && segs[3] !== undefined) {
      // The project is named by its escaped path ("group%2Fproj"); a numeric id says nothing about the path.
      let path: string
      try {
        path = decodeURIComponent(segs[3])
      } catch {
        return undefined
      }
      return path.includes('/') ? `gitlab.com/${withoutDotGit(trimSlashes(path))}` : undefined
    }
    if (segs[0] === undefined || GITLAB_RESERVED.has(segs[0])) return undefined
    let cut = segs.indexOf('-')
    if (cut === -1) cut = segs.findIndex((seg, i) => i >= 2 && GITLAB_SUBPAGES.has(seg))
    const parts = cut === -1 ? segs : segs.slice(0, cut)
    if (parts.length === 0) return undefined
    const last = parts.length - 1
    return `gitlab.com/${parts.map((seg, i) => (i === last ? withoutDotGit(seg) : seg)).join('/')}`
  }
  return undefined
}

/** `labels` without leading labels from `prefixes`, never below two labels. */
function stripLabels(labels: string[], prefixes: ReadonlySet<string>): string[] {
  let from = 0
  while (labels.length - from > 2 && prefixes.has(labels[from] as string)) from++
  return from === 0 ? labels : labels.slice(from)
}

const stripPrefixes = (labels: string[]): string[] => stripLabels(labels, SITE_PREFIXES)

/** The registered domain of dotted labels (already prefix-stripped), or undefined when it cannot be judged. */
function registeredDomain(labels: string[]): string | undefined {
  const n = labels.length
  if (n < 2) return undefined
  const tld = labels[n - 1] as string
  const second = labels[n - 2] as string
  if (tld.length === 2 && /^[a-z]{2}$/.test(tld) && n >= 3) {
    if (SECOND_LEVEL.has(second)) return labels.slice(-3).join('.')
    if (!FLAT_COUNTRY_CODES.has(tld)) return undefined
  }
  return labels.slice(-2).join('.')
}

const ARCHIVE_SNAPSHOT = /^\/web\/\d{1,14}[a-z_]{0,4}\/(.+)$/

/** The page a web.archive.org snapshot URL archives, or undefined if this is not a snapshot URL. */
function archivedPage(u: UrlParts): UrlParts | undefined {
  if (u.host !== 'web.archive.org') return undefined
  const match = ARCHIVE_SNAPSHOT.exec(u.pathname)
  if (match === null) return undefined
  // Some archive links collapse "https://" to "https:/".
  const inner = (match[1] as string).replace(/^(https?):\/(?!\/)/i, '$1://') + u.search
  return /^https?:\/\//i.test(inner) ? parseSource(inner).url : undefined
}

/**
 * The origin identities of an `http(s)` URL, most specific first. Two URLs
 * share an origin when they share any one of these ids. A web.archive.org
 * snapshot is read as the page it archives, one level deep.
 */
function classifyUrl(u: UrlParts, archived = false): Entry[] {
  if (!archived) {
    const page = archivedPage(u)
    if (page !== undefined) return classifyUrl(page, true)
  }
  const repo = repoOf(u)
  if (repo !== undefined) return [{ id: `repo:${repo}`, rule: 'same-repo', label: repo }]

  const host = u.host
  // Longer than a valid DNS name, or an empty label: nothing to infer from but the exact host.
  const exact = (): Entry[] => [{ id: `site:${host}`, rule: 'same-site', label: host }]
  if (host.length > 253) return exact()

  // A page-level site: the page is the origin. Port kept, fragment already gone.
  if (hostMatches(host, PAGE_HOSTS)) {
    const bare = host.includes('.') ? stripLabels(host.split('.'), PAGE_PREFIXES).join('.') : host
    const key = `${bare}${u.port === '' ? '' : `:${u.port}`}${u.pathname}${u.search}`
    return [{ id: `page:${key}`, rule: 'same-page', label: key }]
  }

  // An IP address or a one-label host (localhost): the service is the origin, port included.
  const isIp = host.startsWith('[') || /^[0-9.]+$/.test(host)
  if (isIp || !host.includes('.')) {
    const key = `${host}${u.port === '' ? '' : `:${u.port}`}`
    return [{ id: `site:${key}`, rule: 'same-site', label: key }]
  }

  const labels = host.split('.')
  if (labels.includes('')) return exact()
  const stripped = stripPrefixes(labels)
  const site = stripped.join('.')
  const siteEntry: Entry = { id: `site:${site}`, rule: 'same-site', label: site }
  if (hostMatches(site, TENANT_SUFFIXES)) return [siteEntry]
  const registered = registeredDomain(stripped)
  if (registered === undefined) return [siteEntry]
  return [siteEntry, { id: `domain:${registered}`, rule: 'same-domain', label: registered }]
}

/**
 * The origin of a source, as inferred offline from its URL, or `undefined`
 * when the source is not an `http(s)` URL.
 *
 * Returns a prefixed key: `repo:github.com/owner/name` for any URL into one
 * repository on github.com, gitlab.com, bitbucket.org or codeberg.org (and
 * raw.githubusercontent.com, codeload.github.com, api.github.com);
 * `page:...` for sites where each page is its own publication (forum threads,
 * social posts, shared documents, preprints); a web.archive.org snapshot is
 * classified as the page it archives; `site:host` for a shared hosting
 * platform, an IP address or a host whose registered domain cannot be judged
 * without a public-suffix list; otherwise `domain:example.com`, where the
 * prefixes www, m, mobile, amp, docs, blog and api are ignored.
 * Two sources with the same origin count once in `corroborate`.
 *
 * @throws {TypeError} when `source` is not a string.
 */
export function originOf(source: string): string | undefined {
  if (typeof source !== 'string') throw new TypeError(`corroboration-kit: originOf: source must be a string, got ${describeValue(source)}`)
  const parsed = parseSource(source)
  if (parsed.url === undefined) return undefined
  const entries = classifyUrl(parsed.url)
  return (entries[entries.length - 1] as Entry).id
}

/**
 * The artifact identity `corroborate` counts a `source` under: whitespace,
 * Unicode form and the URL spellings listed in the README folded, nothing else.
 * Two sources with the same identity are one page; use `originOf` for the
 * broader question of whether two pages share an origin.
 *
 * @throws {TypeError} when `source` is not a string.
 */
export function sourceIdentity(source: string): string {
  if (typeof source !== 'string') throw new TypeError(`corroboration-kit: sourceIdentity: source must be a string, got ${describeValue(source)}`)
  return sourceKey(source)
}

// ---------------------------------------------------------------------------
// Grouping: which signals on one side count as one source, and why.
// ---------------------------------------------------------------------------

// A reason's weight when several contribute to one shared id: the caller's own
// words beat an inference.
const RULE_STRENGTH: Record<MergeRule, number> = {
  'same-page': 1,
  'same-domain': 2,
  'same-site': 2,
  'same-repo': 3,
  'declared-origin': 4,
  'derived-from': 5,
}
// The order a group lists its reasons in.
const RULE_ORDER: readonly MergeRule[] = ['same-page', 'derived-from', 'declared-origin', 'same-repo', 'same-site', 'same-domain']

/** Identities for a declared origin or an upstream reference. */
function referenceEntries(text: string, rule: 'declared-origin' | 'derived-from', infer: boolean): Entry[] {
  const parsed = parseSource(text)
  const label = text.trim()
  const out: Entry[] = []
  if (infer && parsed.url !== undefined) {
    for (const e of classifyUrl(parsed.url)) out.push({ id: e.id, rule, label })
  } else {
    // A label that is not a URL compares exactly after trim and NFC: no path folding.
    out.push({ id: `label:${parsed.url === undefined ? label.normalize('NFC') : parsed.key}`, rule, label })
  }
  // An upstream can also be named by the exact source it is: match that page.
  if (rule === 'derived-from') out.push({ id: `artifact:${parsed.key}`, rule, label })
  return out
}

/** All identities one counted signal contributes. */
function entriesOf(s: Signal, infer: boolean): Entry[] {
  const parsed = parseSource(s.source)
  const out: Entry[] = [{ id: `artifact:${parsed.key}`, rule: 'same-page', label: parsed.key }]
  if (s.origin !== undefined) {
    out.push(...referenceEntries(s.origin, 'declared-origin', infer))
  } else if (infer && parsed.url !== undefined) {
    out.push(...classifyUrl(parsed.url))
  }
  if (s.derivedFrom !== undefined) {
    for (const upstream of s.derivedFrom) out.push(...referenceEntries(upstream, 'derived-from', infer))
  }
  return out
}

function show(text: string): string {
  return `"${escapeForDisplay(text.length > 60 ? `${text.slice(0, 60)}...` : text)}"`
}

function listOf(sources: readonly string[]): string {
  const shown = sources.slice(0, 3).map(show)
  const rest = sources.length - shown.length
  const joined = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1] as string}` : (shown[0] as string)
  return rest > 0 ? `${joined} and ${rest} more` : joined
}

function explain(rule: MergeRule, label: string, sources: readonly string[]): string {
  const list = listOf(sources)
  switch (rule) {
    case 'same-page':
      return `${list} are spellings of one page.`
    case 'declared-origin':
      return `${list} declare the same origin ${show(label)}.`
    case 'derived-from':
      return `${list} share the upstream ${show(label)}, or one was derived from the other.`
    case 'same-repo':
      return `${list} are in the same repository (${escapeForDisplay(label)}).`
    case 'same-site':
      return `${list} are on the same site (${escapeForDisplay(label)}; the prefixes ${[...SITE_PREFIXES].join(', ')} are ignored).`
    case 'same-domain':
      return `${list} are on the same registered domain (${escapeForDisplay(label)}).`
  }
}

interface IdInfo {
  rule: MergeRule
  label: string
  /** Position (within this side) of the first signal that contributed this identity. */
  first: number
  /** The distinct `source` strings that contributed this identity, first-seen order. */
  members: string[]
  /** The same sources as small numbers (one per distinct string), so no string is compared or hashed again. */
  memberIds: number[]
  /** Built only for a long member list, to keep the duplicate check linear. */
  memberSet?: Set<number>
}

/** Group one side's signals by shared identity, with the reasons. Linear in the total size of the input. */
function groupSide(snapshot: readonly Signal[], side: 'supports' | 'contradicts', infer: boolean): SourceGroup[] {
  const indexes: number[] = []
  for (let i = 0; i < snapshot.length; i++) if ((snapshot[i] as Signal).vote === side) indexes.push(i)
  if (indexes.length === 0) return []

  const parent: number[] = indexes.map((_, k) => k)
  const find = (k: number): number => {
    let root = k
    while (parent[root] !== root) root = parent[root] as number
    while (parent[k] !== root) {
      const next = parent[k] as number
      parent[k] = root
      k = next
    }
    return root
  }
  const info = new Map<string, IdInfo>()
  // One small number per distinct source string, looked up once per signal.
  const sourceNumber = new Map<string, number>()

  for (let k = 0; k < indexes.length; k++) {
    const s = snapshot[indexes[k] as number] as Signal
    let sid = sourceNumber.get(s.source)
    if (sid === undefined) {
      sid = sourceNumber.size
      sourceNumber.set(s.source, sid)
    }
    const entries = entriesOf(s, infer)
    // Most signals have two to four identities; only a long list needs a set to skip repeats.
    const seen = entries.length > 8 ? new Set<string>() : undefined
    for (let j = 0; j < entries.length; j++) {
      const e = entries[j] as Entry
      if (seen !== undefined) {
        if (seen.has(e.id)) continue
        seen.add(e.id)
      } else {
        let repeated = false
        for (let p = 0; p < j; p++) if ((entries[p] as Entry).id === e.id) repeated = true
        if (repeated) continue
      }
      let entry = info.get(e.id)
      if (entry === undefined) {
        entry = { rule: e.rule, label: e.label, first: k, members: [s.source], memberIds: [sid] }
        info.set(e.id, entry)
        continue
      }
      const a = find(k)
      const b = find(entry.first)
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b)
      if (RULE_STRENGTH[e.rule] > RULE_STRENGTH[entry.rule]) {
        entry.rule = e.rule
        entry.label = e.label
      }
      if (entry.memberSet !== undefined) {
        if (!entry.memberSet.has(sid)) {
          entry.memberSet.add(sid)
          entry.members.push(s.source)
          entry.memberIds.push(sid)
        }
      } else if (!entry.memberIds.includes(sid)) {
        entry.members.push(s.source)
        entry.memberIds.push(sid)
        if (entry.memberIds.length > 8) entry.memberSet = new Set(entry.memberIds)
      }
    }
  }

  const groups: SourceGroup[] = []
  const byRoot = new Map<number, SourceGroup>()
  const listed = new Map<number, Set<string>>()
  for (let k = 0; k < indexes.length; k++) {
    const root = find(k)
    const s = snapshot[indexes[k] as number] as Signal
    let group = byRoot.get(root)
    if (group === undefined) {
      group = { side, source: s.source, sources: [], signals: [], merges: [] }
      byRoot.set(root, group)
      listed.set(root, new Set<string>())
      groups.push(group)
    }
    group.signals.push(indexes[k] as number)
    const names = listed.get(root) as Set<string>
    if (!names.has(s.source)) {
      names.add(s.source)
      group.sources.push(s.source)
    }
  }

  // One reason per shared identity, strongest reasons first, none repeated for the same set of sources.
  const candidates: Array<{ root: number; rank: number; first: number; ids: number[]; merge: SourceMerge }> = []
  for (const entry of info.values()) {
    if (entry.members.length < 2) continue
    const root = find(entry.first)
    candidates.push({
      root,
      rank: RULE_ORDER.indexOf(entry.rule),
      first: entry.first,
      ids: entry.memberIds,
      merge: { rule: entry.rule, key: entry.label, sources: [...entry.members], explanation: explain(entry.rule, entry.label, entry.members) },
    })
  }
  candidates.sort((x, y) => x.rank - y.rank || x.first - y.first)
  // Two reasons that join the same set of sources are one reason. Compare small
  // numbers, never the source strings: bucket by (group, size, smallest, largest)
  // and compare sorted number lists only inside a bucket.
  const emitted = new Map<string, number[][]>()
  for (const c of candidates) {
    const sorted = [...c.ids].sort((x, y) => x - y)
    const bucket = `${c.root}:${sorted.length}:${sorted[0] as number}:${sorted[sorted.length - 1] as number}`
    const seenInBucket = emitted.get(bucket)
    if (seenInBucket !== undefined && seenInBucket.some((other) => other.every((v, i) => v === sorted[i]))) continue
    if (seenInBucket === undefined) emitted.set(bucket, [sorted])
    else seenInBucket.push(sorted)
    ;(byRoot.get(c.root) as SourceGroup).merges.push(c.merge)
  }
  return groups
}

/** Read the options once; fail closed on anything that is not a plain options object. */
function readOptions(options: unknown): boolean {
  if (options === undefined) return true
  if (typeof options !== 'object' || options === null || Array.isArray(options)) {
    throw new TypeError(`corroboration-kit: options must be an object, got ${describeValue(options)}`)
  }
  const infer: unknown = (options as Record<string, unknown>).inferOrigins
  if (infer === undefined) return true
  if (typeof infer !== 'boolean') {
    throw new TypeError(`corroboration-kit: options.inferOrigins must be a boolean, got ${describeValue(infer)}`)
  }
  return infer
}

const VERDICT_LABEL: Record<Verdict, string> = {
  confirmed: 'confirmed',
  likely: 'likely',
  mixed: 'mixed signals',
  'not-found': 'not found',
  inconclusive: 'inconclusive',
}

const COVERAGE_LABEL: Record<Coverage, string> = {
  strong: 'strong coverage',
  partial: 'partial coverage',
  thin: 'thin coverage',
}

/**
 * Human-readable label for a verdict, e.g. `'mixed'` -> `'mixed signals'`.
 * @throws {TypeError} for any value other than the five `Verdict` literals,
 *   including a non-string that would coerce to one (`['confirmed']`, a boxed
 *   `String`, an object with a `toString`).
 */
export function verdictLabel(v: Verdict): string {
  // A primitive string first: hasOwn coerces its key, so an array, a boxed
  // string or an object with a toString would otherwise pass as its text.
  // hasOwn, not a bare lookup: 'constructor' or '__proto__' from an untyped
  // caller would otherwise return an inherited function or object.
  if (typeof v !== 'string' || !Object.hasOwn(VERDICT_LABEL, v)) {
    throw new TypeError(`corroboration-kit: unknown verdict ${describeValue(v)}`)
  }
  return VERDICT_LABEL[v]
}

/**
 * Human-readable label for a coverage level, e.g. `'thin'` -> `'thin coverage'`.
 * @throws {TypeError} for any value other than the three `Coverage` literals,
 *   including a non-string that would coerce to one.
 */
export function coverageLabel(c: Coverage): string {
  if (typeof c !== 'string' || !Object.hasOwn(COVERAGE_LABEL, c)) {
    throw new TypeError(`corroboration-kit: unknown coverage ${describeValue(c)}`)
  }
  return COVERAGE_LABEL[c]
}

/**
 * Classify how much of a total evidence pool was actually sampled.
 *
 * Generic over what a "unit" is — files in a repo, documents in a corpus,
 * records in a dataset, sources on a topic. The caller decides what counts
 * as one unit and what counts as a "structural" read.
 *
 * @param sampledUnits - how many units were actually examined. Must be a
 *   finite number greater than 0, or the result is 'thin' — you cannot claim
 *   coverage for a sample that was zero, negative, `NaN`, or infinite.
 * @param totalUnits - the size of the full evidence pool. Same rule: must be
 *   a finite number greater than 0, or the result is 'thin' because coverage
 *   cannot be claimed over a pool whose size isn't known.
 * @param hadStructuralReadAccess - whether the scan also had access to a
 *   structural/manifest-level view of the pool (a table of contents, a
 *   schema, a directory listing, an index) independent of the per-unit
 *   sample. This can promote a partial sample to strong, because a
 *   structural read answers some questions (what exists, what's declared)
 *   even without reading every unit's body. Only the literal boolean `true`
 *   counts; a truthy non-boolean is treated as `false`.
 * @returns 'thin' on an unusable count (NaN, Infinity, zero, or a non-number)
 *   and below a 0.15 sample ratio, except for a pool of 30 or fewer units.
 *   A pool of 30 or fewer units (any sample size), or a ratio of 0.6 or more,
 *   is 'strong' with `hadStructuralReadAccess` and 'partial' without it. Any
 *   other ratio of 0.15 or more is 'partial'.
 *
 *   The 30-unit rule looks at the pool, not the sample: 1 of 30 with
 *   structural access is 'strong' (about 3%), while 1 of 31 is 'thin'. A
 *   caller who never wants a tiny sample trusted should apply its own floor
 *   and pass the resulting `Coverage` to `corroborate`.
 * @throws {RangeError} if `sampledUnits` or `totalUnits` is a negative finite
 *   number, or if `sampledUnits` is a finite number greater than a finite
 *   `totalUnits`. Both describe an impossible scan (you cannot sample a
 *   negative number of units, or more units than the pool contains) rather
 *   than a legitimately thin one, and are almost always a caller bug —
 *   arguments swapped, or a subtraction that went negative upstream. Failing
 *   loudly here matches `corroborate`'s own fail-closed validation instead of
 *   silently returning a coverage value that looks like ordinary output.
 */
export function coverageOf(
  sampledUnits: number,
  totalUnits: number,
  hadStructuralReadAccess: boolean,
): Coverage {
  // Reject an impossible relationship between two otherwise-real counts
  // before anything else. NaN/Infinity are handled by isCount below instead
  // of here: they mean "no usable count", not "an impossible count" (there's
  // no well-defined comparison between NaN and another number).
  if (Number.isFinite(sampledUnits) && sampledUnits < 0) {
    throw new RangeError(`corroboration-kit: coverageOf: sampledUnits must not be negative, got ${sampledUnits}`)
  }
  if (Number.isFinite(totalUnits) && totalUnits < 0) {
    throw new RangeError(`corroboration-kit: coverageOf: totalUnits must not be negative, got ${totalUnits}`)
  }
  if (Number.isFinite(sampledUnits) && Number.isFinite(totalUnits) && sampledUnits > totalUnits) {
    throw new RangeError(
      `corroboration-kit: coverageOf: sampledUnits (${sampledUnits}) cannot exceed totalUnits (${totalUnits}); ` +
        'you cannot sample more of a pool than it contains',
    )
  }
  // A real, positive, finite count is required on both sides. Number.isFinite
  // rejects NaN, Infinity and non-numbers, which a plain `<= 0` check let
  // through (NaN or 0 sampled over a small pool was rated 'strong'/'partial').
  const isCount = (n: number): boolean => Number.isFinite(n) && n > 0
  if (!isCount(totalUnits) || !isCount(sampledUnits)) return 'thin'
  const ratio = sampledUnits / totalUnits
  // A small pool, or a high sample ratio, is strong - and a structural read
  // helps even when the per-unit sample is partial. Only a literal `true`
  // counts as structural access, so a truthy string cannot promote coverage.
  if (totalUnits <= 30 || ratio >= 0.6) {
    return hadStructuralReadAccess === true ? 'strong' : 'partial'
  }
  if (ratio >= 0.15) return 'partial'
  return 'thin'
}

/**
 * Grade a claim from the signals collected about it.
 *
 * Rules, in the order they're applied (the non-textual signal in rule 4 may
 * come from any counted source on that side, and any one contradicting
 * source, even a textual one, turns a supported claim into 'mixed'):
 * 1. If distinct sources vote both ways, that's real disagreement: 'mixed'.
 *    It is never averaged into a false middle ground.
 * 2. If only contradicting sources exist, the claim's negative case can only
 *    reach a confirmed-bad verdict with 2+ distinct sources AND at least one
 *    non-textual one — the same bar the positive case has to clear. Anything
 *    short of that is 'likely' (contradicted, but not to that bar).
 * 3. If there are no supporting sources at all, the result is a null: under
 *    adequate coverage that's 'not-found'; under thin coverage it is
 *    'inconclusive', because a small sample cannot prove a negative.
 * 4. If there are 2+ distinct supporting sources and at least one is
 *    non-textual, the claim is 'confirmed'.
 * 5. Otherwise (a single source, or several sources that are all textual),
 *    it is 'likely'.
 * 6. Coverage is then applied as a ceiling: 'thin' coverage can never land
 *    on 'confirmed', regardless of how the signals otherwise line up.
 *
 * Independence is counted by ORIGIN, not by array length. Signals count
 * once when they share a `source` (after folding whitespace, Unicode
 * normalization, and, for http(s) URLs, the fragment, scheme/host case, a
 * trailing host dot, default port, dot segments, an empty query and
 * percent-escape hex case), a declared `origin`, a `derivedFrom` upstream, or,
 * unless `options.inferOrigins` is `false`, a repository on a code host, a
 * host (ignoring the prefixes www, m, mobile, amp, docs, blog and api) or a
 * registered domain. `groups` in the result says which signals were counted
 * together and why. Merging only lowers a count, and a declared `origin`
 * replaces the URL inference for its signal. Grading does not depend on the
 * order of `signals`, and neither the input array nor its objects are modified.
 *
 * The input is read once. The array's length and each element are read once,
 * and each signal's fields (own, non-enumerable, inherited, or getter-backed)
 * are read once into a new plain object. Validation, grading and the returned
 * `signals` all use those copies, so a getter or proxy that answers
 * differently on a later read cannot make the verdict disagree with the
 * returned evidence. Extra own enumerable properties are copied shallowly.
 *
 * `direction` in the result reports which way the counted sources point. A
 * `'confirmed'` verdict with direction `'contradicts'` means the evidence
 * confirms the claim is FALSE.
 *
 * @param signals - the evidence collected about the claim. May be empty.
 * @param coverage - how much of the evidence pool these signals were drawn
 *   from, typically from `coverageOf`.
 * @param options - `inferOrigins` (default `true`): set `false` to fold only
 *   spellings of one page and rely on declared lineage for the rest.
 * @returns the verdict, its direction, the counted distinct origins, the
 *   groups that explain them, and the snapshot of `signals` that was graded.
 * @throws {TypeError} if `signals` is not an array of valid `Signal` objects
 *   (a hole in the array; a non-object element; a non-string `source`, or one
 *   that is empty or shows nothing: whitespace, control, invisible
 *   formatting characters, the braille blank, U+FFFC, private-use or
 *   unassigned code points and base-less combining marks only; an
 *   unrecognized `kind` or `vote`; an `origin` or `derivedFrom` entry that is
 *   not such a string, or a `derivedFrom` that is not an array) or
 *   `coverage` is not `'strong' | 'partial' | 'thin'`, or `options` is not an
 *   object with a boolean `inferOrigins`. `detail` is never
 *   validated. This is a deliberate fail-closed check: a value the type
 *   system would have rejected (e.g. from an untyped caller or a bad cast)
 *   must not be silently misgraded. Error messages escape control and bidi
 *   characters and never call into the offending value.
 */
export function corroborate(signals: Signal[], coverage: Coverage, options?: CorroborateOptions): Corroboration {
  // One read of everything the caller gave us. From here on nothing touches
  // `signals` or its objects again: the same copies are validated, counted and
  // returned, so a getter or proxy that answers differently on a later read
  // cannot make the verdict disagree with the evidence in the result.
  const snapshot = snapshotAndValidate(signals, coverage)
  const infer = readOptions(options)
  // Distinct origins per vote, and whether any signal on that side is
  // non-textual. A group is every signal on one side that shares an origin.
  const supportGroups = groupSide(snapshot, 'supports', infer)
  const contradictGroups = groupSide(snapshot, 'contradicts', infer)
  let nonTextualSupport = false
  let nonTextualContradiction = false
  for (const s of snapshot) {
    if (s.kind === 'textual') continue
    if (s.vote === 'supports') nonTextualSupport = true
    else if (s.vote === 'contradicts') nonTextualContradiction = true
  }
  const supports = supportGroups.length
  const contradicts = contradictGroups.length

  let verdict: Verdict

  if (supports > 0 && contradicts > 0) {
    verdict = 'mixed' // real disagreement, surfaced, not blended
  } else if (contradicts > 0) {
    verdict = contradicts >= 2 && nonTextualContradiction ? 'confirmed' : 'likely'
  } else if (supports === 0) {
    verdict = coverage === 'thin' ? 'inconclusive' : 'not-found'
  } else if (supports >= 2 && nonTextualSupport) {
    verdict = 'confirmed'
  } else {
    verdict = 'likely' // one source, or several sources that are all textual
  }

  // Coverage is a ceiling, not an input to averaging: a thin sample can
  // never be reported as "confirmed", no matter how the signals line up.
  if (coverage === 'thin' && verdict === 'confirmed') verdict = 'likely'

  // Derived from the counted sources only, so a 'confirmed' that rests on
  // contradicting evidence is never mistaken for confirmation of the claim.
  const direction: Direction =
    supports > 0 && contradicts > 0 ? 'mixed' : supports > 0 ? 'supports' : contradicts > 0 ? 'contradicts' : 'none'

  return { verdict, direction, coverage, signals: snapshot, supports, contradicts, groups: [...supportGroups, ...contradictGroups] }
}
