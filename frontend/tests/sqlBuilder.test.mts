import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildColumnAssignment,
  buildJsonAssignment,
  buildJsonElementMatch,
  buildMatchedElementAssignment,
  buildUpdateStatement,
  buildWhereClause,
  defaultWhereColumn,
  quoteIdentifier,
  rangeFromValues,
  splitJsonPathAtFirstIndex,
  toEditableText,
  toJsonValueLiteral,
  toSqlInputLiteral
} from '../src/lib/sqlBuilder.ts';
import type { WhereClause } from '../src/lib/sqlBuilder.ts';

const clause = (overrides: Partial<WhereClause> = {}): WhereClause => ({
  mode: 'column',
  column: 'month',
  jsonColumn: 'data',
  jsonPath: '',
  anyElement: false,
  operator: '=',
  value: '2026-07',
  secondValue: '',
  ...overrides
});

const jsonClause = (overrides: Partial<WhereClause> = {}): WhereClause =>
  clause({ mode: 'json', ...overrides });

test('quotes only identifiers that need it', () => {
  assert.equal(quoteIdentifier('month'), 'month');
  assert.equal(quoteIdentifier('duration_seconds'), 'duration_seconds');
  assert.equal(quoteIdentifier('order'), 'order');
  assert.equal(quoteIdentifier('my column'), '"my column"');
  assert.equal(quoteIdentifier('2024'), '"2024"');
  assert.equal(quoteIdentifier('say"hi'), '"say""hi"');
});

test('converts typed text into SQL literals', () => {
  assert.equal(toSqlInputLiteral('2026-07'), "'2026-07'");
  assert.equal(toSqlInputLiteral('90'), '90');
  assert.equal(toSqlInputLiteral('-12.5'), '-12.5');
  assert.equal(toSqlInputLiteral("O'Brien"), "'O''Brien'");
  assert.equal(toSqlInputLiteral('null'), 'NULL');
  assert.equal(toSqlInputLiteral('NULL'), 'NULL');
  assert.equal(toSqlInputLiteral(''), "''");
  assert.equal(toSqlInputLiteral('  spaced  '), "'spaced'");
  // already quoted text is left alone so the user can take manual control
  assert.equal(toSqlInputLiteral("'raw value'"), "'raw value'");
});

test('builds each condition shape', () => {
  assert.equal(buildWhereClause(clause()), "month = '2026-07'");
  assert.equal(buildWhereClause(clause({ operator: '<>' })), "month <> '2026-07'");
  assert.equal(buildWhereClause(clause({ column: 'duration_seconds', operator: '>=', value: '120' })), 'duration_seconds >= 120');
  assert.equal(
    buildWhereClause(clause({ operator: 'BETWEEN', value: '2026-01', secondValue: '2026-06' })),
    "month BETWEEN '2026-01' AND '2026-06'"
  );
  assert.equal(
    buildWhereClause(clause({ operator: 'IN', value: '2026-01, 2026-02 , 2026-03' })),
    "month IN ('2026-01', '2026-02', '2026-03')"
  );
  assert.equal(buildWhereClause(clause({ operator: 'LIKE', value: '2026-%' })), "month LIKE '2026-%'");
  assert.equal(buildWhereClause(clause({ operator: 'IS NULL', value: '' })), 'month IS NULL');
  assert.equal(buildWhereClause(clause({ operator: 'IS NOT NULL', value: '' })), 'month IS NOT NULL');
});

test('treats an incomplete condition as unusable', () => {
  assert.equal(buildWhereClause(clause({ value: '   ' })), null);
  assert.equal(buildWhereClause(clause({ column: '' })), null);
  assert.equal(buildWhereClause(clause({ operator: 'BETWEEN', value: '2026-01', secondValue: '' })), null);
  assert.equal(buildWhereClause(clause({ operator: 'IN', value: ' , , ' })), null);
});

test('never emits an UPDATE that would hit every row', () => {
  const statement = buildUpdateStatement({
    table: 'snapshots',
    assignment: 'duration_seconds = 120',
    where: clause({ value: '' })
  });
  assert.match(statement, /WHERE \/\* add a condition \*\/;/);
  assert.doesNotMatch(statement, /WHERE;/);
});

test('assembles a range update end to end', () => {
  assert.equal(
    buildUpdateStatement({
      table: 'snapshots',
      assignment: buildColumnAssignment('duration_seconds', '120'),
      where: clause({ operator: 'BETWEEN', value: '2026-01', secondValue: '2026-06' })
    }),
    "UPDATE snapshots\nSET duration_seconds = 120\nWHERE month BETWEEN '2026-01' AND '2026-06';"
  );
});

