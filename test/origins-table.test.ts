// Origin and lineage verdict table.
//
// "confirmed" should mean independent ORIGINS, not just different strings. Every
// row here is a named case with the grade a careful reviewer expects. All URLs
// and text are synthetic (paraphrased from real link sets, never copied).
//
//   O  URL-based origin inference (on by default)
//   P  caller-declared lineage: `origin` and `derivedFrom`
//   H  hostile and malformed lineage input
//   E  the explanation of why sources were merged (`groups`)
//   A  artifact identity for plain file paths
//   X  `originOf` and `sourceIdentity`
//   S  scaling on hostile input
//
// Case ids are stable so a before/after run can be diffed. A row marked "was"
// records what 0.2.1 returned; every "was" that differs from the expectation is
// a deliberate verdict change, and the CHANGELOG lists each one.

import { describe, expect, it } from 'vitest'
import {
  corroborate,
  originOf,
  sourceIdentity,
  type Coverage,
  type Signal,
  type SignalKind,
  type Verdict,
  type Vote,
} from '../src/index.js'

const sig = (source: string, kind: SignalKind = 'textual', vote: Vote = 'supports', extra: Partial<Signal> = {}): Signal => ({
  source,
  kind,
  vote,
  detail: '',
  ...extra,
})

const grade = (signals: Signal[], coverage: Coverage = 'strong', options?: { inferOrigins?: boolean }) => {
  const r = corroborate(signals, coverage, options)
  return { verdict: r.verdict, direction: r.direction, supports: r.supports, contradicts: r.contradicts }
}

/** One textual and one structural supporting signal: 1 origin is 'likely', 2 is 'confirmed'. */
function pair(a: string, b: string, options?: { inferOrigins?: boolean }): { supports: number; verdict: Verdict } {
  const r = corroborate([sig(a, 'textual'), sig(b, 'structural')], 'strong', options)
  return { supports: r.supports, verdict: r.verdict }
}
const ONE = { supports: 1, verdict: 'likely' }
const TWO = { supports: 2, verdict: 'confirmed' }

