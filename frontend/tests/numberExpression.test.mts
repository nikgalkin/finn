import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNumberExpressionInput, parseNumberExpression, substituteExpressionBase } from '../src/lib/numberExpression.ts';

test('keeps every character the expression parser understands', () => {
  assert.equal(normalizeNumberExpressionInput('(1 200,5 + 350) * 2 / 4 - 1'), '(1 200,5 + 350) * 2 / 4 - 1');
  assert.equal(normalizeNumberExpressionInput('1kk + 250k + 3b + 1mm'), '1kk + 250k + 3b + 1mm');
  assert.equal(normalizeNumberExpressionInput('100 + 12%'), '100 + 12%');
});

test('rejects an edit containing characters that are not part of an amount', () => {
  assert.equal(normalizeNumberExpressionInput('1000 руб'), null);
  assert.equal(normalizeNumberExpressionInput('$1 500'), null);
  assert.equal(normalizeNumberExpressionInput('1e5'), null);
  assert.equal(normalizeNumberExpressionInput('<script>'), null);
});

test('translates Cyrillic shorthand instead of dropping it', () => {
  assert.equal(normalizeNumberExpressionInput('5к'), '5k');
  assert.equal(normalizeNumberExpressionInput('15000 + 5К'), '15000 + 5k');
  assert.equal(normalizeNumberExpressionInput('2м'), '2m');
  assert.equal(normalizeNumberExpressionInput('3Б'), '3b');
  assert.equal(normalizeNumberExpressionInput('5кк'), '5kk');
});

test('rejects words instead of deleting them around an amount', () => {
  assert.equal(normalizeNumberExpressionInput('1000 руб'), null);
  assert.equal(normalizeNumberExpressionInput('касса 700'), null);
});

test('translates the letters the k, m and b keys emit under a Cyrillic layout', () => {
  assert.equal(normalizeNumberExpressionInput('5л'), '5k');
  assert.equal(normalizeNumberExpressionInput('5лл'), '5kk');
  assert.equal(normalizeNumberExpressionInput('2ь'), '2m');
  assert.equal(normalizeNumberExpressionInput('2ьь'), '2mm');
  assert.equal(normalizeNumberExpressionInput('3и'), '3b');
  assert.equal(parseNumberExpression('15000 + 5л'), 20000);
});

test('does not mistake words for shortcut letters', () => {
  assert.equal(normalizeNumberExpressionInput('5литров'), null);
  assert.equal(normalizeNumberExpressionInput('100иен'), null);
  assert.equal(normalizeNumberExpressionInput('700 наличными'), null);
});

test('a translated layout slip evaluates to the amount the typist meant', () => {
  assert.equal(parseNumberExpression('15000 + 5к'), 20000);
  assert.equal(parseNumberExpression('2м'), 2_000_000);
});

test('leaves half-typed expressions alone so they can be finished', () => {
  assert.equal(normalizeNumberExpressionInput('15000 +'), '15000 +');
  assert.equal(normalizeNumberExpressionInput('(100 + 20'), '(100 + 20');
  assert.equal(normalizeNumberExpressionInput('1,'), '1,');
});

test('normalizing the alphabet does not make an expression valid', () => {
  assert.equal(parseNumberExpression('1++2'), null);
  assert.equal(parseNumberExpression('(100 + 20'), null);
  assert.equal(parseNumberExpression('50% + 100'), null);
});

test('parses arithmetic precedence, parentheses and unary signs', () => {
  assert.equal(parseNumberExpression('2 + 3 * 4'), 14);
  assert.equal(parseNumberExpression('(2 + 3) * 4'), 20);
  assert.equal(parseNumberExpression('-(5 - 2)'), -3);
  assert.equal(parseNumberExpression('1 200,5 / 2'), 600.25);
});

test('keeps shorthand and monthly annual-rate calculations', () => {
  assert.equal(parseNumberExpression('1,5k * 2'), 3_000);
  assert.equal(parseNumberExpression('2mm + 3b'), 2_003_000_000_000);
  assert.equal(parseNumberExpression('100 + 12%'), 101);
  assert.equal(parseNumberExpression('100 - 12%'), 99);
});

test('appends to the exact value behind a shortened one', () => {
  assert.equal(substituteExpressionBase('75.65+0.0085', '75.65', '75.6515'), '75.6515+0.0085');
  assert.equal(parseNumberExpression(substituteExpressionBase('75.65+0.0085', '75.65', '75.6515')), 75.66);
  assert.equal(substituteExpressionBase('75.65-12%', '75.65', '75.6515'), '75.6515-12%');
});

test('leaves a retyped amount alone instead of restoring the hidden tail', () => {
  assert.equal(substituteExpressionBase('75.75', '75.65', '75.6515'), '75.75');
  assert.equal(substituteExpressionBase('175.65', '75.65', '75.6515'), '175.65');
  assert.equal(substituteExpressionBase('75.65+1', '', '75.6515'), '75.65+1');
});

test('rejects JavaScript syntax that is not arithmetic', () => {
  assert.equal(parseNumberExpression('1//2'), null);
  assert.equal(parseNumberExpression('1/*2'), null);
  assert.equal(parseNumberExpression('1e5'), null);
  assert.equal(parseNumberExpression('1..2'), null);
  assert.equal(parseNumberExpression('2(3)'), null);
  assert.equal(parseNumberExpression('1 / 0'), null);
});
