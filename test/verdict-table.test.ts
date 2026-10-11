// Verdict regression table.
//
// Every row is a named case with the grade a careful reader of the README
// expects. Rows are grouped by what they pin:
//
//   FOLD      different spellings of ONE artifact: must count as one source
//   DISTINCT  spellings that can name different artifacts: must stay two
//   LIMIT     documented limits that are kept on purpose (and pinned so a
//             change to them is deliberate)
//   GATE      the non-textual gate and the single-contradiction rule
//   BLANK     what "shows nothing" means for a source
//   COVERAGE  coverageOf, including the README prose and the 30-unit cliff
//   README    the examples the README prints
//   FUZZ      seeded randomized invariants checked against an independent oracle
//
// Case ids (F01, D01, ...) are stable so a before/after run can be diffed.

import { describe, expect, it } from 'vitest'
import {
  corroborate,
  coverageOf,
  type Coverage,
  type Direction,
  type Signal,
  type SignalKind,
  type Verdict,
  type Vote,
} from '../src/index.js'

const sig = (source: string, kind: SignalKind = 'textual', vote: Vote = 'supports'): Signal => ({
  source,
  kind,
  vote,
  detail: '',
})

/**
 * Cite `a` (textual) and `b` (structural) as supporting sources under strong
 * coverage. If they are one artifact the result is 1 source / 'likely'; if they
 * are two, it is 2 sources / 'confirmed'.
 */
function pair(a: string, b: string): { supports: number; verdict: Verdict } {
  // The FOLD, DISTINCT and LIMIT rows pin ARTIFACT identity (which spellings are
  // one page), so origin inference is off here. The same pairs with inference on
  // are pinned in test/origins-table.test.ts, with every changed verdict listed.
  const r = corroborate([sig(a, 'textual'), sig(b, 'structural')], 'strong', { inferOrigins: false })
  return { supports: r.supports, verdict: r.verdict }
}
const ONE = { supports: 1, verdict: 'likely' }
const TWO = { supports: 2, verdict: 'confirmed' }