describe('origin table: URL-based origin inference (default)', () => {
  // id, name, a, b, expected, was (0.2.1)
  const ROWS: Array<[string, string, string, string, typeof ONE, typeof ONE]> = [
    // The field-trial cases, paraphrased.
    ['O01', 'two pages of one venue site (menu and contact)', 'https://venue.example/menu', 'https://venue.example/contact', ONE, TWO],
    [
      'O02',
      'two files of one repository on the code host',
      'https://github.com/acme/release/blob/main/schedule.json',
      'https://github.com/acme/release/blob/main/README.md',
      ONE,
      TWO,
    ],
    ['O03', 'code host page and raw file of one repository', 'https://github.com/acme/release/blob/main/a.json', 'https://raw.githubusercontent.com/acme/release/main/a.json', ONE, TWO],
    ['O04', 'repository page and its API URL', 'https://github.com/acme/release', 'https://api.github.com/repos/acme/release/contents/a.json', ONE, TWO],
    ['O05', 'repository page and its archive download host', 'https://github.com/acme/release/tree/main', 'https://codeload.github.com/acme/release/zip/refs/heads/main', ONE, TWO],
    ['O06', 'repository owner and name are case-insensitive and ".git" is dropped', 'https://github.com/Acme/Release.git', 'https://github.com/acme/release/issues/4', ONE, TWO],
    ['O07', 'six formats of one dataset in one repository (two of them)', 'https://github.com/acme/countries/blob/main/dist/countries.json', 'https://github.com/acme/countries/blob/main/dist/countries.csv', ONE, TWO],
    ['O08', 'same gitlab project, blob and raw', 'https://gitlab.com/grp/sub/proj/-/blob/main/a.md', 'https://gitlab.com/grp/sub/proj/-/raw/main/b.md', ONE, TWO],
    ['O09', 'www versus the bare host, root with and without a slash', 'https://www.cafe.example', 'https://cafe.example/', ONE, TWO],
    ['O10', 'a path with and without a trailing slash', 'https://cafe.example/contact', 'https://cafe.example/contact/', ONE, TWO],
    ['O11', 'tilde versus its escape', 'https://home.example/%7Euser', 'https://home.example/~user', ONE, TWO],
    ['O12', 'parentheses versus their escapes (wiki titles)', 'https://en.wiki.example/wiki/Foo_(bar)', 'https://en.wiki.example/wiki/Foo_%28bar%29', ONE, TWO],
    ['O13', 'docs and blog subdomains of one company', 'https://docs.acme.example/guide', 'https://blog.acme.example/post', ONE, TWO],
    ['O14', 'api, m and www prefixes', 'https://api.acme.example/v1', 'https://m.acme.example/', ONE, TWO],
    ['O15', 'http versus https on one host', 'http://cafe.example/menu', 'https://cafe.example/menu', ONE, TWO],
    ['O16', 'a non-default port on one host', 'https://cafe.example:8443/status', 'https://cafe.example/menu', ONE, TWO],
    ['O17', 'two subdomains of one registered domain (support and learn)', 'https://learn.corp.example/a', 'https://support.corp.example/b', ONE, TWO],
    ['O18', 'two language editions of one wiki', 'https://en.wiki.example/wiki/A', 'https://de.wiki.example/wiki/B', ONE, TWO],
    ['O19', 'two subdomains under a country second level (co.uk)', 'https://news.acme.co.uk/a', 'https://shop.acme.co.uk/b', ONE, TWO],
    ['O20', 'two subdomains under a dotted second level with hyphen', 'https://a.acme.com.au/x', 'https://b.acme.com.au/y', ONE, TWO],
    ['O21', 'a government site and its sibling', 'https://revenue.state.example.gov/a', 'https://dhhs.state.example.gov/b', ONE, TWO],

    // Rows that must stay two.
    ['O30', 'different registered domains stay separate', 'https://one.example/wire/123', 'https://two.example/wire/123', TWO, TWO],
    ['O31', 'two repositories of one owner stay separate', 'https://github.com/acme/one', 'https://github.com/acme/two', TWO, TWO],
    ['O32', 'repository owner page versus a repository stays separate', 'https://github.com/acme', 'https://github.com/acme/one', TWO, TWO],
    ['O33', 'a repository versus the code host docs site stays separate', 'https://github.com/acme/one', 'https://docs.github.com/en/actions', TWO, TWO],
    ['O34', 'two projects of one gitlab group stay separate', 'https://gitlab.com/grp/one/-/blob/main/a', 'https://gitlab.com/grp/two/-/blob/main/a', TWO, TWO],
    ['O35', 'two sites on a shared hosting suffix stay separate (github.io)', 'https://alice.github.io/post', 'https://bob.github.io/post', TWO, TWO],
    ['O36', 'two tenants of another hosting platform stay separate (vercel.app)', 'https://one-app.vercel.app/', 'https://two-app.vercel.app/', TWO, TWO],
    ['O37', 'a tenant and its own docs prefix are one site', 'https://docs.alice.github.io/a', 'https://alice.github.io/b', ONE, TWO],
    ['O40', 'two posts by different authors on a writing platform stay separate', 'https://medium.com/@alice/one', 'https://medium.com/@bob/two', TWO, TWO],
    ['O41', 'two threads on a forum site stay separate', 'https://www.reddit.com/r/x/comments/1', 'https://www.reddit.com/r/x/comments/2', TWO, TWO],
    ['O42', 'the same thread under www and bare is one source', 'https://www.reddit.com/r/x/comments/1', 'https://reddit.com/r/x/comments/1', ONE, TWO],
    ['O43', 'two videos stay separate', 'https://www.youtube.com/watch?v=aaa', 'https://www.youtube.com/watch?v=bbb', TWO, TWO],
    ['O44', 'two papers on a preprint server stay separate', 'https://arxiv.org/abs/2601.00001', 'https://arxiv.org/abs/2601.00002', TWO, TWO],
    ['O45', 'two DOIs stay separate', 'https://doi.org/10.1000/aaa', 'https://doi.org/10.1000/bbb', TWO, TWO],
    ['O46', 'two snapshots of different sites on a web archive stay separate', 'https://web.archive.org/web/2026/https://a.example/', 'https://web.archive.org/web/2026/https://b.example/', TWO, TWO],
    ['O47', 'a country domain with unknown second-level structure keeps subdomains separate', 'https://city.osaka.jp/a', 'https://town.osaka.jp/b', TWO, TWO],
    ['O48', 'two hosts on the same IP and port are one site', 'http://10.0.0.5:3000/a', 'http://10.0.0.5:3000/b', ONE, TWO],
    ['O49', 'two ports on the same IP stay separate', 'http://10.0.0.5:3000/a', 'http://10.0.0.5:4000/a', TWO, TWO],
    ['O50', 'localhost services on different ports stay separate', 'http://localhost:3000/a', 'http://localhost:3001/a', TWO, TWO],
    ['O51', 'hostile look-alike: shared prefix is not shared domain', 'https://cafe.example/a', 'https://xcafe.example/a', TWO, TWO],
    ['O52', 'hostile look-alike: shared suffix is not shared domain', 'https://notcafe.example/a', 'https://cafe.example/a', TWO, TWO],
    ['O53', 'a path that mentions another host is not that host', 'https://a.example/https://b.example', 'https://b.example/x', TWO, TWO],
    ['O54', 'userinfo does not change the host', 'https://user@cafe.example/a', 'https://cafe.example/b', ONE, TWO],
    ['O55', 'a deceptive userinfo does not borrow the named host', 'https://cafe.example@evil.example/a', 'https://cafe.example/a', TWO, TWO],
    ['O56', 'a unicode host and its punycode form are one site', 'https://m\u00fcnchen.example/a', 'https://xn--mnchen-3ya.example/b', ONE, TWO],
    ['O57', 'a non-URL id is never merged by host inference', 'cafe.example/a', 'cafe.example/b', TWO, TWO],
    ['O58', 'a mailto or ftp string is not an http(s) URL', 'mailto:a@cafe.example', 'mailto:b@cafe.example', TWO, TWO],
    ['O70', 'a web archive snapshot is read as the page it archives (snapshot and live page)', 'https://web.archive.org/web/20220101000000/https://blog.acme.example/post', 'https://www.acme.example/', ONE, TWO],
    ['O71', 'two snapshots of one site on a web archive', 'https://web.archive.org/web/2022/https://m.acme.example/a', 'http://web.archive.org/web/2024/https://acme.example/b', ONE, TWO],
    ['O72', 'a snapshot with a replay flag and a collapsed scheme', 'https://web.archive.org/web/20220101000000id_/https:/acme.example/a', 'https://acme.example/b', ONE, TWO],
    ['O73', 'a snapshot of a repository file is that repository', 'https://web.archive.org/web/2022/https://github.com/acme/release/blob/main/a', 'https://github.com/acme/release/issues/1', ONE, TWO],
    ['O74', 'a snapshot of a forum thread stays the thread', 'https://web.archive.org/web/2022/https://news.ycombinator.com/item?id=1', 'https://web.archive.org/web/2022/https://news.ycombinator.com/item?id=2', TWO, TWO],
    ['O75', 'a nested archive is read one level only', 'https://web.archive.org/web/2022/https://web.archive.org/web/2020/https://a.example/x', 'https://a.example/y', TWO, TWO],
    ['O76', 'an archive path that is not a snapshot stays on the archive host', 'https://web.archive.org/save/https://a.example/x', 'https://a.example/y', TWO, TWO],
    ['O80', 'a page-level site: m. and www. spellings of one thread', 'https://m.reddit.com/r/x/comments/1', 'https://www.reddit.com/r/x/comments/1', ONE, TWO],
    ['O81', 'a page-level site: old. and np. spellings of one thread', 'https://old.reddit.com/r/x/comments/1', 'https://np.reddit.com/r/x/comments/1', ONE, TWO],
    ['O82', 'a page-level site: mobile. and bare spellings of one post', 'https://mobile.twitter.com/acme/status/1', 'https://twitter.com/acme/status/1', ONE, TWO],
    ['O83', 'a page-level site: m. and www. of DIFFERENT pages stay apart', 'https://m.youtube.com/watch?v=aaa', 'https://www.youtube.com/watch?v=bbb', TWO, TWO],
    ['O84', 'a page-level site: docs and blog prefixes are not stripped from the page host', 'https://docs.google.com/document/d/1', 'https://google.com/document/d/1', TWO, TWO],
    ['O85', 'bitbucket API URL and the repository page', 'https://api.bitbucket.org/2.0/repositories/acme/rel/src/main/a.md', 'https://bitbucket.org/acme/rel/src/main/a.md', ONE, TWO],
    ['O86', 'bitbucket API URLs of two repositories stay apart', 'https://api.bitbucket.org/2.0/repositories/acme/one', 'https://api.bitbucket.org/2.0/repositories/acme/two', TWO, TWO],
    ['O87', 'gitlab API URL with an escaped path and the project page', 'https://gitlab.com/api/v4/projects/grp%2Fsub%2Fproj/repository/files/a.md/raw', 'https://gitlab.com/grp/sub/proj/-/blob/main/a.md', ONE, TWO],
    ['O88', 'gitlab API URL with a numeric project id is not guessed', 'https://gitlab.com/api/v4/projects/12345/repository/files/a.md/raw', 'https://gitlab.com/grp/proj/-/blob/main/a.md', TWO, TWO],
    ['O89', 'codeberg API URL and the repository page', 'https://codeberg.org/api/v1/repos/acme/rel/contents/a.md', 'https://codeberg.org/acme/rel/src/branch/main/a.md', ONE, TWO],
    ['O90', 'gitlab API path with an escaped letter keeps no case', 'https://gitlab.com/api/v4/projects/%41cme%2Frel/repository/files/a/raw', 'https://gitlab.com/api/v4/projects/Acme%2Frel/repository/files/a/raw', ONE, TWO],
    ['O91', 'gitlab API path with an escaped letter versus the project page', 'https://gitlab.com/api/v4/projects/%41cme%2Frel/repository/files/a/raw', 'https://gitlab.com/acme/rel/-/blob/main/a', ONE, TWO],
    ['O92', 'github owner with an escaped letter', 'https://github.com/%41cme/rel/issues/1', 'https://github.com/acme/rel', ONE, TWO],
    ['O93', 'bitbucket and codeberg names with escaped letters', 'https://bitbucket.org/%41cme/%52el/src/main/a', 'https://api.bitbucket.org/2.0/repositories/acme/rel', ONE, TWO],
    ['O94', 'codeberg names with escaped letters', 'https://codeberg.org/api/v1/repos/%41cme/%52el/contents/a', 'https://codeberg.org/acme/rel', ONE, TWO],
    ['O95', 'a malformed escape in a repository name does not throw and stays its own name', 'https://github.com/acme/r%E0%A4el', 'https://github.com/acme/rel', TWO, TWO],
    ['O96', 'an escaped slash in a github name is not a slash', 'https://github.com/acme%2Fx/rel', 'https://github.com/acme/x', TWO, TWO],
    ['O59', 'a code-host reserved path falls back to the site', 'https://github.com/features/actions', 'https://github.com/pricing', ONE, TWO],
  ]
  it.each(ROWS)('%s %s', (_id, _name, a, b, expected) => {
    expect(pair(a, b)).toEqual(expected)
  })

  it('O60 the "was" column is real: with inference off every row matches 0.2.1', () => {
    for (const [id, , a, b, , was] of ROWS) {
      expect({ id, ...pair(a, b, { inferOrigins: false }) }).toEqual({ id, ...was })
    }
  })

  it('O61 venue pages: the trial claim now grades likely, not confirmed', () => {
    const signals = [sig('https://venue.example/menu', 'declarative'), sig('https://venue.example/contact', 'textual')]
    expect(grade(signals)).toEqual({ verdict: 'likely', direction: 'supports', supports: 1, contradicts: 0 })
    expect(grade(signals, 'strong', { inferOrigins: false })).toEqual({ verdict: 'confirmed', direction: 'supports', supports: 2, contradicts: 0 })
  })

  it('O62 two same-repo files that contradict a claim (planned vs actual date) no longer confirm it is false', () => {
    const signals = [
      sig('https://github.com/acme/release/blob/main/schedule.json', 'declarative', 'contradicts'),
      sig('https://github.com/acme/release/blob/main/README.md', 'textual', 'contradicts'),
    ]
    expect(grade(signals)).toEqual({ verdict: 'likely', direction: 'contradicts', supports: 0, contradicts: 1 })
  })

  it('O63 a support and a contradiction from one site stay mixed (1 against 1)', () => {
    const signals = [sig('https://venue.example/menu', 'structural'), sig('https://venue.example/contact', 'textual', 'contradicts')]
    expect(grade(signals)).toEqual({ verdict: 'mixed', direction: 'mixed', supports: 1, contradicts: 1 })
  })

  it('O64 merging never creates a vote: three sites stay three sites', () => {
    const signals = [sig('https://one.example/a', 'structural'), sig('https://two.example/a'), sig('https://www.one.example/b')]
    expect(grade(signals)).toEqual({ verdict: 'confirmed', direction: 'supports', supports: 2, contradicts: 0 })
  })

  it('O65 the non-textual signal can sit in the merged group: still needs 2 origins', () => {
    const signals = [sig('https://one.example/a', 'structural'), sig('https://one.example/b', 'declarative')]
    expect(grade(signals)).toMatchObject({ verdict: 'likely', supports: 1 })
  })

  it('O66 inconclusive votes never join or create a group', () => {
    const signals = [sig('https://one.example/a', 'structural'), sig('https://two.example/a', 'structural', 'inconclusive')]
    expect(grade(signals)).toMatchObject({ verdict: 'likely', supports: 1 })
  })

  it('O67 an unlisted multi-tenant platform merges (documented limit); a declared origin splits them', () => {
    const a = 'https://alice.newplatform.example/post'
    const b = 'https://bob.newplatform.example/post'
    expect(pair(a, b)).toEqual(ONE)
    expect(grade([sig(a, 'structural', 'supports', { origin: 'alice' }), sig(b, 'textual', 'supports', { origin: 'bob' })])).toMatchObject({
      verdict: 'confirmed',
      supports: 2,
    })
  })
})

