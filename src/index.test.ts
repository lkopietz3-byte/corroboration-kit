import { describe, expect, it } from 'vitest'
import { corroborate, coverageOf, type Coverage, type Signal } from './index.js'

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

describe('corroborate input validation (fails closed instead of grading bad input)', () => {
  const structural: Signal = { source: 'schema', kind: 'structural', vote: 'supports', detail: 'field present' }
  const textual: Signal = { source: 'article', kind: 'textual', vote: 'supports', detail: 'headline matches' }

  // Before validation, any unrecognized kind counted as non-textual, so a
  // typo such as 'Textual' silently unlocked 'confirmed' from text alone.
  it.each(['Textual', 'text', 'TEXTUAL', ' textual', '', '__proto__', 'constructor', 'toString', undefined, null, 7])(
    'rejects unknown kind %j instead of treating it as non-textual',
    (kind) => {
      const bad = { source: 'other', kind, vote: 'supports', detail: 'd' } as unknown as Signal
      expect(() => corroborate([textual, bad], 'strong')).toThrow(TypeError)
      expect(() => corroborate([textual, bad], 'strong')).toThrow(/signals\[1\]\.kind must be one of/)
    },
  )

  // Before validation, an unrecognized vote was ignored, so a typo turned a
  // supporting signal into a silent "not-found".
  it.each(['support', 'Supports', 'SUPPORTS', 'contradict', '', undefined, null, true])(
    'rejects unknown vote %j instead of silently dropping the signal',
    (vote) => {
      const bad = { source: 'other', kind: 'structural', vote, detail: 'd' } as unknown as Signal
      expect(() => corroborate([bad], 'strong')).toThrow(TypeError)
      expect(() => corroborate([bad], 'strong')).toThrow(/signals\[0\]\.vote must be one of/)
    },
  )

  // Before validation, an unrecognized coverage skipped the thin ceiling, so
  // 'Thin' produced 'confirmed' and an empty scan produced 'not-found'.
  it.each(['Thin', 'THIN', 'thin ', 'low', '', 'constructor', undefined, null, 0])(
    'rejects unknown coverage %j instead of skipping the thin ceiling',
    (coverage) => {
      expect(() => corroborate([textual, structural], coverage as unknown as Coverage)).toThrow(TypeError)
      expect(() => corroborate([], coverage as unknown as Coverage)).toThrow(/coverage must be one of/)
    },
  )

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'abc'],
    ['a plain object', { length: 1, 0: structural }],
    ['a number', 3],
  ])('rejects signals that are %s with a clear TypeError', (_name, bad) => {
    expect(() => corroborate(bad as unknown as Signal[], 'strong')).toThrow(TypeError)
    expect(() => corroborate(bad as unknown as Signal[], 'strong')).toThrow(/signals must be an array/)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 1],
  ])('rejects an array entry that is %s and names its index', (_name, bad) => {
    expect(() => corroborate([structural, bad as unknown as Signal], 'strong')).toThrow(/signals\[1\] must be a Signal object/)
  })

  it('rejects a sparse array instead of skipping the hole', () => {
    // A real hole (not an undefined entry): index 1 is never assigned.
    const sparse = new Array<Signal>(2)
    sparse[0] = structural
    expect(() => corroborate(sparse, 'strong')).toThrow(/signals\[1\] must be a Signal object/)
  })

  it.each([undefined, null, 1, {}, ['a']])('rejects a non-string source %j', (source) => {
    const bad = { source, kind: 'structural', vote: 'supports', detail: 'd' } as unknown as Signal
    expect(() => corroborate([bad], 'strong')).toThrow(/signals\[0\]\.source must be a string/)
  })

  it('does not echo an untrusted value at full length in the error', () => {
    const huge = 'x'.repeat(5000)
    const bad = { source: 's', kind: huge, vote: 'supports', detail: 'd' } as unknown as Signal
    let message = ''
    try {
      corroborate([bad], 'strong')
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('signals[0].kind')
    expect(message.length).toBeLessThan(300)
  })

  it('still accepts every valid kind, vote, and coverage', () => {
    for (const kind of ['textual', 'structural', 'behavioral', 'declarative'] as const) {
      for (const vote of ['supports', 'contradicts', 'inconclusive'] as const) {
        for (const coverage of ['strong', 'partial', 'thin'] as const) {
          expect(() => corroborate([{ source: 's', kind, vote, detail: 'd' }], coverage)).not.toThrow()
        }
      }
    }
  })

  it('ignores detail entirely: it is free-form and never affects the grade', () => {
    const odd = { source: 's', kind: 'structural', vote: 'supports', detail: undefined } as unknown as Signal
    expect(corroborate([odd], 'strong').verdict).toBe('likely')
  })
})
