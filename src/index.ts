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
   * of them there are. */
  source: string
  /** The evidence type, assigned by the caller. Only non-'textual' kinds
   * can unlock a 'confirmed' verdict — see the module doc comment. */
  kind: SignalKind
  /** What this signal concluded: for the claim, against it, or neither. */
  vote: Vote
  /** Free-form, human-readable explanation of what this signal found. */
  detail: string
}

/** The result of grading a set of signals. */
export interface Corroboration {
  verdict: Verdict
  coverage: Coverage
  signals: Signal[]
  /** Count of DISTINCT sources that voted 'supports'. */
  supports: number
  /** Count of DISTINCT sources that voted 'contradicts'. */
  contradicts: number
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

/** Human-readable label for a verdict. */
export const verdictLabel = (v: Verdict): string => VERDICT_LABEL[v]

/** Human-readable label for a coverage level. */
export const coverageLabel = (c: Coverage): string => COVERAGE_LABEL[c]

/**
 * Classify how much of a total evidence pool was actually sampled.
 *
 * Generic over what a "unit" is — files in a repo, documents in a corpus,
 * records in a dataset, sources on a topic. The caller decides what counts
 * as one unit and what counts as a "structural" read.
 *
 * @param sampledUnits - how many units were actually examined.
 * @param totalUnits - the size of the full evidence pool. `<= 0` (unknown or
 *   empty pool) is treated as thin: coverage cannot be claimed over a pool
 *   whose size isn't known.
 * @param hadStructuralReadAccess - whether the scan also had access to a
 *   structural/manifest-level view of the pool (a table of contents, a
 *   schema, a directory listing, an index) independent of the per-unit
 *   sample. This can promote a partial sample to strong, because a
 *   structural read answers some questions (what exists, what's declared)
 *   even without reading every unit's body.
 */
export function coverageOf(
  sampledUnits: number,
  totalUnits: number,
  hadStructuralReadAccess: boolean,
): Coverage {
  if (totalUnits <= 0) return 'thin'
  const ratio = sampledUnits / totalUnits
  // A small pool read almost whole, or a high sample ratio, is strong -
  // and a structural read helps even when the per-unit sample is partial.
  if (totalUnits <= 30 || ratio >= 0.6) {
    return hadStructuralReadAccess ? 'strong' : 'partial'
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
 */
export function corroborate(signals: Signal[], coverage: Coverage): Corroboration {
  const distinctSources = (vote: Vote): number =>
    new Set(signals.filter((s) => s.vote === vote).map((s) => s.source)).size

  const supports = distinctSources('supports')
  const contradicts = distinctSources('contradicts')

  const supportingKinds = new Set(
    signals.filter((s) => s.vote === 'supports').map((s) => s.kind),
  )
  const hasNonTextualSupport = [...supportingKinds].some((k) => k !== 'textual')

  let verdict: Verdict

  if (supports > 0 && contradicts > 0) {
    verdict = 'mixed' // real disagreement, surfaced, not blended
  } else if (contradicts > 0) {
    const contradictingKinds = new Set(
      signals.filter((s) => s.vote === 'contradicts').map((s) => s.kind),
    )
    const hasNonTextualContradiction = [...contradictingKinds].some((k) => k !== 'textual')
    verdict = contradicts >= 2 && hasNonTextualContradiction ? 'confirmed' : 'likely'
  } else if (supports === 0) {
    verdict = coverage === 'thin' ? 'inconclusive' : 'not-found'
  } else if (supports >= 2 && hasNonTextualSupport) {
    verdict = 'confirmed'
  } else {
    verdict = 'likely' // one source, or several sources that are all textual
  }

  // Coverage is a ceiling, not an input to averaging: a thin sample can
  // never be reported as "confirmed", no matter how the signals line up.
  if (coverage === 'thin' && verdict === 'confirmed') verdict = 'likely'

  return { verdict, coverage, signals, supports, contradicts }
}