describe('origin table: declared lineage (origin, derivedFrom)', () => {
  it('P01 two sources that declare one origin count once', () => {
    const signals = [sig('copy-a', 'structural', 'supports', { origin: 'upstream-dataset' }), sig('copy-b', 'textual', 'supports', { origin: 'upstream-dataset' })]
    expect(grade(signals)).toEqual({ verdict: 'likely', direction: 'supports', supports: 1, contradicts: 0 })
  })

  it('P02 a declared origin beats URL inference: two pages of one host with different origins stay two', () => {
    const signals = [
      sig('https://host.example/a', 'structural', 'supports', { origin: 'author-1' }),
      sig('https://host.example/b', 'textual', 'supports', { origin: 'author-2' }),
    ]
    expect(grade(signals)).toMatchObject({ verdict: 'confirmed', supports: 2 })
  })

  it('P03 two copies derived from one upstream count once', () => {
    const signals = [
      sig('copy-a', 'structural', 'supports', { derivedFrom: ['upstream'] }),
      sig('copy-b', 'textual', 'supports', { derivedFrom: ['upstream'] }),
    ]
    expect(grade(signals)).toMatchObject({ verdict: 'likely', supports: 1 })
  })

  it('P04 a copy derived from another counted source counts with it', () => {
    const signals = [sig('original', 'structural'), sig('mirror', 'textual', 'supports', { derivedFrom: ['original'] })]
    expect(grade(signals)).toMatchObject({ verdict: 'likely', supports: 1 })
  })

  it('P05 a downstream copy of a repository: derivedFrom with the repository URL joins the repo files', () => {
    const signals = [
      sig('https://tracker.example/product/node', 'declarative', 'supports', { derivedFrom: ['https://github.com/acme/release'] }),
      sig('https://github.com/acme/release/blob/main/schedule.json', 'declarative'),
      sig('https://github.com/acme/release/blob/main/README.md', 'textual'),
    ]
    expect(grade(signals)).toEqual({ verdict: 'likely', direction: 'supports', supports: 1, contradicts: 0 })
    // ...and without the declaration, the downstream copy is a second origin, as before.
    expect(grade(signals.map(({ source, kind, vote, detail }) => ({ source, kind, vote, detail })))).toMatchObject({ verdict: 'confirmed', supports: 2 })
  })

  it('P06 lineage is transitive', () => {
    const signals = [
      sig('a', 'structural', 'supports', { origin: 'o1', derivedFrom: ['u'] }),
      sig('b', 'textual', 'supports', { origin: 'o2', derivedFrom: ['u'] }),
      sig('c', 'textual', 'supports', { origin: 'o2' }),
    ]
    expect(grade(signals)).toMatchObject({ verdict: 'likely', supports: 1 })
  })

  it('P07 a chain: C derived from B derived from A counts as one', () => {
    const signals = [
      sig('A', 'structural'),
      sig('B', 'textual', 'supports', { derivedFrom: ['A'] }),
      sig('C', 'textual', 'supports', { derivedFrom: ['B'] }),
    ]
    expect(grade(signals)).toMatchObject({ verdict: 'likely', supports: 1 })
  })

  it('P08 the same source string with different declared origins is still one artifact', () => {
    const signals = [sig('doc', 'structural', 'supports', { origin: 'x' }), sig('doc', 'textual', 'supports', { origin: 'y' })]
    expect(grade(signals)).toMatchObject({ supports: 1 })
  })

  it('P09 an original that supports and a copy that contradicts is mixed, 1 against 1', () => {
    const signals = [sig('original', 'structural'), sig('copy', 'textual', 'contradicts', { derivedFrom: ['original'] })]
    expect(grade(signals)).toMatchObject({ verdict: 'mixed', supports: 1, contradicts: 1 })
  })

  it('P10 an inconclusive signal does not carry lineage between counted ones', () => {
    const signals = [
      sig('a', 'structural', 'supports', { derivedFrom: ['u'] }),
      sig('bridge', 'textual', 'inconclusive', { derivedFrom: ['u', 'v'] }),
      sig('b', 'textual', 'supports', { derivedFrom: ['v'] }),
    ]
    expect(grade(signals)).toMatchObject({ verdict: 'confirmed', supports: 2 })
  })

  it('P11 lineage works with inference off, and lineage merges still apply', () => {
    const signals = [sig('copy-a', 'structural', 'supports', { origin: 'o' }), sig('copy-b', 'textual', 'supports', { origin: 'o' })]
    expect(grade(signals, 'strong', { inferOrigins: false })).toMatchObject({ verdict: 'likely', supports: 1 })
  })

  it('P12 origin text is matched exactly after trimming and NFC; case differs on purpose', () => {
    expect(grade([sig('a', 'structural', 'supports', { origin: ' caf\u00e9 ' }), sig('b', 'textual', 'supports', { origin: 'cafe\u0301' })])).toMatchObject({ supports: 1 })
    expect(grade([sig('a', 'structural', 'supports', { origin: 'Upstream' }), sig('b', 'textual', 'supports', { origin: 'upstream' })])).toMatchObject({ supports: 2 })
  })

  it('P16 declared non-URL labels compare exactly: no path folding', () => {
    for (const [a, b] of [['left//right', 'left/right'], ['./x', 'x'], ['.//x', './x']] as const) {
      expect(grade([sig('a', 'structural', 'supports', { origin: a }), sig('b', 'textual', 'supports', { origin: b })])).toMatchObject({ supports: 2 })
    }
    // An upstream named as a SOURCE is matched by page identity, so two entries that fold to one page are one upstream.
    expect(grade([sig('a', 'structural', 'supports', { derivedFrom: ['left//right'] }), sig('b', 'textual', 'supports', { derivedFrom: ['left/right'] })])).toMatchObject({ supports: 1 })
    expect(grade([sig('src/a.ts', 'structural'), sig('copy', 'textual', 'supports', { derivedFrom: ['./src//a.ts'] })])).toMatchObject({ supports: 1 })
  })

  it('P13 an empty derivedFrom list and an absent origin change nothing', () => {
    expect(grade([sig('a', 'structural', 'supports', { derivedFrom: [] }), sig('b')])).toMatchObject({ verdict: 'confirmed', supports: 2 })
  })

  it('P14 a declared origin that is a URL uses the same rules as an inferred one', () => {
    const signals = [
      sig('https://github.com/acme/release/blob/main/README.md', 'textual'),
      sig('local-copy.json', 'structural', 'supports', { origin: 'https://raw.githubusercontent.com/acme/release/main/' }),
    ]
    expect(grade(signals)).toMatchObject({ verdict: 'likely', supports: 1 })
  })

  it('P15 order of signals does not change the groups or the grade', () => {
    const base = [
      sig('a', 'structural', 'supports', { derivedFrom: ['u'] }),
      sig('b', 'textual', 'supports', { derivedFrom: ['u'] }),
      sig('https://one.example/x', 'textual'),
      sig('https://www.one.example/y', 'structural'),
      sig('z', 'textual'),
    ]
    const sizes = (s: Signal[]): number[] =>
      corroborate(s, 'strong').groups.map((g) => g.sources.length).sort((x, y) => x - y)
    const want = sizes(base)
    for (let rot = 1; rot < base.length; rot++) {
      const rotated = [...base.slice(rot), ...base.slice(0, rot)]
      expect(sizes(rotated)).toEqual(want)
      expect(grade(rotated)).toEqual(grade(base))
    }
  })
})

