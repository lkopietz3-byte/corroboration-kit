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

describe('source identity: one artifact counts once however it is spelled', () => {
  // Grade one textual and one structural supporting signal from two source
  // strings and report how many distinct artifacts the kit saw. If the two
  // strings are one artifact the bar is not met ('likely'); if they are two,
  // the pair confirms.
  const countFor = (a: string, b: string) => {
    const result = corroborate(
      [
        { source: a, kind: 'textual', vote: 'supports', detail: 'first read' },
        { source: b, kind: 'structural', vote: 'supports', detail: 'second read' },
      ],
      'strong',
    )
    return { supports: result.supports, verdict: result.verdict }
  }
  const same = { supports: 1, verdict: 'likely' }
  const different = { supports: 2, verdict: 'confirmed' }

  describe('folded: differences that cannot change which artifact is meant', () => {
    // Before this fix every one of these pairs counted as two independent
    // sources, so a second citation of the same artifact could confirm a claim.
    it.each([
      ['trailing space', 'doc.md', 'doc.md '],
      ['leading space', 'doc.md', ' doc.md'],
      ['tab and newline', 'doc.md', '\tdoc.md\n'],
      ['non-breaking space', 'doc.md', ' doc.md '],
      ['NFC vs NFD (macOS file names)', 'café.md', 'café.md'],
      ['URL fragment', 'https://a.example/x', 'https://a.example/x#s2'],
      ['two different fragments', 'https://a.example/x#a', 'https://a.example/x#b'],
      ['empty fragment', 'https://a.example/x', 'https://a.example/x#'],
      ['fragment on a URL with a query', 'https://a.example/x?a=1#f', 'https://a.example/x?a=1'],
      ['scheme and host case', 'https://a.example/x', 'HTTPS://A.EXAMPLE/x'],
      ['bare host and host with slash', 'https://a.example', 'https://a.example/'],
      ['explicit default port', 'https://a.example:443/x', 'https://a.example/x'],
      ['dot segments', 'https://a.example/a/../x', 'https://a.example/x'],
      ['space vs %20 in the path', 'https://a.example/a b', 'https://a.example/a%20b'],
      ['whitespace around a URL with a fragment', '  https://a.example/x#f  ', 'https://a.example/x'],
    ])('%s', (_name, a, b) => {
      expect(countFor(a, b)).toEqual(same)
    })
  })

  describe('kept distinct: differences that can name a different artifact', () => {
    // These pin the other side of the line. Under-merging is the unsafe
    // direction, so the README tells callers to canonicalize these themselves.
    it.each([
      ['path case (paths and ids are case-sensitive)', 'https://a.example/X', 'https://a.example/x'],
      ['file name case', 'Doc.md', 'doc.md'],
      ['trailing slash on a path', 'https://a.example/x', 'https://a.example/x/'],
      ['query string present vs absent', 'https://a.example/x', 'https://a.example/x?a=1'],
      ['different query values', 'https://a.example/x?a=1', 'https://a.example/x?a=2'],
      ['http vs https', 'http://a.example/x', 'https://a.example/x'],
      ['www vs bare host', 'https://a.example/x', 'https://www.a.example/x'],
      ['userinfo in the URL', 'https://user@a.example/x', 'https://a.example/x'],
      ['fragment on a non-http(s) scheme', 'file:///a#x', 'file:///a'],
      ['fragment on a non-URL id', 'db-row#1', 'db-row'],
      ['internal whitespace', 'a b', 'a  b'],
      ['different files', 'a.md', 'b.md'],
    ])('%s', (_name, a, b) => {
      expect(countFor(a, b)).toEqual(different)
    })
  })

  it('folds identity for contradicting sources the same way', () => {
    const result = corroborate(
      [
        { source: 'https://a.example/x', kind: 'textual', vote: 'contradicts', detail: 'd' },
        { source: 'https://a.example/x#s2', kind: 'structural', vote: 'contradicts', detail: 'd' },
      ],
      'strong',
    )
    expect(result.contradicts).toBe(1)
    expect(result.verdict).toBe('likely')
  })

  it('reports the caller\'s original source strings untouched in result.signals', () => {
    const result = corroborate(
      [{ source: '  https://A.example/x#f ', kind: 'structural', vote: 'supports', detail: 'd' }],
      'strong',
    )
    expect(result.signals[0]?.source).toBe('  https://A.example/x#f ')
  })

  it('treats a string that only looks like a URL as plain text when it does not parse', () => {
    expect(countFor('https://', 'https://#')).toEqual(different)
  })

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf'])(
    'treats %j as an ordinary source id',
    (id) => {
      expect(countFor(id, 'other')).toEqual(different)
      expect(countFor(id, id)).toEqual(same)
    },
  )

  it('handles very long and non-ASCII source ids', () => {
    expect(countFor('x'.repeat(200_000), 'x'.repeat(200_000) + ' ')).toEqual(same)
    expect(countFor('\u{1F4C4} report', '\u{1F4C4} report ')).toEqual(same)
    // A long http-looking prefix must not make the scheme check slow.
    expect(countFor('h'.repeat(200_000), 'h'.repeat(200_000) + 'x')).toEqual(different)
  })

  // Before this fix '' was accepted, and two empty sources silently merged
  // into one "artifact" while one empty plus one real source counted as two.
  it.each(['', ' ', '\t\n', ' '])('rejects an empty or whitespace-only source %j', (source) => {
    expect(() => countFor(source, 'other')).toThrow(/signals\[0\]\.source must not be empty/)
  })
})
