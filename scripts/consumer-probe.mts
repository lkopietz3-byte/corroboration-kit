// Strict NodeNext TypeScript consumer probe. Compiled (not executed) by
// verify-package.mjs against the package's installed .d.ts files, the way a
// TypeScript consumer's own build would see them. Every exported type and
// function is used here in a way that only compiles if its public shape
// matches this file's assumptions.
import {
  corroborate,
  coverageOf,
  coverageLabel,
  verdictLabel,
  type Coverage,
  type Corroboration,
  type Direction,
  type Signal,
  type SignalKind,
  type Vote,
  type Verdict,
} from 'corroboration-kit'

const kinds: SignalKind[] = ['textual', 'structural', 'behavioral', 'declarative']
const votes: Vote[] = ['supports', 'contradicts', 'inconclusive']

const signals: Signal[] = [
  { source: 'https://example.com/a', kind: kinds[0], vote: votes[0], detail: 'd1' },
  { source: 'schema.json', kind: kinds[1], vote: votes[0], detail: 'd2' },
]

const coverage: Coverage = coverageOf(20, 40, true)
const result: Corroboration = corroborate(signals, coverage)

// The public shape of Corroboration must expose exactly these fields with
// these types; a change here would fail to compile against the real .d.ts.
const verdict: Verdict = result.verdict
const direction: Direction = result.direction
const echoedCoverage: Coverage = result.coverage
const graded: Signal[] = result.signals
const supports: number = result.supports
const contradicts: number = result.contradicts

const verdictText: string = verdictLabel(verdict)
const coverageText: string = coverageLabel(echoedCoverage)

// A type-level check that Signal['source'] is exactly string (not `string |
// undefined`), which matters for exactOptionalPropertyTypes consumers.
const firstSource: string = graded[0]?.source ?? verdictText

// Reference every value so an unused-variable strict check cannot fail this
// probe for a reason unrelated to the package's public types.
void [coverage, verdict, direction, echoedCoverage, supports, contradicts, coverageText, firstSource]