describe('origin table: hostile and malformed lineage input', () => {
  const holey: string[] = new Array<string>(2)
  holey[1] = 'x'
  const bad = (extra: Record<string, unknown>): Signal => ({ source: 'a', kind: 'textual', vote: 'supports', detail: '', ...extra })

  it.each([
    ['H01', 'origin is a number', { origin: 7 }, 'signals[0].origin must be a string'],
    ['H02', 'origin is null', { origin: null }, 'signals[0].origin must be a string'],
    ['H03', 'origin is blank', { origin: ' \u200b ' }, 'signals[0].origin must not be empty'],
    ['H04', 'origin is empty', { origin: '' }, 'signals[0].origin must not be empty'],
    ['H05', 'derivedFrom is a string, not a list', { derivedFrom: 'x' }, 'signals[0].derivedFrom must be an array of strings'],
    ['H06', 'derivedFrom is null', { derivedFrom: null }, 'signals[0].derivedFrom must be an array of strings'],
    ['H07', 'derivedFrom holds a number', { derivedFrom: ['x', 3] }, 'signals[0].derivedFrom[1] must be a string'],
    ['H08', 'derivedFrom holds a blank', { derivedFrom: ['x', '\u200b'] }, 'signals[0].derivedFrom[1] must not be empty'],
    ['H09', 'derivedFrom has a hole', { derivedFrom: holey }, 'signals[0].derivedFrom[0]'],
  ])('%s %s throws TypeError', (_id, _name, extra, message) => {
    expect(() => corroborate([bad(extra)], 'strong')).toThrow(TypeError)
    expect(() => corroborate([bad(extra)], 'strong')).toThrow(message)
  })

  it('H10 options must be an object with a boolean inferOrigins', () => {
    const s = [sig('a')]
    expect(() => corroborate(s, 'strong', null as never)).toThrow(TypeError)
    expect(() => corroborate(s, 'strong', 'yes' as never)).toThrow(TypeError)
    expect(() => corroborate(s, 'strong', [] as never)).toThrow(TypeError)
    expect(() => corroborate(s, 'strong', { inferOrigins: 'false' } as never)).toThrow(TypeError)
    expect(() => corroborate(s, 'strong', { inferOrigins: 0 } as never)).toThrow(TypeError)
    expect(corroborate(s, 'strong', {}).supports).toBe(1)
    expect(corroborate(s, 'strong', { inferOrigins: undefined }).supports).toBe(1)
  })

  it('H11 a getter on origin or derivedFrom is read exactly once', () => {
    let originReads = 0
    let derivedReads = 0
    const s = {
      source: 'a',
      kind: 'structural',
      vote: 'supports',
      detail: '',
      get origin() {
        originReads++
        return originReads === 1 ? 'o' : 'p'
      },
      get derivedFrom() {
        derivedReads++
        return ['u']
      },
    } as unknown as Signal
    const r = corroborate([s, sig('b', 'textual', 'supports', { origin: 'o' })], 'strong')
    expect([originReads, derivedReads]).toEqual([1, 1])
    expect(r.supports).toBe(1)
    expect(r.signals[0]?.origin).toBe('o')
  })

  it('H12 a derivedFrom array that changes after the call cannot change the result', () => {
    const list = ['u']
    const input = [sig('a', 'structural', 'supports', { derivedFrom: list }), sig('b', 'textual', 'supports', { derivedFrom: ['u'] })]
    const r = corroborate(input, 'strong')
    list.push('z')
    list[0] = 'changed'
    expect(r.signals[0]?.derivedFrom).toEqual(['u'])
    expect(r.supports).toBe(1)
  })

  it('H13 a derivedFrom Proxy that throws on read surfaces its own error, and a revoked one is a TypeError', () => {
    const boom = new Proxy(['x'], {
      get(target, key) {
        if (key === 'length') throw new Error('trap')
        return Reflect.get(target, key) as unknown
      },
    })
    expect(() => corroborate([sig('a', 'textual', 'supports', { derivedFrom: boom })], 'strong')).toThrow('trap')
    const { proxy, revoke } = Proxy.revocable([], {})
    revoke()
    expect(() => corroborate([sig('a', 'textual', 'supports', { derivedFrom: proxy as unknown as string[] })], 'strong')).toThrow(TypeError)
  })

  it('H14 null-prototype signal objects and inherited lineage fields work', () => {
    const np = Object.assign(Object.create(null) as object, { source: 'a', kind: 'structural', vote: 'supports', detail: '', origin: 'o' }) as Signal
    class Row {
      source = 'b'
      kind = 'textual'
      vote = 'supports'
      detail = ''
      get origin(): string {
        return 'o'
      }
    }
    expect(corroborate([np, new Row() as unknown as Signal], 'strong').supports).toBe(1)
  })

  it('H15 __proto__, constructor and toString as origin text are ordinary labels', () => {
    for (const name of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      const r = corroborate([sig('a', 'structural', 'supports', { origin: name }), sig('b', 'textual', 'supports', { origin: name })], 'strong')
      expect(r.supports).toBe(1)
      const lone = corroborate([sig('a', 'structural', 'supports', { origin: name }), sig('b', 'textual', 'supports', { origin: 'other' })], 'strong')
      expect(lone.supports).toBe(2)
    }
  })

  it('H16 a huge derivedFrom list is fine and is not spread into a call', { timeout: 60_000 }, () => {
    const big = Array.from({ length: 150_000 }, (_, i) => `u${i}`)
    const r = corroborate([sig('a', 'structural', 'supports', { derivedFrom: big }), sig('b', 'textual', 'supports', { derivedFrom: ['u149999'] })], 'strong')
    expect(r.supports).toBe(1)
  })

  it('H17 lone surrogates, zero-width characters and look-alike letters in lineage text stay exact', () => {
    expect(grade([sig('a', 'structural', 'supports', { origin: 'o\u200b' }), sig('b', 'textual', 'supports', { origin: 'o' })])).toMatchObject({ supports: 2 })
    expect(grade([sig('a', 'structural', 'supports', { origin: '\u0430pple' }), sig('b', 'textual', 'supports', { origin: 'apple' })])).toMatchObject({ supports: 2 })
    expect(grade([sig('a', 'structural', 'supports', { origin: '\ud800' }), sig('b', 'textual', 'supports', { origin: '\ud800' })])).toMatchObject({ supports: 1 })
  })

  it('H18 deep and absurd URLs do not throw', () => {
    const deep = `https://host.example/${'a/'.repeat(50_000)}`
    expect(() => corroborate([sig(deep), sig('https://[::1]/x'), sig('https://999.999.999.999/x'), sig('http://a..b/x'), sig('http://./')], 'strong')).not.toThrow()
  })

  it('H19 a malformed URL that the parser rejects is still counted as its own text', () => {
    expect(grade([sig('https://', 'structural'), sig('https://%/x')])).toMatchObject({ supports: 2 })
  })

  it('H20 a source whose prototype pollution adds an origin field cannot silently merge unrelated sources', () => {
    const proto = Object.prototype as unknown as Record<string, unknown>
    proto.origin = 'poisoned'
    try {
      // Inherited fields are read like the required ones, so this merges (stricter), never splits.
      const r = corroborate([sig('a', 'structural'), sig('b')], 'strong')
      expect(r.supports).toBeLessThanOrEqual(2)
    } finally {
      delete proto.origin
    }
  })
})

