import assert from 'node:assert/strict';
import test from 'node:test';
import {
  appendJsonPath,
  collectBranchPaths,
  describeJsonValue,
  formatJsonPreview,
  parseJsonCell,
  toSqlLiteral
} from '../src/lib/sqlJson.ts';

test('detects JSON objects and arrays but leaves scalars alone', () => {
  assert.deepEqual(parseJsonCell('{"a":1}')?.value, { a: 1 });
  assert.deepEqual(parseJsonCell('[1,2,3]')?.value, [1, 2, 3]);
  assert.equal(parseJsonCell('  {"a":1}  ')?.preview, '1 key');

  // valid JSON, but better shown as an ordinary cell
  assert.equal(parseJsonCell('42'), null);
  assert.equal(parseJsonCell('"plain"'), null);
  assert.equal(parseJsonCell('null'), null);

  // not JSON at all
  assert.equal(parseJsonCell('{broken'), null);
  assert.equal(parseJsonCell('hello'), null);
  assert.equal(parseJsonCell(7), null);
  assert.equal(parseJsonCell(null), null);
});

test('summarises size without repeating the brace icon', () => {
  assert.equal(formatJsonPreview({ a: 1, b: 2 }), '2 keys');
  assert.equal(formatJsonPreview({ a: 1 }), '1 key');
  assert.equal(formatJsonPreview([]), '0 items');
  assert.equal(formatJsonPreview(['x']), '1 item');
});

test('builds SQLite JSON paths, quoting keys that need it', () => {
  assert.equal(appendJsonPath('$', 'rates'), '$.rates');
  assert.equal(appendJsonPath('$', 'organizations'), '$.organizations');
  assert.equal(appendJsonPath('$.organizations', 0), '$.organizations[0]');
  assert.equal(appendJsonPath('$.organizations[0]', 'name'), '$.organizations[0].name');
  assert.equal(appendJsonPath('$', '_private'), '$._private');

  // keys that are not plain identifiers must be quoted
  assert.equal(appendJsonPath('$', 'my key'), '$."my key"');
  assert.equal(appendJsonPath('$', '2024'), '$."2024"');
  assert.equal(appendJsonPath('$', 'a.b'), '$."a.b"');
  assert.equal(appendJsonPath('$', 'say "hi"'), '$."say ""hi"""');
});

test('renders SQL literals, escaping embedded quotes', () => {
  assert.equal(toSqlLiteral('T-Bank'), "'T-Bank'");
  assert.equal(toSqlLiteral("O'Brien"), "'O''Brien'");
  assert.equal(toSqlLiteral(77.9), '77.9');
  assert.equal(toSqlLiteral(true), 'true');
  assert.equal(toSqlLiteral(null), 'NULL');
  assert.equal(toSqlLiteral(undefined), 'NULL');
  assert.equal(toSqlLiteral({ a: 1 }), `json('{"a":1}')`);
  assert.equal(toSqlLiteral(["it's"]), `json('["it''s"]')`);
});

test('collects the branches that expand-all has to open', () => {
  const value = {
    rates: { USD: 77.9 },
    organizations: [
      { name: 'T-Bank', balances: [{ amount: 1 }] },
      { name: 'Cash' }
    ],
    comment: 'plain text'
  };

  // every object and array, leaves excluded
  assert.deepEqual(collectBranchPaths(value), [
    '$',
    '$.rates',
    '$.organizations',
    '$.organizations[0]',
    '$.organizations[0].balances',
    '$.organizations[0].balances[0]',
    '$.organizations[1]'
  ]);

  // the initial view opens the root and its direct children only
  assert.deepEqual(collectBranchPaths(value, '$', 1), ['$', '$.rates', '$.organizations']);
  assert.deepEqual(collectBranchPaths(value, '$', 0), ['$']);

  // nothing to expand
  assert.deepEqual(collectBranchPaths({}), ['$']);
  assert.deepEqual(collectBranchPaths('scalar'), []);
  assert.deepEqual(collectBranchPaths(null), []);
});

test('describes node types for the tree summary', () => {
  assert.equal(describeJsonValue(null), 'null');
  assert.equal(describeJsonValue([1, 2]), 'array · 2');
  assert.equal(describeJsonValue({ a: 1, b: 2, c: 3 }), 'object · 3');
  assert.equal(describeJsonValue('text'), 'string');
  assert.equal(describeJsonValue(5), 'number');
  assert.equal(describeJsonValue(false), 'boolean');
});
