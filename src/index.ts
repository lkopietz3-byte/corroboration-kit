// corroboration-kit — a domain-agnostic evidence-corroboration grader.
//
// The core idea: a claim is not "confirmed" because one check happened to
// match. It is graded by how many INDEPENDENT sources actually agree, what
// TYPE of evidence they are, and how much of the total evidence pool was
// even looked at. Concretely:
//
//   - Independence is counted by distinct SOURCE ARTIFACT, never by number of
//     checks run. Two text matches against the same document are one signal.
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
   * not made only of whitespace, control characters or invisible formatting
   * characters. `corroborate` throws `TypeError` otherwise. */
  source: string
  /** The evidence type, assigned by the caller. Only non-'textual' kinds
   * can unlock a 'confirmed' verdict — see the module doc comment. */
  kind: SignalKind
  /** What this signal concluded: for the claim, against it, or neither. */
  vote: Vote
  /** Free-form, human-readable explanation of what this signal found. It is
   * never validated or graded; `corroborate` copies it as read. */
  detail: string
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
  /** Count of DISTINCT sources that voted 'supports'. */
  supports: number
  /** Count of DISTINCT sources that voted 'contradicts'. */
  contradicts: number
}

const SIGNAL_KINDS: readonly SignalKind[] = ['textual', 'structural', 'behavioral', 'declarative']
const VOTES: readonly Vote[] = ['supports', 'contradicts', 'inconclusive']
const COVERAGES: readonly Coverage[] = ['strong', 'partial', 'thin']

// A value that "shows nothing" to a reader: only whitespace, control
// characters and Default_Ignorable_Code_Point characters (zero-width spaces
// and joiners, the soft hyphen, the word joiner, every bidi control such as
// U+061C and U+2066-2069, variation selectors, Hangul fillers). String.trim
// alone misses the ignorable ones. Visible text in any script, emoji, and
// visible text wrapped in bidi controls all still count as present.
const BLANK = /^[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cc}]*$/u

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

const SIGNAL_FIELDS = ['source', 'kind', 'vote', 'detail'] as const

/**
 * Copy one caller signal, reading each of its fields exactly once.
 *
 * The spread reads every own enumerable field once (a getter runs once). A
 * field the spread did not reach, an inherited one or a non-enumerable own
 * one, is read once here and stored on the copy as plain data. The three
 * required fields are always stored, so validation reads only the copy's own
 * properties and never the prototype chain. `detail` is stored only when it
 * has a value, so a signal without one does not gain an `undefined` field.
 */
function snapshotSignal(raw: object): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...raw }
  for (const field of SIGNAL_FIELDS) {
    if (Object.hasOwn(copy, field)) continue
    const value: unknown = (raw as Record<string, unknown>)[field]
    // defineProperty, not assignment: an assignment would run a setter (or hit
    // a read-only property) that someone put on Object.prototype.
    if (value !== undefined || field !== 'detail') {
      Object.defineProperty(copy, field, { value, writable: true, enumerable: true, configurable: true })
    }
  }
  return copy
}

/** Throw a TypeError unless the snapshotted signal at `index` is well formed. */
function assertValidSignal(copy: Record<string, unknown>, index: number): void {
  const { source, kind, vote } = copy
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
// version and in browsers; declare only the two members used below.
declare const URL: new (input: string) => { hash: string; readonly href: string }

/**
 * The identity a `source` string is counted under.
 *
 * Only differences that cannot change WHICH artifact is meant are folded:
 * surrounding whitespace, Unicode canonical equivalence (NFC vs NFD, which
 * differ between operating systems' file names), and, for http(s) URLs, the
 * fragment, the case of scheme and host, an explicit default port, and dot
 * segments (all via the WHATWG URL parser). A fragment is never sent to the
 * server, so `https://a.example/doc#s1` and `https://a.example/doc#s2` are one
 * page.
 *
 * Everything else stays distinct, because it can name a different artifact:
 * path case, a trailing slash, a query string, and any non-http(s) string.
 * Under-merging errs toward a false "independent", so callers who know two
 * spellings name the same artifact should canonicalize before calling.
 */
function sourceKey(source: string): string {
  const text = source.trim().normalize('NFC')
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text)
      url.hash = ''
      return url.href
    } catch {
      // Not a parseable URL after all: fall through and use the trimmed text.
    }
  }
  return text
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
 * @returns 'thin' below a 0.15 sample ratio (or on an unusable count — NaN,
 *   Infinity, zero, or a non-number), 'partial' from 0.15 up, and 'strong' at
 *   or above 0.6 (or for any non-empty sample of a pool of 30 or fewer units)
 *   but only with `hadStructuralReadAccess`.
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
 * Rules, in the order they're applied:
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
 * Independence is counted by `source`, not by array length: two `Signal`s
 * with the same `source` (after folding whitespace, Unicode normalization,
 * and — for http(s) URLs — the fragment, scheme/host case, default port and
 * dot segments) count as one. Grading does not depend on the order of
 * `signals`, and neither the input array nor its objects are modified.
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
 * @returns the verdict, its direction, the counted distinct sources, and the
 *   snapshot of `signals` that was graded.
 * @throws {TypeError} if `signals` is not an array of valid `Signal` objects
 *   (a hole in the array; a non-object element; a non-string `source`, or one
 *   that is empty or shows nothing: whitespace, control and invisible
 *   formatting characters only; an unrecognized `kind` or `vote`) or
 *   `coverage` is not `'strong' | 'partial' | 'thin'`. `detail` is never
 *   validated. This is a deliberate fail-closed check: a value the type
 *   system would have rejected (e.g. from an untyped caller or a bad cast)
 *   must not be silently misgraded. Error messages escape control and bidi
 *   characters and never call into the offending value.
 */
export function corroborate(signals: Signal[], coverage: Coverage): Corroboration {
  // One read of everything the caller gave us. From here on nothing touches
  // `signals` or its objects again: the same copies are validated, counted and
  // returned, so a getter or proxy that answers differently on a later read
  // cannot make the verdict disagree with the evidence in the result.
  const snapshot = snapshotAndValidate(signals, coverage)
  // Distinct artifacts per vote, and whether any signal on that side is
  // non-textual. Keys are strings in a Set, so '__proto__' is an ordinary id.
  const supporting = new Set<string>()
  const contradicting = new Set<string>()
  let nonTextualSupport = false
  let nonTextualContradiction = false
  for (const s of snapshot) {
    if (s.vote === 'supports') {
      supporting.add(sourceKey(s.source))
      if (s.kind !== 'textual') nonTextualSupport = true
    } else if (s.vote === 'contradicts') {
      contradicting.add(sourceKey(s.source))
      if (s.kind !== 'textual') nonTextualContradiction = true
    }
  }
  const supports = supporting.size
  const contradicts = contradicting.size

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

  return { verdict, direction, coverage, signals: snapshot, supports, contradicts }
}