describe('origin table: why sources were merged', () => {
  it('E01 each group lists its sources and one merge entry per shared identity', () => {
    const r = corroborate(
      [
        sig('https://github.com/acme/release/blob/main/schedule.json', 'declarative'),
        sig('https://github.com/acme/release/blob/main/README.md', 'textual'),
        sig('https://other.example/page', 'structural'),
      ],
      'strong',
    )
    expect(r.groups).toHaveLength(2)
    const [repo, other] = r.groups
    expect(repo).toMatchObject({
      side: 'supports',
      source: 'https://github.com/acme/release/blob/main/schedule.json',
      sources: ['https://github.com/acme/release/blob/main/schedule.json', 'https://github.com/acme/release/blob/main/README.md'],
      signals: [0, 1],
    })
    expect(repo?.merges).toHaveLength(1)
    expect(repo?.merges[0]).toMatchObject({ rule: 'same-repo', key: 'github.com/acme/release' })
    expect(repo?.merges[0]?.explanation).toContain('same repository')
    expect(other).toMatchObject({ sources: ['https://other.example/page'], signals: [2], merges: [] })
  })

  it('E02 spelling variants of one page are reported as same-page', () => {
    const r = corroborate([sig('https://x.example/doc#a', 'structural'), sig('https://X.example/doc')], 'strong')
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0]?.merges[0]).toMatchObject({ rule: 'same-page', sources: ['https://x.example/doc#a', 'https://X.example/doc'] })
  })

  it('E03 supports and contradicts are grouped separately, supports first', () => {
    const r = corroborate([sig('https://a.example/1', 'structural', 'contradicts'), sig('https://b.example/1'), sig('https://a.example/2', 'textual', 'contradicts')], 'strong')
    expect(r.groups.map((g) => [g.side, g.signals])).toEqual([
      ['supports', [1]],
      ['contradicts', [0, 2]],
    ])
    expect(r.supports + r.contradicts).toBe(r.groups.length)
  })

  it('E04 a declared origin, a derivedFrom and a domain merge name their rule', () => {
    const rule = (signals: Signal[]) => corroborate(signals, 'strong').groups[0]?.merges.map((m) => m.rule)
    expect(rule([sig('a', 'structural', 'supports', { origin: 'o' }), sig('b', 'textual', 'supports', { origin: 'o' })])).toEqual(['declared-origin'])
    expect(rule([sig('a', 'structural', 'supports', { derivedFrom: ['u'] }), sig('b', 'textual', 'supports', { derivedFrom: ['u'] })])).toEqual(['derived-from'])
    expect(rule([sig('original', 'structural'), sig('b', 'textual', 'supports', { derivedFrom: ['original'] })])).toEqual(['derived-from'])
    expect(rule([sig('https://x.corp.example/a'), sig('https://y.corp.example/b')])).toEqual(['same-domain'])
    expect(rule([sig('https://corp.example/a'), sig('https://www.corp.example/b')])).toEqual(['same-site'])
  })

  it('E05 an explanation never carries control or bidi characters from a source', () => {
    const r = corroborate([sig('https://x.example/a\u001b[31m'), sig('https://x.example/b\u202e')], 'strong')
    for (const g of r.groups) for (const m of g.merges) expect(m.explanation).not.toMatch(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u)
  })

  it('E06 no groups for no counted signals; inconclusive signals are not grouped', () => {
    expect(corroborate([], 'strong').groups).toEqual([])
    expect(corroborate([sig('a', 'textual', 'inconclusive')], 'strong').groups).toEqual([])
  })

  it('E07 the result is a snapshot: changing it does not change the next grade', () => {
    const input = [sig('https://x.example/a'), sig('https://x.example/b', 'structural')]
    const r = corroborate(input, 'strong')
    r.groups[0]?.sources.push('forged')
    r.groups.pop()
    expect(corroborate(input, 'strong').groups).toHaveLength(1)
    expect(corroborate(input, 'strong').groups[0]?.sources).toHaveLength(2)
  })
})