test('assembles a json_set update end to end', () => {
  assert.equal(
    buildUpdateStatement({
      table: 'snapshots',
      assignment: buildJsonAssignment('data', '$.organizations[0].name', 'Alfa-Bank'),
      where: clause()
    }),
    "UPDATE snapshots\nSET data = json_set(data, '$.organizations[0].name', 'Alfa-Bank')\nWHERE month = '2026-07';"
  );
});

test('splits a JSON path at its first array index', () => {
  assert.deepEqual(splitJsonPathAtFirstIndex('$.organizations[0].id'), {
    arrayPath: '$.organizations',
    elementPath: '$.id'
  });
  // nested indexes wildcard the outer one
  assert.deepEqual(splitJsonPathAtFirstIndex('$.organizations[0].balances[1].amount'), {
    arrayPath: '$.organizations',
    elementPath: '$.balances[1].amount'
  });
  // the element itself, with nothing after the index
  assert.deepEqual(splitJsonPathAtFirstIndex('$.organizations[2]'), {
    arrayPath: '$.organizations',
    elementPath: ''
  });

  // nothing to iterate
  assert.equal(splitJsonPathAtFirstIndex('$.rates.USD'), null);
  assert.equal(splitJsonPathAtFirstIndex('$'), null);
  assert.equal(splitJsonPathAtFirstIndex('[0]'), null);
});

test('conditions on a value inside a JSON document', () => {
  assert.equal(
    buildWhereClause(jsonClause({ jsonPath: '$.rates.USD', operator: '>', value: '80' })),
    "json_extract(data, '$.rates.USD') > 80"
  );
  assert.equal(
    buildWhereClause(jsonClause({ jsonPath: '$.comment', operator: 'LIKE', value: '%bonus%' })),
    "json_extract(data, '$.comment') LIKE '%bonus%'"
  );
  assert.equal(
    buildWhereClause(jsonClause({ jsonPath: '$.rates.USD', operator: 'IS NULL', value: '' })),
    "json_extract(data, '$.rates.USD') IS NULL"
  );

  // an unfinished path is unusable
  assert.equal(buildWhereClause(jsonClause({ jsonPath: '  ' })), null);
  assert.equal(buildWhereClause(jsonClause({ jsonPath: '$.a', jsonColumn: '' })), null);
});

// This is the "every row whose organizations contain this id" case.
test('scans every array element when asked', () => {
  // a numeric id stays unquoted so it compares against a JSON number
  assert.equal(
    buildWhereClause(jsonClause({
      jsonPath: '$.organizations[0].id',
      anyElement: true,
      value: '123'
    })),
    "EXISTS (SELECT 1 FROM json_each(data, '$.organizations') WHERE json_extract(value, '$.id') = 123)"
  );

  // the demo data uses uuid ids, which must be quoted
  assert.equal(
    buildWhereClause(jsonClause({
      jsonPath: '$.organizations[0].id',
      anyElement: true,
      value: 'ad2c48a2-5cd4-4bf9'
    })),
    "EXISTS (SELECT 1 FROM json_each(data, '$.organizations') WHERE json_extract(value, '$.id') = 'ad2c48a2-5cd4-4bf9')"
  );

  // comparing whole elements, with no path inside them
  assert.equal(
    buildWhereClause(jsonClause({ jsonPath: '$.tags[0]', anyElement: true, value: 'cash' })),
    "EXISTS (SELECT 1 FROM json_each(data, '$.tags') WHERE value = 'cash')"
  );

  // operators carry through the scan
  assert.equal(
    buildWhereClause(jsonClause({
      jsonPath: '$.organizations[0].id',
      anyElement: true,
      operator: 'IN',
      value: '1, 2'
    })),
    "EXISTS (SELECT 1 FROM json_each(data, '$.organizations') WHERE json_extract(value, '$.id') IN (1, 2))"
  );

  // asking to scan a path with no array index cannot work
  assert.equal(buildWhereClause(jsonClause({ jsonPath: '$.rates.USD', anyElement: true })), null);
});

test('exposes the element-level test on its own', () => {
  assert.equal(
    buildJsonElementMatch(jsonClause({ jsonPath: '$.organizations[0].id', value: '123' })),
    "json_extract(value, '$.id') = 123"
  );
  // the element itself, when the path stops at the index
  assert.equal(
    buildJsonElementMatch(jsonClause({ jsonPath: '$.tags[0]', value: 'cash' })),
    "value = 'cash'"
  );
  assert.equal(buildJsonElementMatch(jsonClause({ jsonPath: '$.rates.USD' })), null);
});