describe('verdict table: source identity', () => {
  const FOLD: Array<[string, string, string, string]> = [
    // id, name, a, b
    ['F01', 'percent-hex case in the path (%c3%a9 vs %C3%A9)', 'https://a.example/caf%c3%a9', 'https://a.example/caf%C3%A9'],
    ['F02', 'percent-hex case, mixed within one escape (%aB vs %Ab)', 'https://a.example/x%aB', 'https://a.example/x%Ab'],
    ['F03', 'percent-hex case in the query', 'https://a.example/s?q=%c3%a9', 'https://a.example/s?q=%C3%A9'],
    ['F04', 'literal non-ASCII vs its escaped form', 'https://a.example/caf\u00e9', 'https://a.example/caf%c3%a9'],
    ['F05', 'trailing-dot host (a.example. vs a.example)', 'https://a.example./x', 'https://a.example/x'],
    ['F06', 'trailing-dot host with a port and upper case', 'HTTPS://A.EXAMPLE.:443/x', 'https://a.example/x'],
    ['F07', 'trailing-dot IPv4 host', 'http://127.0.0.1./x', 'http://127.0.0.1/x'],
    ['F08', 'empty query ("x?" vs "x")', 'https://a.example/x?', 'https://a.example/x'],
    ['F09', 'empty query followed by a fragment', 'https://a.example/x?#top', 'https://a.example/x'],
    ['F10', 'empty query on a bare host', 'https://a.example?', 'https://a.example/'],
    ['F11', 'explicit default https port', 'https://a.example:443/x', 'https://a.example/x'],
    ['F12', 'explicit default http port', 'http://a.example:80/x', 'http://a.example/x'],
    ['F13', 'empty port', 'https://a.example:/x', 'https://a.example/x'],
    ['F14', 'fragment is dropped', 'https://a.example/x#s1', 'https://a.example/x#s2'],
    ['F15', 'scheme and host case', 'HTTPS://A.Example/x', 'https://a.example/x'],
    ['F16', 'dot segments', 'https://a.example/a/./b/../x', 'https://a.example/a/x'],
    ['F17', 'surrounding whitespace on a URL', '  https://a.example/x\n', 'https://a.example/x'],
    ['F18', 'NFC vs NFD on a plain id', 'caf\u00e9.md', 'cafe\u0301.md'],
    ['F22', 'internationalized host vs its punycode form (news and wiki sites)', 'https://m\u00fcnchen.de/stra\u00dfe', 'https://xn--mnchen-3ya.de/stra%c3%9fe'],
    ['F23', 'escaped slash in different hex case', 'https://a.example/a%2fb', 'https://a.example/a%2Fb'],
    ['F24', 'trailing-dot host with userinfo', 'https://user@a.example./x', 'https://user@a.example/x'],
    ['F25', 'trailing-dot localhost', 'http://localhost./x', 'http://localhost/x'],
    ['F26', 'default port on an IPv6 host', 'https://[::1]:443/x', 'https://[::1]/x'],
    ['F27', 'several trailing dots on the host', 'https://a.example../x', 'https://a.example/x'],
    ['F28', 'wiki-style accented title, literal vs lowercase-hex escape', 'https://en.wikipedia.org/wiki/Caf\u00e9', 'https://en.wikipedia.org/wiki/Caf%c3%a9'],
    ['F19', 'every normalization at once', ' HTTPS://A.EXAMPLE.:443/caf%c3%a9/./y/..?#f ', 'https://a.example/caf%C3%A9/'],
  ]
  it.each(FOLD)('%s FOLD: %s is one source', (_id, _name, a, b) => {
    expect(pair(a, b)).toEqual(ONE)
  })

  const DISTINCT: Array<[string, string, string, string]> = [
    ['D01', 'path case', 'https://a.example/X', 'https://a.example/x'],
    ['D02', 'trailing slash on a path', 'https://a.example/x', 'https://a.example/x/'],
    ['D03', 'query with content vs none', 'https://a.example/x', 'https://a.example/x?a=1'],
    ['D04', 'different query values', 'https://a.example/x?a=1', 'https://a.example/x?a=2'],
    ['D05', 'same query pairs in a different order', 'https://a.example/x?a=1&b=2', 'https://a.example/x?b=2&a=1'],
    ['D06', 'query with only a bare key vs empty query', 'https://a.example/x?a', 'https://a.example/x?'],
    ['D07', 'escaped slash is not a slash', 'https://a.example/a%2Fb', 'https://a.example/a/b'],
    ['D08', 'escaped unreserved letter is left alone', 'https://a.example/%41', 'https://a.example/A'],
    ['D09', 'plus vs %20 in a query', 'https://a.example/s?q=a+b', 'https://a.example/s?q=a%20b'],
    ['D10', 'non-default port', 'https://a.example:8443/x', 'https://a.example/x'],
    ['D11', 'port 443 on http is not the default', 'http://a.example:443/x', 'http://a.example/x'],
    ['D12', 'port 80 on https is not the default', 'https://a.example:80/x', 'https://a.example/x'],
    ['D13', 'http vs https', 'http://a.example/x', 'https://a.example/x'],
    ['D14', 'www vs bare host', 'https://www.a.example/x', 'https://a.example/x'],
    ['D15', 'trailing dot on a PATH is part of the name', 'https://a.example/x.', 'https://a.example/x'],
    ['D16', 'userinfo', 'https://user@a.example/x', 'https://a.example/x'],
    ['D17', 'hex case in a non-URL id (file names are case-sensitive)', 'dir/a%2f.txt', 'dir/a%2F.txt'],
    ['D18', 'trailing dot on a non-URL id', 'doc.md.', 'doc.md'],
    ['D19', 'fragment on a non-http(s) scheme', 'file:///a#x', 'file:///a'],
    ['D20', 'file name case', 'Doc.md', 'doc.md'],
    ['D22', 'parentheses vs their escapes (wiki titles) are left alone', 'https://en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_%28bar%29'],
    ['D23', 'tracking parameter on a news URL', 'https://news.example/2026/10/01/story.html', 'https://news.example/2026/10/01/story.html?smid=url-share'],
    ['D24', 'trailing ampersand in a query', 'https://a.example/q?x=1&', 'https://a.example/q?x=1'],
    ['D25', 'a literal percent vs an escaped percent', 'https://a.example/100%', 'https://a.example/100%25'],
    ['D26', 'double slash in a path', 'https://a.example//x', 'https://a.example/x'],
    ['D27', 'a directory vs its index page', 'https://a.example/', 'https://a.example/index.html'],
    ['D28', 'tilde vs its escape', 'https://a.example/%7Euser', 'https://a.example/~user'],
    ['D29', 'host with a trailing dot and a non-default port vs the bare host', 'https://a.example.:8443/x', 'https://a.example/x'],
    ['D30', 'escaped ampersand vs double-escaped percent in a query', 'https://a.example/p?q=%26', 'https://a.example/p?q=%2526'],
    ['D21', 'different hosts that share a prefix', 'https://a.example./x', 'https://ab.example/x'],
  ]
  it.each(DISTINCT)('%s DISTINCT: %s stays two sources', (_id, _name, a, b) => {
    expect(pair(a, b)).toEqual(TWO)
  })

  const LIMITS: Array<[string, string, string, string, typeof ONE]> = [
    [
      'L01',
      'hash-routed SPA pages merge (fragment is dropped on http(s); documented limit)',
      'https://app.example/#/reports/2023',
      'https://app.example/#/reports/2024',
      ONE,
    ],
    ['L02', 'hash-bang routes merge too (documented limit)', 'https://app.example/#!/a', 'https://app.example/#!/b', ONE],
    [
      'L03',
      'a caller who moves the route out of the fragment keeps them apart (the documented workaround)',
      'https://app.example/__route__/reports/2023',
      'https://app.example/__route__/reports/2024',
      TWO,
    ],
    [
      'L04',
      'two URLs that mirror one wire story are two sources (caller must dedupe)',
      'https://one.example/wire/123',
      'https://two.example/wire/123',
      TWO,
    ],
  ]
  it.each(LIMITS)('%s LIMIT: %s', (_id, _name, a, b, expected) => {
    expect(pair(a, b)).toEqual(expected)
  })

  it('F20 FOLD: the same spelling variants fold on the contradicting side too', () => {
    const r = corroborate(
      [sig('https://a.example/caf%c3%a9', 'textual', 'contradicts'), sig('https://a.example./caf%C3%A9?', 'structural', 'contradicts')],
      'strong',
    )
    expect(r).toMatchObject({ contradicts: 1, verdict: 'likely', direction: 'contradicts' })
  })

  it('F21 FOLD: the result keeps the caller\'s original source strings', () => {
    const r = corroborate([sig('https://a.example./caf%c3%a9?')], 'strong')
    expect(r.signals[0]?.source).toBe('https://a.example./caf%c3%a9?')
  })
})

