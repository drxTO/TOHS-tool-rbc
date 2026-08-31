'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  cleanAddress,
  parseStreetDetails,
  getPartitionKey,
  getFlexibleValue,
} = require('../src/normalize');

test('cleanAddress strips postal codes', () => {
  assert.equal(cleanAddress('90 ADELAIDE ST E M5H 3V9'), '90 ADELAIDE ST E');
});

test('cleanAddress strips CANADA/CAN/ONTARIO/ON/TORONTO tokens', () => {
  assert.equal(cleanAddress('501 Adelaide St E, Toronto, ON, Canada'), '501 ADELAIDE ST E, , ,');
});

test('cleanAddress collapses whitespace and uppercases', () => {
  assert.equal(cleanAddress('  5   agate   rd  '), '5 AGATE RD');
});

test('cleanAddress handles empty/falsy input', () => {
  assert.equal(cleanAddress(''), '');
  assert.equal(cleanAddress(null), '');
  assert.equal(cleanAddress(undefined), '');
});

test('parseStreetDetails splits direction and street type', () => {
  const result = parseStreetDetails('90 ADELAIDE ST E');
  assert.equal(result.streetNum, '90');
  assert.equal(result.streetName, 'ADELAIDE');
  assert.equal(result.streetType, 'ST');
  assert.equal(result.direction, 'E');
});

test('parseStreetDetails handles a full direction word', () => {
  const result = parseStreetDetails('552 ADELAIDE ST WEST');
  assert.equal(result.direction, 'W');
  assert.equal(result.streetType, 'ST');
  assert.equal(result.streetName, 'ADELAIDE');
});

test('parseStreetDetails handles no direction or type present', () => {
  const result = parseStreetDetails('5 AGATE');
  assert.equal(result.streetNum, '5');
  assert.equal(result.streetName, 'AGATE');
  assert.equal(result.streetType, '');
  assert.equal(result.direction, '');
});

test('parseStreetDetails handles a street type not in the whitelist (kept as part of name)', () => {
  const result = parseStreetDetails('150 BAMBURGH CRCL');
  assert.equal(result.streetType, '');
  assert.equal(result.streetName, 'BAMBURGH CRCL');
});

test('parseStreetDetails handles a single-token input', () => {
  const result = parseStreetDetails('ADELAIDE');
  assert.equal(result.streetNum, 'ADELAIDE');
  assert.equal(result.streetName, '');
});

test('getPartitionKey returns the uppercased first letter for a normal street name', () => {
  assert.equal(getPartitionKey('adelaide'), 'A');
  assert.equal(getPartitionKey('Zachary'), 'Z');
});

test('getPartitionKey falls back to 0-9 for a digit-led or empty street name', () => {
  assert.equal(getPartitionKey('1/2 Maplewood'), '0-9');
  assert.equal(getPartitionKey(''), '0-9');
  assert.equal(getPartitionKey(null), '0-9');
});

test('getFlexibleValue returns the first defined key among aliases', () => {
  const row = { STREETNAME: 'Bamburgh', street_name: 'ignored' };
  assert.equal(getFlexibleValue(row, ['STREET_NAME', 'street_name', 'STREETNAME']), 'ignored');
});

test('getFlexibleValue trims the matched value', () => {
  const row = { STREET_NAME: '  Bamburgh  ' };
  assert.equal(getFlexibleValue(row, ['STREET_NAME']), 'Bamburgh');
});

test('getFlexibleValue returns empty string when nothing matches', () => {
  assert.equal(getFlexibleValue({}, ['STREET_NAME', 'street_name']), '');
});