test('rewrites every matching element instead of one index', () => {
  const match = "json_extract(value, '$.id') = 123";

  assert.equal(
    buildMatchedElementAssignment({
      column: 'data',
      arrayPath: '$.organizations',
      elementPath: '$.name',
      text: 'Alfabank',
      match
    }),
    "data = json_set(data, '$.organizations', "
    + "(SELECT json_group_array(CASE WHEN json_extract(value, '$.id') = 123 "
    + "THEN json_set(value, '$.name', 'Alfabank') ELSE value END) "
    + "FROM json_each(data, '$.organizations')))"
  );

  // an empty element path replaces the whole element
  assert.equal(
    buildMatchedElementAssignment({
      column: 'data',
      arrayPath: '$.tags',
      elementPath: '',
      text: 'deposit',
      match: "value = 'cash'"
    }),
    "data = json_set(data, '$.tags', "
    + "(SELECT json_group_array(CASE WHEN value = 'cash' THEN 'deposit' ELSE value END) "
    + "FROM json_each(data, '$.tags')))"
  );

  // elements are passed through bare; json(value) would break on string arrays
  assert.doesNotMatch(
    buildMatchedElementAssignment({
      column: 'data', arrayPath: '$.tags', elementPath: '', text: 'x', match: 'value = 1'
    }),
    /json\(value\)/
  );
});

test('assembles a JSON-conditioned update end to end', () => {
  assert.equal(
    buildUpdateStatement({
      table: 'snapshots',
      assignment: buildJsonAssignment('data', '$.organizations[0].name', 'Alfa-Bank'),
      where: jsonClause({ jsonPath: '$.organizations[0].id', anyElement: true, value: '123' })
    }),
    "UPDATE snapshots\n"
    + "SET data = json_set(data, '$.organizations[0].name', 'Alfa-Bank')\n"
    + "WHERE EXISTS (SELECT 1 FROM json_each(data, '$.organizations') WHERE json_extract(value, '$.id') = 123);"
  );
});

test('derives a BETWEEN range from the rows on screen', () => {
  assert.deepEqual(rangeFromValues(['2026-03', '2026-01', '2026-06']), { from: '2026-01', to: '2026-06' });
  assert.deepEqual(rangeFromValues([90, 165, 140]), { from: '90', to: '165' });
  assert.deepEqual(rangeFromValues([5, null, 12]), { from: '5', to: '12' });

  // nothing sensible to offer
  assert.equal(rangeFromValues(['2026-01']), null);
  assert.equal(rangeFromValues(['same', 'same']), null);
  assert.equal(rangeFromValues([]), null);
});

test('starts the condition on a primary key the result carries', () => {
  const columns = [
    { name: 'id', primaryKey: true },
    { name: 'month', primaryKey: false },
    { name: 'data', primaryKey: false }
  ];

  assert.equal(defaultWhereColumn(columns, { id: 3, month: '2026-07' }, 'data'), 'id');
  // the key is not in the result, so fall back to a column that is
  assert.equal(defaultWhereColumn(columns, { month: '2026-07' }, 'data'), 'month');
  assert.equal(defaultWhereColumn(columns, {}, 'data'), 'data');
  // a NULL value still counts as present; only undefined means absent
  assert.equal(defaultWhereColumn(columns, { id: null }, 'data'), 'id');
});

test('renders database values as editable text', () => {
  assert.equal(toEditableText(null), 'NULL');
  assert.equal(toEditableText(90), '90');
  assert.equal(toEditableText('2026-07'), '2026-07');
  assert.equal(toEditableText(true), 'true');
  // picking a branch of a JSON tree must not stringify to [object Object]
  assert.equal(toEditableText({ a: 1 }), '{"a":1}');
  assert.equal(toEditableText([1, 2]), '[1,2]');
});

test('wraps nested JSON in json() so it is not stored as text', () => {
  assert.equal(toJsonValueLiteral('{"a":1}'), `json('{"a":1}')`);
  assert.equal(toJsonValueLiteral('[1,2]'), `json('[1,2]')`);
  assert.equal(toJsonValueLiteral(`{"note":"it's here"}`), `json('{"note":"it''s here"}')`);

  // scalars keep their ordinary literal form
  assert.equal(toJsonValueLiteral('77.9'), '77.9');
  assert.equal(toJsonValueLiteral('T-Bank'), "'T-Bank'");
  assert.equal(toJsonValueLiteral('NULL'), 'NULL');
  // looks like JSON but is not, so treat it as text
  assert.equal(toJsonValueLiteral('{not json'), "'{not json'");
});

test('builds a json_set assignment for a nested object', () => {
  assert.equal(
    buildJsonAssignment('data', '$.rates', '{"USD":80}'),
    `data = json_set(data, '$.rates', json('{"USD":80}'))`
  );
  assert.equal(
    buildJsonAssignment('data', '$.rates.USD', '80'),
    `data = json_set(data, '$.rates.USD', 80)`
  );
});