describe('verdict table: the non-textual gate and contradictions', () => {
  const grade = (signals: Signal[], coverage: Coverage = 'strong'): { verdict: Verdict; direction: Direction; supports: number; contradicts: number } => {
    const r = corroborate(signals, coverage)
    return { verdict: r.verdict, direction: r.direction, supports: r.supports, contradicts: r.contradicts }
  }

  it('G01 one source supplying both a textual and a non-textual signal, plus a second textual source: confirmed (decision)', () => {
    // Decision: the gate asks for a non-textual signal from a source counted
    // on that side, and the structural signal here IS from a counted source.
    // A's extra textual signal adds nothing, so this is the same evidence as
    // A(structural) + B(textual), which the README confirms.
    expect(
      grade([sig('A', 'textual'), sig('A', 'structural'), sig('B', 'textual')]),
    ).toEqual({ verdict: 'confirmed', direction: 'supports', supports: 2, contradicts: 0 })
    expect(grade([sig('A', 'structural'), sig('B', 'textual')]).verdict).toBe('confirmed')
  })

  it('G02 a non-textual signal that does not vote on this side cannot unlock confirmed', () => {
    expect(grade([sig('A'), sig('B'), sig('C', 'structural', 'inconclusive')])).toMatchObject({ verdict: 'likely', supports: 2 })
  })

  it('G03 a non-textual signal on the other side does not unlock confirmed; it makes the verdict mixed', () => {
    expect(grade([sig('A'), sig('B'), sig('C', 'structural', 'contradicts')])).toMatchObject({ verdict: 'mixed', direction: 'mixed' })
    expect(grade([sig('A', 'textual', 'contradicts'), sig('B', 'textual', 'contradicts'), sig('C', 'structural')])).toMatchObject({
      verdict: 'mixed',
      direction: 'mixed',
    })
  })

  it('G04 a non-textual signal from a source that folds into the only other source gives one source, so likely', () => {
    expect(grade([sig('https://a.example/x', 'structural'), sig('https://a.example/x#f', 'textual')])).toMatchObject({
      verdict: 'likely',
      supports: 1,
    })
  })

  it('G05 two textual sources, no non-textual signal: likely (the README design rule)', () => {
    expect(grade([sig('A'), sig('B'), sig('C')])).toMatchObject({ verdict: 'likely', supports: 3 })
  })

  it('G06 the gate is symmetric: two contradicting sources need a non-textual one', () => {
    expect(grade([sig('A', 'textual', 'contradicts'), sig('B', 'textual', 'contradicts')])).toMatchObject({ verdict: 'likely', direction: 'contradicts' })
    expect(grade([sig('A', 'textual', 'contradicts'), sig('B', 'declarative', 'contradicts')])).toEqual({
      verdict: 'confirmed',
      direction: 'contradicts',
      supports: 0,
      contradicts: 2,
    })
  })

  it('G07 two distinct non-textual sources and no textual signal: confirmed', () => {
    expect(grade([sig('A', 'structural'), sig('B', 'behavioral')]).verdict).toBe('confirmed')
  })

  it('G08 thin coverage caps a confirmed result on both sides', () => {
    expect(grade([sig('A'), sig('B', 'structural')], 'thin')).toMatchObject({ verdict: 'likely', direction: 'supports' })
    expect(grade([sig('A', 'textual', 'contradicts'), sig('B', 'structural', 'contradicts')], 'thin')).toMatchObject({
      verdict: 'likely',
      direction: 'contradicts',
    })
  })

  it('G09 by design, one textual contradiction breaks a confirmation: it cannot confirm, but it can veto (documented asymmetry)', () => {
    const ten = Array.from({ length: 10 }, (_, i) => sig(`s${i}`, 'behavioral'))
    expect(grade([...ten, sig('forum', 'textual', 'contradicts')])).toMatchObject({ verdict: 'mixed', direction: 'mixed', supports: 10, contradicts: 1 })
    // ...and the same single textual signal on the supporting side cannot lift anything to confirmed.
    expect(grade([sig('forum')])).toMatchObject({ verdict: 'likely' })
  })

  it('G10 inconclusive votes are not counted and not directional', () => {
    expect(grade([sig('A', 'structural', 'inconclusive')], 'strong')).toEqual({ verdict: 'not-found', direction: 'none', supports: 0, contradicts: 0 })
    expect(grade([sig('A', 'structural', 'inconclusive')], 'thin')).toEqual({ verdict: 'inconclusive', direction: 'none', supports: 0, contradicts: 0 })
  })

  it('G11 one source voting both ways is mixed (the same artifact disagrees with itself)', () => {
    expect(grade([sig('A', 'structural'), sig('A', 'structural', 'contradicts')])).toMatchObject({ verdict: 'mixed', supports: 1, contradicts: 1 })
  })
})