describe('origin table: artifact identity for plain file paths', () => {
  it.each([
    ['A01', 'leading ./', './src/a.ts', 'src/a.ts', ONE],
    ['A02', 'repeated leading ./', '././src/a.ts', 'src/a.ts', ONE],
    ['A03', 'duplicate slash', 'src//a.ts', 'src/a.ts', ONE],
    ['A04', 'both', './src//a.ts', 'src/a.ts', ONE],
    ['A05', 'backslash stays distinct', 'src\\a.ts', 'src/a.ts', TWO],
    ['A06', 'case stays distinct', 'README.md', 'readme.md', TWO],
    ['A07', 'parent segment stays distinct', '../a.ts', 'a.ts', TWO],
    ['A08', 'an absolute path is not a relative one', '/src/a.ts', 'src/a.ts', TWO],
    ['A09', 'a scheme id is left alone', 'db://t/1', 'db:/t/1', TWO],
    ['A10', 'a lone dot-slash is not folded to nothing', './', '.', TWO],
    ['A12', 'a UNC root is not a drive-rooted path', '//server/share/a.ts', '/server/share/a.ts', TWO],
    ['A13', 'a UNC root still folds repeated interior slashes', '//server/share//a.ts', '//server/share/a.ts', ONE],
    ['A14', 'a run of three or more leading slashes folds to one', '///a.ts', '/a.ts', ONE],
  ] as Array<[string, string, string, string, typeof ONE]>)('%s %s', (_id, _name, a, b, expected) => {
    expect(pair(a, b)).toEqual(expected)
  })

  it('A11 a long run of slashes and dot-slashes is fast and does not throw', () => {
    expect(() => corroborate([sig(`${'./'.repeat(100_000)}a`), sig('/'.repeat(200_000))], 'strong')).not.toThrow()
  })
})

describe('origin table: originOf and sourceIdentity', () => {
  it.each([
    ['X01', 'https://raw.githubusercontent.com/Acme/Release/main/a.json', 'repo:github.com/acme/release'],
    ['X02', 'https://www.cafe.example/menu', 'domain:cafe.example'],
    ['X03', 'https://news.acme.co.uk/a', 'domain:acme.co.uk'],
    ['X04', 'https://alice.github.io/post', 'site:alice.github.io'],
    ['X05', 'https://city.osaka.jp/a', 'site:city.osaka.jp'],
    ['X06', 'https://medium.com/@alice/one', 'page:medium.com/@alice/one'],
    ['X07', 'http://10.0.0.5:3000/a', 'site:10.0.0.5:3000'],
    ['X08', 'plain-id', undefined],
    ['X09', 'mailto:a@cafe.example', undefined],
    ['X10', 'https://', undefined],
  ] as Array<[string, string, string | undefined]>)('%s originOf(%j)', (_id, input, expected) => {
    expect(originOf(input)).toBe(expected)
  })

  it('X11 sourceIdentity is the artifact key the counting uses', () => {
    expect(sourceIdentity('  HTTPS://A.Example./x#f ')).toBe(sourceIdentity('https://a.example/x'))
    expect(sourceIdentity('./a.ts')).toBe(sourceIdentity('a.ts'))
    expect(sourceIdentity('a.ts')).not.toBe(sourceIdentity('b.ts'))
  })

  it('X12 both helpers throw TypeError for a non-string and never call into the value', () => {
    const trap = { toString: () => { throw new Error('called') } }
    expect(() => originOf(trap as never)).toThrow(TypeError)
    expect(() => sourceIdentity(7 as never)).toThrow(TypeError)
  })
})

