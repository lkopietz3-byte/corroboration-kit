import { describe, expect, it } from 'vitest'
import {
  corroborate,
  coverageLabel,
  coverageOf,
  verdictLabel,
  type Corroboration,
  type Coverage,
  type Direction,
  type Signal,
  type SignalKind,
  type Verdict,
  type Vote,
} from './index.js'

const KINDS: readonly SignalKind[] = ['textual', 'structural', 'behavioral', 'declarative']

/** Characters that must never reach a log line or terminal from an error message. */
const UNSAFE = /[\p{Cc}\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/u

const sig = (source: string, kind: SignalKind, vote: Vote): Signal => ({ source, kind, vote, detail: 'd' })

/** The message of the error `fn` throws, or fails the test if it does not throw. */
function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    return (err as Error).message
  }
  throw new Error('expected the call to throw')
}

/**
 * A signal whose `field` is an accessor returning `values` in turn (wrapping
 * around), starting at `start`. `reads()` says how many times it was read.
 */
function accessorSignal(
  field: 'source' | 'kind' | 'vote' | 'detail',
  values: readonly unknown[],
  start = 0,
): { signal: Signal; reads: () => number } {
  let reads = 0
  const target: Record<string, unknown> = { source: 'a', kind: 'structural', vote: 'supports', detail: 'd' }
  Object.defineProperty(target, field, {
    enumerable: true,
    configurable: true,
    get: () => values[(start + reads++) % values.length],
  })
  return { signal: target as unknown as Signal, reads: () => reads }
}