describe('verdict table: what a source that "shows nothing" is', () => {
  const REJECT: Array<[string, string, string]> = [
    ['B01', 'empty string', ''],
    ['B02', 'spaces and a tab', ' \t '],
    ['B03', 'zero-width space', '\u200b'],
    ['B04', 'braille blank', '\u2800'],
    ['B05', 'object replacement character U+FFFC (stands for an embedded object that is not in the text)', '\ufffc'],
    ['B06', 'U+FFFC repeated', '\ufffc\ufffc'],
    ['B07', 'private-use BMP code point (no standard glyph)', '\ue000'],
    ['B08', 'private-use plane 15 code point', '\u{f0000}'],
    ['B09', 'private-use plane 16 code point', '\u{10fffd}'],
    ['B10', 'unassigned code point', '\u0378'],
    ['B11', 'noncharacter U+FFFF', '\uffff'],
    ['B12', 'a lone combining acute accent', '\u0301'],
    ['B13', 'a run of combining marks with no base', '\u0301\u0302\u0303'],
    ['B14', 'a combining mark after a zero-width space (still no base)', '\u200b\u0301'],
    ['B15', 'a lone spacing mark (Devanagari sign)', '\u0903'],
    ['B16', 'a lone enclosing mark (keycap)', '\u20e3'],
    ['B17', 'mixed invisible kinds', '\u200b\ufffc\ue000\u0301 \u2800'],
  ]
  it.each(REJECT)('%s rejects: %s', (_id, _name, source) => {
    expect(() => corroborate([sig(source)], 'strong')).toThrow(TypeError)
  })

  const ACCEPT: Array<[string, string, string]> = [
    ['B20', 'a base letter with a combining mark', 'e\u0301'],
    ['B21', 'a letter next to U+FFFC', 'a\ufffc'],
    ['B22', 'a letter next to a private-use character', '\ue000a'],
    ['B23', 'a single visible letter', 'a'],
    ['B24', 'CJK text', '\u65e5\u672c\u8a9e'],
    ['B25', 'an emoji', '\u{1f600}'],
    ['B26', 'an emoji ZWJ sequence', '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}'],
    ['B27', 'visible text wrapped in bidi controls', '\u2067abc\u2069'],
    ['B28', 'a replacement character U+FFFD (it is visible)', '\ufffd'],
    ['B29', 'a Hangul syllable', '\uac00'],
    ['B30', 'a precomposed accented letter', '\u00e9'],
    ['B31', 'a Devanagari consonant with a vowel sign', '\u0915\u093f'],
    ['B32', 'a visible letter followed by an unassigned code point', 'a\u0378'],
    ['B33', 'a combining mark followed by a visible letter', '\u0301x'],
    ['B34', 'a braille blank followed by a letter', '\u2800a'],
  ]
  it.each(ACCEPT)('%s accepts: %s', (_id, _name, source) => {
    expect(() => corroborate([sig(source)], 'strong')).not.toThrow()
  })

  it('B40 two junk sources cannot pose as two independent artifacts', () => {
    expect(() => corroborate([sig('\ue000'), sig('\ue001', 'structural')], 'strong')).toThrow(TypeError)
    expect(() => corroborate([sig('\ufffc'), sig('\u0301', 'structural')], 'strong')).toThrow(TypeError)
  })
})