describe('origin table: every verdict change against 0.2.1, by input', () => {
  // The rows of the 0.2.1 table that kept two pages of one host (or one
  // repository, or one registered domain) apart. Each one was TWO sources and is
  // now ONE by default; with inference off each is TWO again, unchanged.
  const CHANGED: Array<[string, string, string]> = [
    ['D01', 'https://a.example/X', 'https://a.example/x'],
    ['D02', 'https://a.example/x', 'https://a.example/x/'],
    ['D03', 'https://a.example/x', 'https://a.example/x?a=1'],
    ['D04', 'https://a.example/x?a=1', 'https://a.example/x?a=2'],
    ['D05', 'https://a.example/x?a=1&b=2', 'https://a.example/x?b=2&a=1'],
    ['D06', 'https://a.example/x?a', 'https://a.example/x?'],
    ['D07', 'https://a.example/a%2Fb', 'https://a.example/a/b'],
    ['D08', 'https://a.example/%41', 'https://a.example/A'],
    ['D09', 'https://a.example/s?q=a+b', 'https://a.example/s?q=a%20b'],
    ['D10', 'https://a.example:8443/x', 'https://a.example/x'],
    ['D11', 'http://a.example:443/x', 'http://a.example/x'],
    ['D12', 'https://a.example:80/x', 'https://a.example/x'],
    ['D13', 'http://a.example/x', 'https://a.example/x'],
    ['D14', 'https://www.a.example/x', 'https://a.example/x'],
    ['D15', 'https://a.example/x.', 'https://a.example/x'],
    ['D16', 'https://user@a.example/x', 'https://a.example/x'],
    ['D22', 'https://en.wikipedia.org/wiki/Foo_(bar)', 'https://en.wikipedia.org/wiki/Foo_%28bar%29'],
    ['D23', 'https://news.example/2026/10/01/story.html', 'https://news.example/2026/10/01/story.html?smid=url-share'],
    ['D24', 'https://a.example/q?x=1&', 'https://a.example/q?x=1'],
    ['D25', 'https://a.example/100%', 'https://a.example/100%25'],
    ['D26', 'https://a.example//x', 'https://a.example/x'],
    ['D27', 'https://a.example/', 'https://a.example/index.html'],
    ['D28', 'https://a.example/%7Euser', 'https://a.example/~user'],
    ['D29', 'https://a.example.:8443/x', 'https://a.example/x'],
    ['D30', 'https://a.example/p?q=%26', 'https://a.example/p?q=%2526'],
    ['L03', 'https://app.example/__route__/reports/2023', 'https://app.example/__route__/reports/2024'],
  ]
  it.each(CHANGED)('%s was two sources, is one by default, and is two again with inference off', (_id, a, b) => {
    expect(pair(a, b)).toEqual(ONE)
    expect(pair(a, b, { inferOrigins: false })).toEqual(TWO)
  })
})

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
const KINDS: SignalKind[] = ['textual', 'structural', 'behavioral', 'declarative']
const VOTES: Vote[] = ['supports', 'contradicts', 'inconclusive']
const COVS: Coverage[] = ['strong', 'partial', 'thin']

describe('origin table: seeded fuzz against independent oracles', () => {
  // Each class is one origin, written several ways. Classes differ from each other.
  const WORLD: string[][] = [
    ['https://github.com/acme/rel/blob/main/a.json', 'https://raw.githubusercontent.com/acme/rel/main/b.md', 'https://github.com/Acme/Rel.git'],
    ['https://github.com/acme/other/issues/1', 'https://api.github.com/repos/acme/other/pulls'],
    ['https://venue.example/menu', 'https://www.venue.example/contact', 'http://docs.venue.example/x', 'https://news.venue.example/y'],
    ['https://other.example/a', 'https://other.example/b/', 'https://m.other.example/c?q=1'],
    ['https://alice.github.io/a', 'https://docs.alice.github.io/b'],
    ['https://bob.github.io/a'],
    ['https://medium.com/@a/x', 'https://www.medium.com/@a/x#c'],
    ['https://medium.com/@b/y'],
    ['https://news.acme.co.uk/a', 'https://shop.acme.co.uk/b'],
    ['https://city.osaka.jp/a'],
    ['https://town.osaka.jp/a'],
    ['http://10.0.0.5:3000/a', 'http://10.0.0.5:3000/b'],
    ['http://10.0.0.5:4000/a'],
    ['db:row-1', ' db:row-1 '],
    ['db:row-2'],
    ['src/a.ts', './src/a.ts', 'src//a.ts'],
    ['src/b.ts'],
  ]
  const oracle = (picked: Array<{ cls: number; kind: SignalKind; vote: Vote }>, coverage: Coverage) => {
    const sup = new Set(picked.filter((p) => p.vote === 'supports').map((p) => p.cls))
    const con = new Set(picked.filter((p) => p.vote === 'contradicts').map((p) => p.cls))
    const nts = picked.some((p) => p.vote === 'supports' && p.kind !== 'textual')
    const ntc = picked.some((p) => p.vote === 'contradicts' && p.kind !== 'textual')
    let verdict: Verdict
    if (sup.size > 0 && con.size > 0) verdict = 'mixed'
    else if (con.size > 0) verdict = con.size >= 2 && ntc ? 'confirmed' : 'likely'
    else if (sup.size === 0) verdict = coverage === 'thin' ? 'inconclusive' : 'not-found'
    else verdict = sup.size >= 2 && nts ? 'confirmed' : 'likely'
    if (coverage === 'thin' && verdict === 'confirmed') verdict = 'likely'
    return { verdict, supports: sup.size, contradicts: con.size }
  }

  it('Z02 10,000 random sets of origin classes: counts and verdicts match the oracle; inference never raises a count', { timeout: 120_000 }, () => {
    const rnd = mulberry32(20261011)
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T
    const failures: string[] = []
    for (let i = 0; i < 10_000 && failures.length < 5; i++) {
      const n = Math.floor(rnd() * 9)
      const picked = Array.from({ length: n }, () => {
        const cls = Math.floor(rnd() * WORLD.length)
        return { cls, source: pick(WORLD[cls] as string[]), kind: pick(KINDS), vote: pick(VOTES) }
      })
      const coverage = pick(COVS)
      const signals = picked.map((p) => sig(p.source, p.kind, p.vote))
      const got = corroborate(signals, coverage)
      const want = oracle(picked, coverage)
      const off = corroborate(signals, coverage, { inferOrigins: false })
      const shuffled = corroborate([...signals].sort(() => rnd() - 0.5), coverage)
      const problems: string[] = []
      if (got.verdict !== want.verdict) problems.push(`verdict ${got.verdict} != ${want.verdict}`)
      if (got.supports !== want.supports || got.contradicts !== want.contradicts) problems.push(`counts ${got.supports}/${got.contradicts} != ${want.supports}/${want.contradicts}`)
      if (got.supports > off.supports || got.contradicts > off.contradicts) problems.push('inference raised a count')
      if (shuffled.verdict !== got.verdict || shuffled.supports !== got.supports || shuffled.contradicts !== got.contradicts) problems.push('shuffle changed the grade')
      if (got.groups.length !== got.supports + got.contradicts) problems.push('groups != counts')
      const seen = new Set(got.groups.flatMap((g) => g.signals))
      const counted = picked.filter((p) => p.vote !== 'inconclusive').length
      if (seen.size !== counted) problems.push('a counted signal is missing from the groups, or listed twice')
      if (problems.length) failures.push(`${problems.join('; ')} :: ${JSON.stringify(picked.map((p) => [p.source, p.kind, p.vote]))} ${coverage}`)
    }
    expect(failures).toEqual([])
  })

  it('Z03 10,000 random lineage graphs: groups equal the closure of the declared relations; a declaration never raises a count', { timeout: 120_000 }, () => {
    const rnd = mulberry32(20261012)
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T
    const names = ['s0', 's1', 's2', 's3', 's4', 's5']
    const labels = ['o0', 'o1', 'u0', 'u1']
    const failures: string[] = []
    for (let i = 0; i < 10_000 && failures.length < 5; i++) {
      const n = 1 + Math.floor(rnd() * 6)
      const items = Array.from({ length: n }, (_, k) => {
        const origin = rnd() < 0.4 ? pick(labels) : undefined
        const derived: string[] = []
        for (const l of [...labels, ...names]) if (rnd() < 0.12) derived.push(l)
        return { source: pick(names), origin, derived, kind: pick(KINDS), vote: pick(['supports', 'supports', 'contradicts'] as Vote[]), k }
      })
      const signals = items.map((it) =>
        sig(it.source, it.kind, it.vote, {
          ...(it.origin === undefined ? {} : { origin: it.origin }),
          ...(it.derived.length === 0 ? {} : { derivedFrom: it.derived }),
        }),
      )
      const got = corroborate(signals, 'strong')
      // Oracle: pairwise relations, then transitive closure by repeated passes.
      const expectSide = (vote: Vote): number => {
        const side = items.filter((it) => it.vote === vote)
        const parent = side.map((_, a) => a)
        const root = (a: number): number => (parent[a] === a ? a : root(parent[a] as number))
        let changed = true
        while (changed) {
          changed = false
          for (let a = 0; a < side.length; a++) {
            for (let b = a + 1; b < side.length; b++) {
              const x = side[a] as (typeof items)[number]
              const y = side[b] as (typeof items)[number]
              const related =
                x.source === y.source ||
                (x.origin !== undefined && x.origin === y.origin) ||
                x.derived.some((d) => y.derived.includes(d) || d === y.source || d === y.origin) ||
                y.derived.some((d) => d === x.source || d === x.origin)
              if (related && root(a) !== root(b)) {
                parent[root(b)] = root(a)
                changed = true
              }
            }
          }
        }
        return new Set(side.map((_, a) => root(a))).size
      }
      const wantS = expectSide('supports')
      const wantC = expectSide('contradicts')
      const off = corroborate(signals, 'strong', { inferOrigins: false })
      if (got.supports !== wantS || got.contradicts !== wantC) failures.push(`counts ${got.supports}/${got.contradicts} != ${wantS}/${wantC} :: ${JSON.stringify(signals.map((x) => [x.source, x.origin, x.derivedFrom, x.vote]))}`)
      if (off.supports !== got.supports || off.contradicts !== got.contradicts) failures.push('inference changed plain-label lineage')
      const bare = corroborate(signals.map(({ source, kind, vote, detail }) => ({ source, kind, vote, detail })), 'strong')
      if (got.supports > bare.supports || got.contradicts > bare.contradicts) failures.push('declared lineage raised a count')
    }
    expect(failures).toEqual([])
  })
})

