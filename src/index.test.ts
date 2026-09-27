import { describe, expect, it } from 'vitest'
import { corroborate, coverageLabel, coverageOf, verdictLabel, type Coverage, type Signal, type Verdict } from './index.js'

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

describe('ordering independence', () => {
  // Grading must depend only on the SET of signals, never their array order,
  // since callers assemble signals from independent checks in no fixed order.
  const shuffled = (arr: Signal[], seed: number): Signal[] => {
    const out = [...arr]
    let s = seed
    for (let i = out.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) >>> 0
      const j = s % (i + 1)
      const a = out[i]
      const b = out[j]
      if (a && b) {
        out[i] = b
        out[j] = a
      }
    }
    return out
  }

  it('gives the same verdict and counts for every permutation of one signal set', () => {
    const signals: Signal[] = [
      { source: 'article-a', kind: 'textual', vote: 'supports', detail: 'one' },
      { source: 'schema', kind: 'structural', vote: 'supports', detail: 'two' },
      { source: 'db-record', kind: 'declarative', vote: 'contradicts', detail: 'three' },
      { source: 'article-a', kind: 'textual', vote: 'inconclusive', detail: 'four' },
    ]
    const baseline = corroborate(signals, 'strong')
    for (let seed = 1; seed <= 30; seed++) {
      const permuted = corroborate(shuffled(signals, seed), 'strong')
      expect(permuted.verdict).toBe(baseline.verdict)
      expect(permuted.supports).toBe(baseline.supports)
      expect(permuted.contradicts).toBe(baseline.contradicts)
    }
  })

  it('does not depend on which duplicate-source signal comes first', () => {
    const a: Signal = { source: 'x', kind: 'textual', vote: 'supports', detail: 'first' }
    const b: Signal = { source: 'x', kind: 'structural', vote: 'supports', detail: 'second' }
    expect(corroborate([a, b], 'strong').verdict).toBe(corroborate([b, a], 'strong').verdict)
    expect(corroborate([a, b], 'strong').supports).toBe(1)
  })
})