describe('verdict table: coverageOf', () => {
  const OK: Array<[string, string, number, number, boolean | string, Coverage]> = [
    // README: "A small pool (<= 30 units) with any valid sample, or a high sample
    // ratio (>= 0.6), is strong, but only with structural access; without it, partial."
    ['C01', '1 of 30 with structural access (the cliff: 3% sampled is strong)', 1, 30, true, 'strong'],
    ['C02', '1 of 30 without structural access is partial, not thin', 1, 30, false, 'partial'],
    ['C03', '1 of 31 with structural access (one unit over the cliff: thin)', 1, 31, true, 'thin'],
    ['C04', '4 of 31 (12.9%)', 4, 31, true, 'thin'],
    ['C05', '5 of 31 (16.1%)', 5, 31, true, 'partial'],
    ['C06', '30 of 30 without structural access', 30, 30, false, 'partial'],
    ['C07', '60% with structural access', 60, 100, true, 'strong'],
    ['C08', '60% without structural access', 60, 100, false, 'partial'],
    ['C09', '59% with structural access', 59, 100, true, 'partial'],
    ['C10', '15% is partial', 15, 100, false, 'partial'],
    ['C11', '14% is thin', 14, 100, true, 'thin'],
    ['C12', 'a truthy non-boolean is not structural access', 30, 30, 'yes', 'partial'],
    ['C13', 'zero sample is thin', 0, 30, true, 'thin'],
    ['C14', 'zero pool is thin', 0, 0, true, 'thin'],
    ['C15', 'NaN is thin', Number.NaN, 30, true, 'thin'],
    ['C16', 'infinite pool is thin', 5, Number.POSITIVE_INFINITY, true, 'thin'],
    ['C17', 'a fractional unit', 0.5, 2, true, 'strong'],
  ]
  it.each(OK)('%s %s', (_id, _name, sampled, total, structural, expected) => {
    expect(coverageOf(sampled, total, structural as boolean)).toBe(expected)
  })

  it.each([
    ['C20', 'negative sample', -1, 10],
    ['C21', 'negative pool', 1, -10],
    ['C22', 'sample larger than the pool', 11, 10],
  ])('%s throws RangeError: %s', (_id, _name, sampled, total) => {
    expect(() => coverageOf(sampled, total, true)).toThrow(RangeError)
  })

  it('C30 end to end: a 1-of-30 sample reaches confirmed (documented 30-unit cliff), 1-of-31 does not', () => {
    const signals = [sig('A', 'structural'), sig('B', 'textual')]
    expect(corroborate(signals, coverageOf(1, 30, true)).verdict).toBe('confirmed')
    expect(corroborate(signals, coverageOf(1, 31, true)).verdict).toBe('likely')
  })

  it('C31 the caller-side guard documented in the README: require a minimum sample yourself', () => {
    // The README tells callers who treat a tiny pool as untrustworthy to pass a
    // coverage of their own choosing. This pins that the documented guard works.
    const guarded = (sampled: number, total: number): Coverage => (sampled < 5 ? 'thin' : coverageOf(sampled, total, true))
    expect(guarded(1, 30)).toBe('thin')
    expect(guarded(5, 30)).toBe('strong')
  })
})

