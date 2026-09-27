// Imports corroboration-kit BY NAME from the installed tarball (see
// verify-package.mjs) and calls the real API, asserting real outputs the way
// an actual consumer would. Not a smoke test: every exported function is
// called at least once at a boundary that pins its documented behavior.
import assert from 'node:assert/strict';

const { corroborate, coverageOf, verdictLabel, coverageLabel } = await import('corroboration-kit');

// --- coverageOf -------------------------------------------------------------

// A large pool sampled at exactly the 0.15 partial threshold.
assert.equal(coverageOf(15, 100, false), 'partial');
// Just under it is thin.
assert.equal(coverageOf(14, 100, false), 'thin');
// A small pool with structural access is strong even with a thin sample.
assert.equal(coverageOf(1, 30, true), 'strong');
// The same small pool without structural access caps at partial.
assert.equal(coverageOf(1, 30, false), 'partial');
// Zero or non-finite counts can never claim coverage.
assert.equal(coverageOf(0, 100, true), 'thin');
assert.equal(coverageOf(Number.NaN, 100, true), 'thin');
// Impossible input (sampled more than the pool, or a negative count) throws
// instead of silently grading as 'thin' -- almost always a caller bug.
assert.throws(() => coverageOf(5, 0, true), RangeError);
assert.throws(() => coverageOf(-1, 100, true), RangeError);

// --- corroborate: the independence, non-textual-gate, and coverage-ceiling rules ---

// Two textual signals from distinct sources: independence alone is not enough.
const textOnly = corroborate(
  [
    { source: 'article-a', kind: 'textual', vote: 'supports', detail: 'headline matches' },
    { source: 'article-b', kind: 'textual', vote: 'supports', detail: 'headline matches' },
  ],
  'strong',
);
assert.equal(textOnly.supports, 2);
assert.equal(textOnly.verdict, 'likely');

// Add one non-textual signal from a distinct source: now it clears the bar.
const withStructural = corroborate(
  [
    { source: 'article-a', kind: 'textual', vote: 'supports', detail: 'headline matches' },
    { source: 'schema-dump', kind: 'structural', vote: 'supports', detail: 'field present in schema' },
  ],
  'strong',
);
assert.equal(withStructural.verdict, 'confirmed');

// The same signals under thin coverage are capped back down to likely.
assert.equal(corroborate(withStructural.signals, 'thin').verdict, 'likely');

// Two citations of the same URL (differing only by fragment) count as one source.
const oneArtifactTwoFragments = corroborate(
  [
    { source: 'https://example.com/report#intro', kind: 'textual', vote: 'supports', detail: 'a' },
    { source: 'https://example.com/report#conclusion', kind: 'structural', vote: 'supports', detail: 'b' },
  ],
  'strong',
);
assert.equal(oneArtifactTwoFragments.supports, 1);
assert.equal(oneArtifactTwoFragments.verdict, 'likely');

// A malformed signal fails closed with a TypeError, not a silent misgrade.
assert.throws(
  () => corroborate([{ source: 'x', kind: 'Textual', vote: 'supports', detail: 'd' }], 'strong'),
  TypeError,
);

// Editing the caller's array after grading does not change the already-returned result.
const input = [{ source: 'a', kind: 'structural', vote: 'supports', detail: 'd' }];
const result = corroborate(input, 'strong');
input.push({ source: 'b', kind: 'structural', vote: 'supports', detail: 'd' });
assert.equal(result.supports, 1);

// --- labels -------------------------------------------------------------

assert.equal(verdictLabel('mixed'), 'mixed signals');
assert.equal(coverageLabel('thin'), 'thin coverage');
assert.throws(() => verdictLabel('bogus'), TypeError);
assert.throws(() => coverageLabel('bogus'), TypeError);

console.log('consumer-probe.mjs: all assertions passed');