describe('CK-001: each signal is read once, then validated, graded and returned as that snapshot', () => {
  it.each(['source', 'kind', 'vote', 'detail'] as const)('reads the %s field of a signal exactly once', (field) => {
    const { signal, reads } = accessorSignal(field, [{ source: 'a', kind: 'structural', vote: 'supports', detail: 'd' }[field]])
    corroborate([signal, sig('b', 'textual', 'supports')], 'strong')
    expect(reads()).toBe(1)
  })

  // CK-AUD-001a: validation, grading and the copy each used to re-read the getter.
  it.each([0, 1, 2, 3])(
    'a kind getter that changes between reads (start %i) cannot make the result contradict its own signals',
    (start) => {
      const { signal } = accessorSignal('kind', KINDS, start)
      const signals = [signal, sig('b', 'textual', 'supports')]
      const result = corroborate(signals, 'strong')
      // Grading the returned evidence again must give the same answer.
      expect(corroborate(result.signals, 'strong')).toEqual(result)
    },
  )

  // CK-AUD-001b: a later read used to return a value validation never saw.
  it('a getter cannot smuggle an unvalidated kind past validation on a later read', () => {
    const { signal, reads } = accessorSignal('kind', ['textual', 'not-a-kind'])
    const result = corroborate([signal, sig('b', 'textual', 'supports')], 'strong')
    expect(reads()).toBe(1)
    expect(result.signals[0]?.kind).toBe('textual')
    expect(result.verdict).toBe('likely')
    expect(corroborate(result.signals, 'strong')).toEqual(result)
  })

  it('a getter that is valid once and invalid afterward is graded on its single valid read', () => {
    const { signal } = accessorSignal('kind', ['structural', 'Textual', 'Textual'])
    const result = corroborate([signal, sig('b', 'textual', 'supports')], 'strong')
    expect(result.verdict).toBe('confirmed')
    expect(result.signals.map((s) => s.kind)).toEqual(['structural', 'textual'])
  })

  it.each([
    ['vote', ['supports', 'contradicts'] as const],
    ['source', ['a', 'b', 'c'] as const],
  ] as const)('a changing %s getter cannot make the result contradict its own signals', (field, values) => {
    for (let start = 0; start < values.length; start++) {
      const { signal } = accessorSignal(field, values, start)
      const result = corroborate([signal, sig('z', 'behavioral', 'supports')], 'strong')
      expect(corroborate(result.signals, 'strong')).toEqual(result)
    }
  })

  // CK-AUD-001c: inherited fields were accepted by validation but dropped by the copy.
  it('keeps inherited required and detail fields in the returned snapshot', () => {
    const inherited = Object.create({ source: 'a', kind: 'structural', vote: 'supports', detail: 'audit fixture' }) as Signal
    const result = corroborate([inherited], 'strong')
    expect(result.supports).toBe(1)
    expect(result.signals).toEqual([{ source: 'a', kind: 'structural', vote: 'supports', detail: 'audit fixture' }])
    expect(corroborate(result.signals, 'strong')).toEqual(result)
    // The copied fields are ordinary, editable data properties like any other.
    for (const field of ['source', 'kind', 'vote', 'detail']) {
      expect(Object.getOwnPropertyDescriptor(result.signals[0], field)).toMatchObject({
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
  })

  it('accepts a class instance whose fields are accessors on the prototype, and keeps them', () => {
    class Reading {
      get source(): string {
        return 'db://orders'
      }
      get kind(): SignalKind {
        return 'structural'
      }
      get vote(): Vote {
        return 'supports'
      }
      get detail(): string {
        return 'row present'
      }
    }
    const result = corroborate([new Reading(), sig('b', 'textual', 'supports')], 'strong')
    expect(result.verdict).toBe('confirmed')
    expect(result.signals[0]).toEqual({ source: 'db://orders', kind: 'structural', vote: 'supports', detail: 'row present' })
  })

  it('keeps a non-enumerable own field in the returned snapshot', () => {
    const hidden = { source: 'a', vote: 'supports', detail: 'd' }
    Object.defineProperty(hidden, 'kind', { value: 'structural', enumerable: false })
    const result = corroborate([hidden as unknown as Signal], 'strong')
    expect(result.signals[0]?.kind).toBe('structural')
  })

  it('never reads Object.prototype for a field the caller left out', () => {
    Object.defineProperty(Object.prototype, 'kind', { value: 'structural', configurable: true })
    try {
      // A null-prototype signal has no kind anywhere; its copy must not find one on Object.prototype.
      const missingKind = Object.assign(Object.create(null) as object, { source: 'a', vote: 'supports', detail: 'd' }) as Signal
      expect(() => corroborate([missingKind], 'strong')).toThrow(/signals\[0\]\.kind must be one of/)
    } finally {
      delete (Object.prototype as unknown as Record<string, unknown>).kind
    }
  })

  it('does not invent a detail field for a signal that has none', () => {
    const noDetail = { source: 'a', kind: 'structural', vote: 'supports' } as unknown as Signal
    const copy = corroborate([noDetail], 'strong').signals[0]
    expect(copy).toBeDefined()
    expect(Object.hasOwn(copy as Signal, 'detail')).toBe(false)
  })

  it('returns plain data properties, never the caller accessors', () => {
    const { signal } = accessorSignal('kind', ['structural'])
    const copy = corroborate([signal], 'strong').signals[0] as Signal
    const descriptor = Object.getOwnPropertyDescriptor(copy, 'kind')
    expect(descriptor && 'get' in descriptor).toBe(false)
    expect(descriptor?.value).toBe('structural')
    expect(descriptor?.writable).toBe(true)
  })

  it('keeps extra enumerable metadata on the copy, as before', () => {
    const tagged = { source: 'a', kind: 'structural', vote: 'supports', detail: 'd', note: 'kept' }
    const copy = corroborate([tagged as unknown as Signal], 'strong').signals[0] as unknown as Record<string, unknown>
    expect(copy.note).toBe('kept')
  })

  it('reads the signals array once: its length once and each index once', () => {
    const gets: Record<string, number> = {}
    const backing = [sig('a', 'structural', 'supports'), sig('b', 'textual', 'supports')]
    const proxy = new Proxy(backing, {
      get(target, key, receiver) {
        gets[String(key)] = (gets[String(key)] ?? 0) + 1
        return Reflect.get(target, key, receiver) as unknown
      },
    })
    const result = corroborate(proxy, 'strong')
    expect(result.verdict).toBe('confirmed')
    expect(gets.length).toBe(1)
    expect(gets['0']).toBe(1)
    expect(gets['1']).toBe(1)
  })

  it('grades the elements it read even when a getter edits the array mid-pass', () => {
    const later = sig('later', 'structural', 'supports')
    const signals: Signal[] = []
    const mutator = { source: 'a', kind: 'textual', vote: 'supports', detail: 'd' } as unknown as Signal
    Object.defineProperty(mutator, 'detail', {
      enumerable: true,
      get: () => {
        signals[1] = sig('swapped', 'textual', 'contradicts')
        return 'd'
      },
    })
    signals.push(mutator, later)
    const result = corroborate(signals, 'strong')
    expect(corroborate(result.signals, 'strong')).toEqual(result)
  })

  it('rejects a hole that Array.prototype would fill in through an inherited index', () => {
    const sparse: Signal[] = [sig('a', 'structural', 'supports')]
    sparse.length = 2
    Object.defineProperty(Array.prototype, 1, { value: sig('b', 'textual', 'supports'), configurable: true })
    try {
      expect(() => corroborate(sparse, 'strong')).toThrow(/signals\[1\] must be a Signal object/)
    } finally {
      delete (Array.prototype as unknown as Record<number, unknown>)[1]
    }
  })
})

describe('CK-002: label helpers accept only primitive strings', () => {
  // CK-AUD-002a-d: a property lookup coerced these to a valid key.
  it.each([
    ['a one-element array', ['confirmed']],
    ['a boxed string', new String('confirmed')],
    ['an object with a toString', { toString: (): string => 'confirmed' }],
    ['a symbol', Symbol('confirmed')],
  ])('verdictLabel rejects %s', (_name, value) => {
    expect(() => verdictLabel(value as unknown as Verdict)).toThrow(TypeError)
  })

  it.each([
    ['a one-element array', ['strong']],
    ['a boxed string', new String('strong')],
    ['an object with a toString', { toString: (): string => 'strong' }],
    ['a symbol', Symbol('strong')],
  ])('coverageLabel rejects %s', (_name, value) => {
    expect(() => coverageLabel(value as unknown as Coverage)).toThrow(TypeError)
  })

  it('still labels every valid literal', () => {
    expect(verdictLabel('confirmed')).toBe('confirmed')
    expect(coverageLabel('strong')).toBe('strong coverage')
  })

  it('names the unknown value in the message', () => {
    expect(messageOf(() => verdictLabel('bogus' as Verdict))).toBe('corroboration-kit: unknown verdict "bogus"')
    expect(messageOf(() => coverageLabel('bogus' as Coverage))).toBe('corroboration-kit: unknown coverage "bogus"')
  })
})

describe('class 7: a source that shows nothing is rejected', () => {
  it.each([
    ['empty', ''],
    ['spaces', '   '],
    ['tabs and newlines', '\t\n\r'],
    ['a zero-width space', '\u200b'],
    ['zero-width joiners', '\u200b\u200c\u200d'],
    ['a word joiner', '\u2060'],
    ['a byte order mark', '\ufeff'],
    ['a soft hyphen', '\u00ad'],
    ['an Arabic letter mark', '\u061c'],
    ['isolate controls', '\u2066\u2069'],
    ['embedding controls', '\u202a\u202c'],
    ['a left-to-right mark', '\u200e'],
    ['a combining grapheme joiner', '\u034f'],
    ['a Mongolian vowel separator', '\u180e'],
    ['a variation selector', '\ufe0f'],
    ['a Hangul filler', '\u3164'],
    ['a NUL control', '\u0000'],
    ['a C1 control', '\u009b'],
    ['whitespace around an invisible character', '  \u200b  '],
  ])('rejects a source made only of %s', (_name, source) => {
    expect(() => corroborate([sig(source, 'structural', 'supports')], 'strong')).toThrow(TypeError)
    expect(() => corroborate([sig(source, 'structural', 'supports')], 'strong')).toThrow(/signals\[0\]\.source must not be empty/)
  })

  it.each([
    ['a plain word', 'a'],
    ['text wrapped in isolates', '\u2066a\u2069'],
    ['Arabic', 'العربية'],
    ['Japanese', '日本語'],
    ['an emoji', '😀'],
    ['a visible character between invisible ones', '\u200bx\u200b'],
  ])('accepts %s', (_name, source) => {
    expect(corroborate([sig(source, 'structural', 'supports')], 'strong').supports).toBe(1)
  })

  it('never lets two blank sources count as one shared identity', () => {
    // Before, two zero-width-only sources were accepted and folded into one
    // "artifact" that never had a name.
    expect(() => corroborate([sig('\u200b', 'structural', 'supports'), sig('\u2060', 'textual', 'supports')], 'strong')).toThrow(TypeError)
  })
})

describe('class 8: error messages never carry raw control or bidi characters from the caller', () => {
  const hostile = 'x\u202e\u2066\n\r\u001b\u009b\u2028\u2029\u061c\u200f\u007fy'

  it('escapes a hostile kind, vote and coverage', () => {
    const inputs: Array<() => unknown> = [
      () => corroborate([{ source: 's', kind: hostile, vote: 'supports', detail: 'd' } as unknown as Signal], 'strong'),
      () => corroborate([{ source: 's', kind: 'textual', vote: hostile, detail: 'd' } as unknown as Signal], 'strong'),
      () => corroborate([], hostile as unknown as Coverage),
      () => verdictLabel(hostile as Verdict),
      () => coverageLabel(hostile as Coverage),
    ]
    for (const run of inputs) {
      const message = messageOf(run)
      expect(message).not.toMatch(UNSAFE)
      expect(message).toContain('\\u202e')
      expect(message).toContain('\\u001b')
      expect(message).toContain('\\u2028')
      // Zero-padded to four hex digits, whatever the code point.
      expect(message).toContain('\\u007f')
      expect(message).toContain('\\u009b')
    }
  })

  it('does not split a message across lines for a signals value that is a string', () => {
    const message = messageOf(() => corroborate('line1\nline2\u2028' as unknown as Signal[], 'strong'))
    expect(message).not.toMatch(UNSAFE)
    expect(message).toContain('line1')
  })

  it('leaves ordinary visible text alone', () => {
    expect(messageOf(() => verdictLabel('déjà vu 日本 😀' as Verdict))).toBe('corroboration-kit: unknown verdict "déjà vu 日本 😀"')
  })
})

describe('class 3: building an error message never calls into the offending value', () => {
  const hostile = {
    toString: () => {
      throw new Error('toString ran')
    },
    toJSON: () => {
      throw new Error('toJSON ran')
    },
    valueOf: () => {
      throw new Error('valueOf ran')
    },
    [Symbol.toPrimitive]: () => {
      throw new Error('toPrimitive ran')
    },
  }

  it.each([
    ['signals', () => corroborate(hostile as unknown as Signal[], 'strong'), /signals must be an array/],
    ['an element', () => corroborate([hostile as unknown as Signal], 'strong'), /signals\[0\]\.source must be a string/],
    ['a kind', () => corroborate([{ source: 's', kind: hostile, vote: 'supports', detail: 'd' } as unknown as Signal], 'strong'), /kind must be one of/],
    ['a vote', () => corroborate([{ source: 's', kind: 'textual', vote: hostile, detail: 'd' } as unknown as Signal], 'strong'), /vote must be one of/],
    ['a coverage', () => corroborate([], hostile as unknown as Coverage), /coverage must be one of/],
    ['a verdict label', () => verdictLabel(hostile as unknown as Verdict), /unknown verdict/],
    ['a coverage label', () => coverageLabel(hostile as unknown as Coverage), /unknown coverage/],
  ])('throws this kit TypeError for hostile %s', (_name, run, pattern) => {
    expect(run).toThrow(TypeError)
    expect(run).toThrow(pattern)
  })

  it.each([
    ['a bigint', 1n, 'bigint'],
    ['a symbol', Symbol('s'), 'symbol'],
  ])('describes %s without throwing', (_name, value, described) => {
    expect(messageOf(() => corroborate([{ source: 's', kind: value, vote: 'supports', detail: 'd' } as unknown as Signal], 'strong'))).toMatch(
      new RegExp(`got ${described}$`),
    )
  })

  it('describes a revoked proxy as an object instead of throwing while building the message', () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    expect(messageOf(() => corroborate([{ source: 's', kind: proxy, vote: 'supports', detail: 'd' } as unknown as Signal], 'strong'))).toMatch(
      /got object$/,
    )
  })

  it('fails with a TypeError, not a crash, for a revoked proxy element', () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    expect(() => corroborate([proxy as unknown as Signal], 'strong')).toThrow(TypeError)
  })
})

describe('error messages describe the offending value', () => {
  const kindMessage = (kind: unknown): string =>
    messageOf(() => corroborate([{ source: 's', kind, vote: 'supports', detail: 'd' } as unknown as Signal], 'strong'))
  const kinds = 'signals[0].kind must be one of textual, structural, behavioral, declarative, got '

  it.each([
    ['a short string', 'oops', '"oops"'],
    ['null', null, 'null'],
    ['undefined', undefined, 'undefined'],
    ['an array', [1], 'an array'],
    ['a number', 7, 'number'],
    ['an object', {}, 'object'],
  ])('says what %s is', (_name, value, described) => {
    expect(kindMessage(value)).toBe(`corroboration-kit: ${kinds}${described}`)
  })

  it('keeps a 40-character string whole and truncates a 41-character one', () => {
    expect(kindMessage('k'.repeat(40))).toBe(`corroboration-kit: ${kinds}"${'k'.repeat(40)}"`)
    expect(kindMessage('k'.repeat(41))).toBe(`corroboration-kit: ${kinds}"${'k'.repeat(40)}..."`)
  })

  it('states the accepted vote and coverage values', () => {
    expect(messageOf(() => corroborate([{ source: 's', kind: 'textual', vote: 'no', detail: 'd' } as unknown as Signal], 'strong'))).toBe(
      'corroboration-kit: signals[0].vote must be one of supports, contradicts, inconclusive, got "no"',
    )
    expect(messageOf(() => corroborate([], 'low' as Coverage))).toBe(
      'corroboration-kit: coverage must be one of strong, partial, thin, got "low"',
    )
  })

  it('names a non-array signals value and a non-object element', () => {
    expect(messageOf(() => corroborate('x' as unknown as Signal[], 'strong'))).toBe(
      'corroboration-kit: signals must be an array of Signal objects, got "x"',
    )
    expect(messageOf(() => corroborate([3 as unknown as Signal], 'strong'))).toBe(
      'corroboration-kit: signals[0] must be a Signal object, got number',
    )
  })

  it('says a hole is a hole', () => {
    const sparse = new Array<Signal>(1)
    expect(messageOf(() => corroborate(sparse, 'strong'))).toBe(
      'corroboration-kit: signals[0] must be a Signal object, but the array has a hole there',
    )
  })

  it('rejects a Map, a Date, an array, a Set and a RegExp as a signal (none carries kind and vote)', () => {
    for (const notASignal of [new Map(), new Date(0), [], new Set(), /x/]) {
      expect(() => corroborate([notASignal as unknown as Signal], 'strong')).toThrow(TypeError)
    }
  })
})

describe('coverageOf error messages', () => {
  it('names the negative argument', () => {
    expect(messageOf(() => coverageOf(0, -5, true))).toBe('corroboration-kit: coverageOf: totalUnits must not be negative, got -5')
    expect(messageOf(() => coverageOf(-1, 5, true))).toBe('corroboration-kit: coverageOf: sampledUnits must not be negative, got -1')
  })

  it('explains an impossible sample', () => {
    expect(messageOf(() => coverageOf(6, 5, true))).toBe(
      'corroboration-kit: coverageOf: sampledUnits (6) cannot exceed totalUnits (5); you cannot sample more of a pool than it contains',
    )
  })
})

describe('source identity: http and non-http strings', () => {
  it('folds a fragment on a plain http URL as well as https', () => {
    const result = corroborate([sig('http://A.example/p#1', 'structural', 'supports'), sig('http://a.example/p#2', 'textual', 'supports')], 'strong')
    expect(result.supports).toBe(1)
  })

  it('folds the scheme case for an uppercase HTTPS URL', () => {
    const result = corroborate([sig('HTTPS://a.example/p#1', 'structural', 'supports'), sig('https://a.example/p', 'textual', 'supports')], 'strong')
    expect(result.supports).toBe(1)
  })

  it('does not treat a non-http URL that merely contains an http URL as an http URL', () => {
    const result = corroborate(
      [sig('ftp://Host/a#frag-1/https://x', 'structural', 'supports'), sig('ftp://Host/a#frag-2/https://x', 'textual', 'supports')],
      'strong',
    )
    expect(result.supports).toBe(2)
  })

  it('strips a fragment so a URL with and without one is a single source', () => {
    const result = corroborate([sig('https://a.example/doc', 'structural', 'supports'), sig('https://a.example/doc#s1', 'textual', 'supports')], 'strong')
    expect(result.supports).toBe(1)
  })
})

describe('the confirmed-contradiction boundary', () => {
  it('confirms exactly two contradicting sources when one is non-textual', () => {
    const result = corroborate([sig('a', 'textual', 'contradicts'), sig('b', 'structural', 'contradicts')], 'strong')
    expect(result.contradicts).toBe(2)
    expect(result.verdict).toBe('confirmed')
  })

  it('does not confirm a single non-textual contradicting source', () => {
    const result = corroborate([sig('a', 'structural', 'contradicts')], 'strong')
    expect(result.verdict).toBe('likely')
  })

  it('caps a confirmed contradiction at likely under thin coverage', () => {
    const result = corroborate([sig('a', 'textual', 'contradicts'), sig('b', 'structural', 'contradicts')], 'thin')
    expect(result.verdict).toBe('likely')
  })

  it('confirms 3 contradicting sources as well (more than the minimum)', () => {
    const result = corroborate([sig('a', 'textual', 'contradicts'), sig('b', 'textual', 'contradicts'), sig('c', 'behavioral', 'contradicts')], 'partial')
    expect(result.verdict).toBe('confirmed')
  })
})

describe('CK-003: direction says which way the counted evidence points', () => {
  const cases: Array<[string, Signal[], Coverage, Verdict, Direction]> = [
    ['no signals, adequate coverage', [], 'strong', 'not-found', 'none'],
    ['no signals, thin coverage', [], 'thin', 'inconclusive', 'none'],
    ['only inconclusive votes', [sig('a', 'structural', 'inconclusive')], 'strong', 'not-found', 'none'],
    ['one textual supporter', [sig('a', 'textual', 'supports')], 'strong', 'likely', 'supports'],
    ['confirmed support', [sig('a', 'textual', 'supports'), sig('b', 'structural', 'supports')], 'strong', 'confirmed', 'supports'],
    ['support capped by thin coverage', [sig('a', 'textual', 'supports'), sig('b', 'structural', 'supports')], 'thin', 'likely', 'supports'],
    ['one contradiction', [sig('a', 'structural', 'contradicts')], 'strong', 'likely', 'contradicts'],
    ['confirmed contradiction', [sig('a', 'textual', 'contradicts'), sig('b', 'structural', 'contradicts')], 'strong', 'confirmed', 'contradicts'],
    ['contradiction capped by thin coverage', [sig('a', 'textual', 'contradicts'), sig('b', 'structural', 'contradicts')], 'thin', 'likely', 'contradicts'],
    ['sources on both sides', [sig('a', 'structural', 'supports'), sig('b', 'structural', 'contradicts')], 'strong', 'mixed', 'mixed'],
    ['one artifact voting both ways', [sig('a', 'structural', 'supports'), sig('a', 'structural', 'contradicts')], 'strong', 'mixed', 'mixed'],
    ['support plus an inconclusive vote', [sig('a', 'structural', 'supports'), sig('b', 'structural', 'inconclusive')], 'strong', 'likely', 'supports'],
  ]

  it.each(cases)('%s', (_name, signals, coverage, verdict, direction) => {
    const result = corroborate(signals, coverage)
    expect(result.verdict).toBe(verdict)
    expect(result.direction).toBe(direction)
  })

  it('a confirmed verdict with direction contradicts means the claim is contradicted, not supported', () => {
    const result: Corroboration = corroborate([sig('a', 'textual', 'contradicts'), sig('b', 'declarative', 'contradicts')], 'strong')
    expect(result).toMatchObject({ verdict: 'confirmed', supports: 0, contradicts: 2, direction: 'contradicts' })
  })

  it('is derived from the counted sources for every pair of signals, in either order', () => {
    const votes: Vote[] = ['supports', 'contradicts', 'inconclusive']
    for (const v1 of votes) {
      for (const v2 of votes) {
        for (const s2 of ['a', 'b']) {
          const forward = corroborate([sig('a', 'structural', v1), sig(s2, 'textual', v2)], 'strong')
          const backward = corroborate([sig(s2, 'textual', v2), sig('a', 'structural', v1)], 'strong')
          const expected: Direction =
            forward.supports > 0 && forward.contradicts > 0
              ? 'mixed'
              : forward.supports > 0
                ? 'supports'
                : forward.contradicts > 0
                  ? 'contradicts'
                  : 'none'
          expect(forward.direction).toBe(expected)
          expect(backward.direction).toBe(expected)
          expect(forward.direction === 'mixed').toBe(forward.verdict === 'mixed')
        }
      }
    }
  })

  it('leaves every existing field and verdict as before', () => {
    const result = corroborate([sig('a', 'textual', 'supports'), sig('b', 'structural', 'supports')], 'strong')
    expect(result).toEqual({
      verdict: 'confirmed',
      direction: 'supports',
      coverage: 'strong',
      signals: [sig('a', 'textual', 'supports'), sig('b', 'structural', 'supports')],
      supports: 2,
      contradicts: 0,
    })
  })
})