describe('verdict table: README examples', () => {
  it('R01 the opening example: 40 of 400 is thin, so two good signals cap at likely, direction supports', () => {
    const coverage = coverageOf(40, 400, true)
    expect(coverage).toBe('thin')
    const r = corroborate(
      [
        { source: 'api-response-2026-08-01', kind: 'declarative', vote: 'supports', detail: 'field is set to true' },
        { source: 'press-release', kind: 'textual', vote: 'supports', detail: 'press release repeats the claim' },
      ],
      coverage,
    )
    expect(r).toMatchObject({ verdict: 'likely', direction: 'supports', supports: 2, contradicts: 0 })
  })

  it('R02 a confirmed contradiction: verdict confirmed, direction contradicts, supports 0, contradicts 2', () => {
    const r = corroborate([sig('A', 'textual', 'contradicts'), sig('B', 'structural', 'contradicts')], 'strong')
    expect(r).toMatchObject({ verdict: 'confirmed', direction: 'contradicts', supports: 0, contradicts: 2 })
  })

  it('R03 rule 3: no supporting source is not-found under adequate coverage, inconclusive under thin', () => {
    expect(corroborate([], 'partial').verdict).toBe('not-found')
    expect(corroborate([], 'thin').verdict).toBe('inconclusive')
  })

  it('R04 grepping the same file three times is one signal, not three', () => {
    const r = corroborate([sig('src/a.ts'), sig('src/a.ts', 'structural'), sig(' src/a.ts ')], 'strong')
    expect(r).toMatchObject({ supports: 1, verdict: 'likely' })
  })

  it('R05 two textual sources never reach confirmed however many there are', () => {
    const r = corroborate(
      Array.from({ length: 50 }, (_, i) => sig(`https://news${i}.example/story`)),
      'strong',
    )
    expect(r).toMatchObject({ supports: 50, verdict: 'likely' })
  })
})