describe('coverageOf', () => {
  it('treats an unknown or empty pool as thin', () => {
    expect(coverageOf(0, 0, true)).toBe('thin')
  })

  it('rejects a negative totalUnits as impossible input, not a thin sample', () => {
    // Before the fix, a negative totalUnits (e.g. from a subtraction gone
    // wrong upstream) silently graded as 'thin' instead of surfacing the bug.
    expect(() => coverageOf(5, -1, true)).toThrow(RangeError)
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

describe('input is never mutated and the result is a snapshot', () => {
  const build = (): Signal[] => [
    { source: 'b', kind: 'textual', vote: 'supports', detail: 'one' },
    { source: 'a', kind: 'structural', vote: 'supports', detail: 'two' },
    { source: 'a', kind: 'textual', vote: 'inconclusive', detail: 'three' },
  ]

  it('does not modify a deeply frozen input array or its signals', () => {
    const input = build()
    input.forEach((s) => Object.freeze(s))
    Object.freeze(input)
    const before = JSON.stringify(input)
    const result = corroborate(input, 'strong')
    expect(JSON.stringify(input)).toBe(before)
    expect(result.verdict).toBe('confirmed')
  })

  it('returns equal-but-not-identical signals, in input order', () => {
    const input = build()
    const result = corroborate(input, 'strong')
    expect(result.signals).toEqual(input)
    expect(result.signals).not.toBe(input)
    result.signals.forEach((s, i) => expect(s).not.toBe(input[i]))
  })

  // Before this fix result.signals was the caller's own array, so a later
  // push or edit made the result contradict its own counts.
  it('is unaffected by the caller editing the input after grading', () => {
    const input = build()
    const result = corroborate(input, 'strong')
    input.push({ source: 'c', kind: 'behavioral', vote: 'contradicts', detail: 'late' })
    const first = input[0]
    if (first) first.vote = 'contradicts'
    expect(result.signals).toHaveLength(3)
    expect(result.signals[0]?.vote).toBe('supports')
    expect(result.supports).toBe(2)
    expect(result.contradicts).toBe(0)
  })

  it('lets the caller edit the result without touching the input', () => {
    const input = build()
    const result = corroborate(input, 'strong')
    result.signals.pop()
    const first = result.signals[0]
    if (first) first.detail = 'edited'
    expect(input).toHaveLength(3)
    expect(input[0]?.detail).toBe('one')
  })

  it('returns fresh result objects on each call', () => {
    const input = build()
    expect(corroborate(input, 'strong')).not.toBe(corroborate(input, 'strong'))
  })
})

describe('coverageOf boundaries', () => {
  const rank: Record<Coverage, number> = { thin: 0, partial: 1, strong: 2 }

  describe('nothing examined, or nothing known, is thin', () => {
    // Before this fix a small pool with zero units read was rated strong (or
    // partial), and NaN sampled units over a small pool was rated strong.
    it.each([
      [0, 10, true],
      [0, 10, false],
      [0, 30, true],
      [0, 1, true],
      [Number.NaN, 10, true],
      [Number.NaN, 10, false],
      [Number.POSITIVE_INFINITY, 10, true],
      [Number.NEGATIVE_INFINITY, 10, true],
    ])('sampled %s of %s (structural %s) is thin', (sampled, total, structural) => {
      expect(coverageOf(sampled, total, structural)).toBe('thin')
    })

    it.each([
      [5, Number.NaN],
      [5, Number.POSITIVE_INFINITY],
      [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      [0, 0],
    ])('sampled %s of an unknown pool of %s is thin', (sampled, total) => {
      expect(coverageOf(sampled, total, true)).toBe('thin')
      expect(coverageOf(sampled, total, false)).toBe('thin')
    })

    it('treats non-number arguments from untyped callers as thin', () => {
      const loose = coverageOf as (a: unknown, b: unknown, c: unknown) => Coverage
      expect(loose(undefined, 10, true)).toBe('thin')
      expect(loose(null, 10, true)).toBe('thin')
      expect(loose('5', '10', true)).toBe('thin')
      expect(loose(5, undefined, true)).toBe('thin')
    })
  })

  describe('impossible input is rejected, not silently misgraded', () => {
    // Before this fix, sampledUnits > totalUnits (or either being negative)
    // fell through to the ratio math and returned an ordinary-looking
    // coverage value (see git history: coverageOf(500, 100, true) was
    // 'strong'), hiding what is almost always a caller bug — arguments
    // swapped, or a subtraction that went negative upstream.
    it.each([
      [-5, 10],
      [-0.5, 10],
      [10, -5],
      [-1, -1],
      [500, 100],
      [5, 0],
      [1, 0],
    ])('throws RangeError for sampled=%s, total=%s', (sampled, total) => {
      expect(() => coverageOf(sampled, total, true)).toThrow(RangeError)
      expect(() => coverageOf(sampled, total, false)).toThrow(RangeError)
    })

    it('names which argument is the problem', () => {
      expect(() => coverageOf(-5, 10, true)).toThrow(/sampledUnits/)
      expect(() => coverageOf(10, -5, true)).toThrow(/totalUnits/)
      expect(() => coverageOf(500, 100, true)).toThrow(/cannot exceed/)
    })

    it('still treats NaN/Infinity as an unusable (thin) count rather than throwing', () => {
      // These are "no usable count" (isCount rejects them below), not an
      // impossible relationship between two otherwise-real counts.
      expect(coverageOf(Number.NaN, 100, true)).toBe('thin')
      expect(coverageOf(100, Number.NaN, true)).toBe('thin')
      expect(coverageOf(Number.POSITIVE_INFINITY, 100, true)).toBe('thin')
    })
  })

  describe('the 0.15 (partial) and 0.6 (high ratio) thresholds, on a large pool', () => {
    it.each([
      [14, 100, false, 'thin'],
      [15, 100, false, 'partial'],
      [16, 100, false, 'partial'],
      [59, 100, false, 'partial'],
      [60, 100, false, 'partial'],
      [61, 100, false, 'partial'],
      [14, 100, true, 'thin'],
      [15, 100, true, 'partial'],
      [59, 100, true, 'partial'],
      [60, 100, true, 'strong'],
      [61, 100, true, 'strong'],
      [100, 100, true, 'strong'],
    ] as const)('%s of %s, structural %s -> %s', (sampled, total, structural, expected) => {
      expect(coverageOf(sampled, total, structural)).toBe(expected)
    })

    it('never reaches strong without structural read access, even reading everything', () => {
      expect(coverageOf(1000, 1000, false)).toBe('partial')
      expect(coverageOf(300, 300, false)).toBe('partial')
    })

    it('rejects sampling more units than the pool contains', () => {
      expect(() => coverageOf(500, 100, true)).toThrow(RangeError)
      expect(() => coverageOf(500, 100, false)).toThrow(RangeError)
    })
  })

  describe('the 30-unit small-pool rule', () => {
    // Documented, deliberate behavior: for a pool of 30 or fewer units the
    // sample ratio is not consulted, only whether anything was examined. The
    // README calls out that the caller is trusted to have read the pool.
    it('rates any non-empty sample of a pool of exactly 30 by structural access alone', () => {
      expect(coverageOf(30, 30, true)).toBe('strong')
      expect(coverageOf(1, 30, true)).toBe('strong')
      expect(coverageOf(1, 30, false)).toBe('partial')
    })

    it('switches to the ratio rules at 31 units', () => {
      expect(coverageOf(1, 31, true)).toBe('thin')
      expect(coverageOf(4, 31, true)).toBe('thin') // 0.129
      expect(coverageOf(5, 31, true)).toBe('partial') // 0.161
      expect(coverageOf(18, 31, true)).toBe('partial') // 0.581
      expect(coverageOf(19, 31, true)).toBe('strong') // 0.613
    })

    it('handles pools of one unit', () => {
      expect(coverageOf(1, 1, true)).toBe('strong')
      expect(coverageOf(1, 1, false)).toBe('partial')
    })
  })

  describe('structural read access', () => {
    // Before this fix any truthy value promoted coverage, including the
    // string 'false'.
    it.each([['false'], ['true'], [1], [{}], [[]], ['yes']])('does not treat %j as structural access', (flag) => {
      expect(coverageOf(10, 10, flag as unknown as boolean)).toBe('partial')
    })

    it('never lowers coverage', () => {
      for (const total of [1, 5, 30, 31, 100, 1000]) {
        for (const sampled of [0, 1, 2, 5, 15, 30, 60, 100, 600, 1000].filter((s) => s <= total)) {
          expect(rank[coverageOf(sampled, total, true)]).toBeGreaterThanOrEqual(rank[coverageOf(sampled, total, false)])
        }
      }
    })
  })

  it('never lowers coverage as more units are sampled from the same pool', () => {
    for (const structural of [true, false]) {
      for (const total of [1, 2, 10, 30, 31, 32, 99, 100, 101, 400, 1000]) {
        let previous = 0
        // Sampling stops at `total`: sampling more than the pool contains is
        // impossible input and rejected (see 'impossible input' describe
        // block above), not a value to rank on this scale.
        for (let sampled = 0; sampled <= total; sampled++) {
          const now = rank[coverageOf(sampled, total, structural)]
          // Coverage may only stay level or rise as the sample grows.
          expect(now).toBeGreaterThanOrEqual(previous)
          previous = now
        }
      }
    }
  })

  it('is deterministic and returns only the three coverage levels, for every valid sampled/total pair', () => {
    const seen = new Set<Coverage>()
    for (let total = 0; total <= 80; total++) {
      for (let sampled = 0; sampled <= total; sampled++) {
        for (const structural of [true, false]) {
          const first = coverageOf(sampled, total, structural)
          expect(coverageOf(sampled, total, structural)).toBe(first)
          seen.add(first)
        }
      }
    }
    expect([...seen].sort()).toEqual(['partial', 'strong', 'thin'])
  })

  it('deterministically rejects every negative or sampled-exceeds-total pair', () => {
    for (let total = -5; total <= 5; total++) {
      for (let sampled = -5; sampled <= 10; sampled++) {
        if (sampled < 0 || total < 0 || sampled > total) {
          expect(() => coverageOf(sampled, total, true)).toThrow(RangeError)
          expect(() => coverageOf(sampled, total, true)).toThrow(RangeError)
        }
      }
    }
  })

  it('feeds corroborate: a scan of nothing cannot confirm or refute, it is inconclusive', () => {
    const coverage = coverageOf(0, 10, true)
    expect(corroborate([], coverage).verdict).toBe('inconclusive')
  })
})

describe('verdictLabel and coverageLabel', () => {
  it('maps every verdict to its exact display label', () => {
    expect(verdictLabel('confirmed')).toBe('confirmed')
    expect(verdictLabel('likely')).toBe('likely')
    expect(verdictLabel('mixed')).toBe('mixed signals')
    expect(verdictLabel('not-found')).toBe('not found')
    expect(verdictLabel('inconclusive')).toBe('inconclusive')
  })

  it('maps every coverage level to its exact display label', () => {
    expect(coverageLabel('strong')).toBe('strong coverage')
    expect(coverageLabel('partial')).toBe('partial coverage')
    expect(coverageLabel('thin')).toBe('thin coverage')
  })

  it('gives every verdict and every coverage level its own distinct, non-empty label', () => {
    const verdicts: Verdict[] = ['confirmed', 'likely', 'mixed', 'not-found', 'inconclusive']
    const coverages: Coverage[] = ['strong', 'partial', 'thin']
    expect(new Set(verdicts.map(verdictLabel)).size).toBe(verdicts.length)
    expect(new Set(coverages.map(coverageLabel)).size).toBe(coverages.length)
    for (const label of [...verdicts.map(verdictLabel), ...coverages.map(coverageLabel)]) {
      expect(label.length).toBeGreaterThan(0)
    }
  })

  it('has a label for every verdict corroborate can return', () => {
    const seen = new Set<Verdict>()
    const kinds = ['textual', 'structural'] as const
    const votes = ['supports', 'contradicts', 'inconclusive'] as const
    for (const coverage of ['strong', 'partial', 'thin'] as const) {
      for (const [source, kind, vote] of kinds.flatMap((k) => votes.map((v) => ['a', k, v] as const))) {
        for (const [source2, kind2, vote2] of kinds.flatMap((k) => votes.map((v) => ['b', k, v] as const))) {
          const r = corroborate(
            [
              { source, kind, vote, detail: 'd' },
              { source: source2, kind: kind2, vote: vote2, detail: 'd' },
            ],
            coverage,
          )
          seen.add(r.verdict)
          expect(typeof verdictLabel(r.verdict)).toBe('string')
        }
      }
    }
    expect([...seen].sort()).toEqual(['confirmed', 'inconclusive', 'likely', 'mixed', 'not-found'])
  })

  // Before this fix these returned an inherited function or object instead
  // of a string, and 'bogus' returned undefined.
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'bogus', 'Confirmed', ''])(
    'throws a TypeError for the unknown value %j rather than returning a non-label',
    (value) => {
      expect(() => verdictLabel(value as Verdict)).toThrow(TypeError)
      expect(() => coverageLabel(value as Coverage)).toThrow(TypeError)
      expect(() => verdictLabel(value as Verdict)).toThrow(/unknown verdict/)
      expect(() => coverageLabel(value as Coverage)).toThrow(/unknown coverage/)
    },
  )

  it.each([[undefined], [null], [3], [{}]])('throws a TypeError for non-string %j', (value) => {
    expect(() => verdictLabel(value as Verdict)).toThrow(TypeError)
    expect(() => coverageLabel(value as Coverage)).toThrow(TypeError)
  })
})
