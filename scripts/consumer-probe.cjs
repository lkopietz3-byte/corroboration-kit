// Proves CommonJS require() works against the packed tarball, on a Node
// version that supports require(esm) (>=20.19.0 or >=22.12.0). This file is
// plain CommonJS regardless of the consumer project's "type": "module",
// because a .cjs extension always forces CommonJS. Run by verify-package.mjs.
const assert = require('node:assert/strict');

const { corroborate, coverageOf, verdictLabel, coverageLabel } = require('corroboration-kit');

assert.equal(typeof corroborate, 'function');
assert.equal(coverageOf(15, 100, false), 'partial');
assert.equal(coverageOf(14, 100, false), 'thin');

const result = corroborate(
  [
    { source: 'doc-1', kind: 'structural', vote: 'supports', detail: 'schema match' },
    { source: 'doc-2', kind: 'behavioral', vote: 'supports', detail: 'observed behavior match' },
  ],
  'strong',
);
assert.equal(result.verdict, 'confirmed');
assert.equal(result.supports, 2);
assert.equal(result.direction, 'supports');
assert.equal(verdictLabel('confirmed'), verdictLabel(result.verdict));
assert.equal(typeof coverageLabel('strong'), 'string');

console.log('CommonJS require() probe passed');