// ---------------------------------------------------------------------------
// FUZZ: seeded, so a failure reproduces. The oracle below is written from the
// README rules, not from the implementation.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Each class is one artifact, spelled several ways. Classes are distinct from each other.
const SPELLINGS: string[][] = [
  ['https://a.example/x', 'HTTPS://A.EXAMPLE./x#f', 'https://a.example:443/x?', ' https://a.example/x\n'],
  ['https://a.example/caf%c3%a9', 'https://a.example/caf%C3%A9?#z', 'https://a.example/caf\u00e9', 'https://a.example./a/../caf%C3%A9'],
  ['https://a.example/X', 'https://A.example/X#1'],
  ['https://a.example/x/', 'https://a.example/x/?'],
  ['https://a.example/x?a=1', 'https://a.example:443/x?a=1#q'],
  ['http://a.example/x', 'http://a.example:80/x'],
  ['file:///etc/a', 'file:///etc/a'],
  ['db:row-7', ' db:row-7 '],
  ['caf\u00e9.md', 'cafe\u0301.md'],
  ['plain-id'],
]
const KINDS: SignalKind[] = ['textual', 'structural', 'behavioral', 'declarative']
const VOTES: Vote[] = ['supports', 'contradicts', 'inconclusive']
const COVS: Coverage[] = ['strong', 'partial', 'thin']

function oracle(
  classes: Array<{ cls: number; kind: SignalKind; vote: Vote }>,
  coverage: Coverage,
): { verdict: Verdict; direction: Direction; supports: number; contradicts: number } {
  const sup = new Set(classes.filter((s) => s.vote === 'supports').map((s) => s.cls))
  const con = new Set(classes.filter((s) => s.vote === 'contradicts').map((s) => s.cls))
  const nts = classes.some((s) => s.vote === 'supports' && s.kind !== 'textual')
  const ntc = classes.some((s) => s.vote === 'contradicts' && s.kind !== 'textual')
  let verdict: Verdict
  if (sup.size > 0 && con.size > 0) verdict = 'mixed'
  else if (con.size > 0) verdict = con.size >= 2 && ntc ? 'confirmed' : 'likely'
  else if (sup.size === 0) verdict = coverage === 'thin' ? 'inconclusive' : 'not-found'
  else verdict = sup.size >= 2 && nts ? 'confirmed' : 'likely'
  if (coverage === 'thin' && verdict === 'confirmed') verdict = 'likely'
  const direction: Direction = sup.size && con.size ? 'mixed' : sup.size ? 'supports' : con.size ? 'contradicts' : 'none'
  return { verdict, direction, supports: sup.size, contradicts: con.size }
}

describe('verdict table: seeded fuzz against an independent oracle', () => {
  it('Z01 15,000 random cases: verdict, direction and counts match the oracle; mixed implies mixed direction; thin never confirms; shuffle does not matter', () => {
    const rnd = mulberry32(20261010)
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T
    const failures: string[] = []
    for (let i = 0; i < 15_000 && failures.length < 5; i++) {
      const n = Math.floor(rnd() * 8)
      const picked = Array.from({ length: n }, () => {
        const cls = Math.floor(rnd() * SPELLINGS.length)
        return { cls, source: pick(SPELLINGS[cls] as string[]), kind: pick(KINDS), vote: pick(VOTES) }
      })
      const coverage = pick(COVS)
      const signals: Signal[] = picked.map((p) => sig(p.source, p.kind, p.vote))
      // The classes above are artifacts that all live on one host, so the oracle
      // counts artifacts: origin inference is off. Origin classes are fuzzed in
      // test/origins-table.test.ts.
      const got = corroborate(signals, coverage, { inferOrigins: false })
      const want = oracle(picked, coverage)
      const shuffled = [...signals].sort(() => rnd() - 0.5)
      const again = corroborate(shuffled, coverage, { inferOrigins: false })
      const problems: string[] = []
      if (got.verdict !== want.verdict) problems.push(`verdict ${got.verdict} != ${want.verdict}`)
      if (got.direction !== want.direction) problems.push(`direction ${got.direction} != ${want.direction}`)
      if (got.supports !== want.supports || got.contradicts !== want.contradicts) problems.push('counts')
      if ((got.verdict === 'mixed') !== (got.direction === 'mixed')) problems.push('mixed <-> mixed direction')
      if (coverage === 'thin' && got.verdict === 'confirmed') problems.push('thin confirmed')
      if (again.verdict !== got.verdict || again.direction !== got.direction) problems.push('shuffle changed the grade')
      if (problems.length) failures.push(`${problems.join('; ')} :: ${JSON.stringify(picked)} ${coverage}`)
    }
    expect(failures).toEqual([])
  }, 60_000)
})
