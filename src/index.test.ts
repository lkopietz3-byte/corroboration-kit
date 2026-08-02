import { describe, expect, it } from 'vitest'
import { corroborate, coverageOf, type Signal } from './index.js'

describe('corroborate', () => {
  it('does NOT confirm two textual-only supporting signals from different sources', () => {
    const signals: Signal[] = [
      { source: 'article-a', kind: 'textual', vote: 'supports', detail: 'headline matches' },
      { source: 'article-b', kind: 'textual', vote: 'supports', detail: 'headline matches' },
    ]
    const result = corroborate(signals, 'strong')
    expect(result.supports).toBe(2)
    expect(result.verdict).toBe('likely')
    expect(result.verdict).not.toBe('confirmed')
  })

  it('confirms one textual + one structural supporting signal', () => {
    const signals: Signal[] = [
      { source: 'article-a', kind: 'textual', vote: 'supports', detail: 'headline matches' },
      { source: 'schema-dump', kind: 'structural', vote: 'supports', detail: 'field present in schema' },
    ]
    const result = corroborate(signals, 'strong')
    expect(result.supports).toBe(2)
    expect(result.verdict).toBe('confirmed')
  })

  it('caps an otherwise-confirmed signal set to likely under thin coverage', () => {
    const signals: Signal[] = [
      { source: 'article-a', kind: 'textual', vote: 'supports', detail: 'headline matches' },
      { source: 'schema-dump', kind: 'structural', vote: 'supports', detail: 'field present in schema' },
    ]
    const strongResult = corroborate(signals, 'strong')
    expect(strongResult.verdict).toBe('confirmed')

    const thinResult = corroborate(signals, 'thin')
    expect(thinResult.supports).toBe(2)
    expect(thinResult.verdict).toBe('likely')
  })

  it('surfaces a genuine contradiction as mixed, not averaged', () => {
    const signals: Signal[] = [
      { source: 'article-a', kind: 'textual', vote: 'supports', detail: 'reports the claim' },
      { source: 'db-record', kind: 'structural', vote: 'contradicts', detail: 'record disagrees' },
    ]
    const result = corroborate(signals, 'strong')
    expect(result.supports).toBe(1)
    expect(result.contradicts).toBe(1)
    expect(result.verdict).toBe('mixed')
  })

  it('returns inconclusive, not not-found, for zero signals under thin coverage', () => {
    const result = corroborate([], 'thin')
    expect(result.supports).toBe(0)
    expect(result.contradicts).toBe(0)
    expect(result.verdict).toBe('inconclusive')
  })

  it('returns not-found for zero signals under adequate coverage', () => {
    const result = corroborate([], 'strong')
    expect(result.verdict).toBe('not-found')
  })

  it('counts repeated checks against the same source as one signal', () => {
    const signals: Signal[] = [
      { source: 'file.ts', kind: 'textual', vote: 'supports', detail: 'grep 1 matched' },
      { source: 'file.ts', kind: 'textual', vote: 'supports', detail: 'grep 2 matched' },
      { source: 'file.ts', kind: 'declarative', vote: 'supports', detail: 'config value matched too' },
    ]
    const result = corroborate(signals, 'strong')
    // all three signals share one source artifact, so this is ONE distinct
    // supporting source, not three - nowhere near the 2-source bar.
    expect(result.supports).toBe(1)
    expect(result.verdict).toBe('likely')
  })

  it('requires a non-textual signal for a confirmed-bad verdict, symmetrically', () => {
    const textOnlyContradictions: Signal[] = [
      { source: 'article-a', kind: 'textual', vote: 'contradicts', detail: 'disputes the claim' },
      { source: 'article-b', kind: 'textual', vote: 'contradicts', detail: 'disputes the claim' },
    ]
    const textOnly = corroborate(textOnlyContradictions, 'strong')
    expect(textOnly.contradicts).toBe(2)
    expect(textOnly.verdict).toBe('likely')

    const withNonTextual: Signal[] = [
      ...textOnlyContradictions,
      { source: 'live-behavior', kind: 'behavioral', vote: 'contradicts', detail: 'observed the opposite' },
    ]
    const confirmed = corroborate(withNonTextual, 'strong')
    expect(confirmed.contradicts).toBe(3)
    expect(confirmed.verdict).toBe('confirmed')
  })
})

describe('coverageOf', () => {
  it('treats an unknown or empty pool as thin', () => {
    expect(coverageOf(0, 0, true)).toBe('thin')
    expect(coverageOf(5, -1, true)).toBe('thin')
  })

  it('rates a small pool sampled almost whole as strong only with structural access', () => {
    expect(coverageOf(20, 25, true)).toBe('strong')
    expect(coverageOf(20, 25, false)).toBe('partial')
  })

  it('rates a low sample ratio over a large pool as thin', () => {
    expect(coverageOf(5, 500, false)).toBe('thin')
  })

  it('rates a mid sample ratio as partial', () => {
    expect(coverageOf(50, 250, false)).toBe('partial')
  })
})