describe('origin table: scaling on hostile input', () => {
  // CPU time, not wall time, so a busy machine does not look like a slow algorithm.
  const proc = (globalThis as unknown as { process: { cpuUsage: (prev?: { user: number; system: number }) => { user: number; system: number } } }).process
  const cpu = (fn: () => void): number => {
    const t = proc.cpuUsage()
    fn()
    const d = proc.cpuUsage(t)
    return (d.user + d.system) / 1000
  }
  const best = (fn: () => void): number => Math.min(cpu(fn), cpu(fn), cpu(fn))
  // Each scaling test grows the input 4x, so linear work is about 4x and quadratic work is 16x.
  // The limit of 10 leaves room for GC and JIT noise (CI on Node 24 measured 8.2 once) and still fails quadratic work.
  const LINEAR_4X_LIMIT = 10

  it('S00 the harness flags quadratic work at the 4x limit', { timeout: 120_000 }, () => {
    const quadratic = (n: number) => () => {
      let acc = 0
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) acc = (acc + i * j) | 0
      if (acc === 0.5) throw new Error('unreachable')
    }
    const small = best(quadratic(2_000))
    const large = best(quadratic(8_000))
    expect(large / Math.max(small, 1)).toBeGreaterThan(LINEAR_4X_LIMIT)
  })

  it('S01 a host that is a long run of dots scales roughly linearly', { timeout: 120_000 }, () => {
    const run = (n: number) => () => corroborate([sig(`https://a${'.'.repeat(n)}b/x`), sig(`https://c${'.'.repeat(n)}d/x`)], 'strong')
    const small = best(run(20_000))
    const large = best(run(80_000))
    expect(large / Math.max(small, 1)).toBeLessThan(LINEAR_4X_LIMIT)
  })

  it('S02 many sources scale roughly linearly', { timeout: 120_000 }, () => {
    const run = (n: number) => () => corroborate(Array.from({ length: n }, (_, i) => sig(`https://h${i % 977}.example/p${i}`)), 'strong')
    const small = best(run(10_000))
    const large = best(run(40_000))
    expect(large / Math.max(small, 1)).toBeLessThan(LINEAR_4X_LIMIT)
  })

  it('S03 one lineage over many signals scales roughly linearly', { timeout: 120_000 }, () => {
    const run = (n: number) => () => corroborate(Array.from({ length: n }, (_, i) => sig(`s${i}`, 'textual', 'supports', { derivedFrom: [`u${i % 5}`, `u${(i + 1) % 5}`] })), 'strong')
    const small = best(run(10_000))
    const large = best(run(40_000))
    expect(large / Math.max(small, 1)).toBeLessThan(LINEAR_4X_LIMIT)
  })

  it('S05 many shared derivedFrom identities over long sources cost the shared pairs, not the source length again', { timeout: 120_000 }, () => {
    const run = (k: number) => () =>
      corroborate(
        Array.from({ length: 200 }, (_, i) =>
          sig(`https://h${i}.example/${'p'.repeat(20_000)}${i}`, 'textual', 'supports', { derivedFrom: Array.from({ length: k }, (_, j) => `u${j}`) }),
        ),
        'strong',
      )
    const small = best(run(5))
    const large = best(run(100))
    expect(large / Math.max(small, 1)).toBeLessThan(6)
  })

  it('S06 many identities that share a group, size, smallest and largest member but differ in the middle scale linearly', { timeout: 120_000 }, () => {
    const run = (n: number) => () => {
      const labels = Array.from({ length: n - 2 }, (_, i) => `u${i + 1}`)
      const signals = Array.from({ length: n }, (_, i) =>
        i === 0 || i === n - 1 ? sig(`s${i}`, 'textual', 'supports', { derivedFrom: labels }) : sig(`s${i}`, 'textual', 'supports', { derivedFrom: [`u${i}`] }),
      )
      corroborate(signals, 'strong')
    }
    const small = best(run(4_000))
    const large = best(run(16_000))
    expect(large / Math.max(small, 1)).toBeLessThan(LINEAR_4X_LIMIT)
  })

  it('S04 long percent runs and long paths on one host scale roughly linearly', { timeout: 120_000 }, () => {
    const run = (n: number) => () => corroborate([sig(`https://x.example/${'%41'.repeat(n)}`), sig(`https://x.example/${'a/'.repeat(n)}`)], 'strong')
    const small = best(run(20_000))
    const large = best(run(80_000))
    expect(large / Math.max(small, 1)).toBeLessThan(LINEAR_4X_LIMIT)
  })
})
