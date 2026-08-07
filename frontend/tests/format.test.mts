import assert from 'node:assert/strict';
import test from 'node:test';
import { formatAllocationPercent, formatCompactFlowAmount, formatFlowNumber, formatFullFlowAmount, formatFullNumber, formatTrimmedNumber } from '../src/lib/format.ts';

test('shows 100% only for a completely full allocation segment', () => {
  assert.equal(formatAllocationPercent(100), '100%');
  assert.equal(formatAllocationPercent(99.9), '99.9%');
  assert.equal(formatAllocationPercent(99.99), '99.9%');
});

test('keeps whole-number labels compact for ordinary allocation segments', () => {
  assert.equal(formatAllocationPercent(60.7), '61%');
  assert.equal(formatAllocationPercent(36.2), '36%');
});

test('keeps flow amounts exact until they get long', () => {
  assert.equal(formatCompactFlowAmount(1234.5, 'USD'), '1,234.5 USD');
  assert.equal(formatCompactFlowAmount(-99999.9, 'USD'), '-99,999.9 USD');
});

test('cuts every amount of a whole unit or more to two decimals', () => {
  assert.equal(formatFlowNumber(216.44), '216.44');
  assert.equal(formatFlowNumber(71.3988), '71.39');
  assert.equal(formatFlowNumber(1234.567), '1,234.56');
  assert.equal(formatFlowNumber(-1234.567), '-1,234.56');
  assert.equal(formatFlowNumber(99999.999), '99,999.99');
});

test('keeps two significant digits below one unit so an amount never reads as zero', () => {
  assert.equal(formatFlowNumber(0.5), '0.5');
  assert.equal(formatFlowNumber(0.0625), '0.062');
  assert.equal(formatFlowNumber(0.00012345), '0.00012');
  assert.equal(formatFlowNumber(0), '0');
});

test('never shows more decimals than the field allows', () => {
  assert.equal(formatTrimmedNumber(0.00012345, 2), '0');
  assert.equal(formatTrimmedNumber(0.00012345, 4), '0.0001');
  assert.equal(formatTrimmedNumber(71.3988, 8), '71.39');
});

test('keeps the untrimmed value available for tooltips', () => {
  assert.equal(formatFullNumber(71.3988, 8), '71.3988');
  assert.equal(formatFullNumber(704754.72, 8), '704,754.72');
  assert.equal(formatFullFlowAmount(100000.55555, 'RUB'), '100,000.55555 RUB');
});

test('shortens long flow amounts to k/m/b/t', () => {
  assert.equal(formatCompactFlowAmount(348500, 'RUB'), '348.5K RUB');
  assert.equal(formatCompactFlowAmount(-704754.7, 'RUB'), '-704.7K RUB');
  assert.equal(formatCompactFlowAmount(12300000, 'RUB'), '12.3M RUB');
  assert.equal(formatCompactFlowAmount(4200000000, 'RUB'), '4.2B RUB');
});
