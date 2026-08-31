'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LTB_NAME_COLUMNS, normalizeLtbRow } = require('../src/ltb');

test('LTB_NAME_COLUMNS lists every name-bearing column and excludes Co-op Name', () => {
  assert.deepEqual(LTB_NAME_COLUMNS, [
    'Landlord Name',
    'Landlord Agent Name',
    'Tenant Name',
    'Former Tenant Name',
    'Sub-Tenant Name',
    'Occupant Names',
    'Co-op Member Name',
  ]);
  assert.equal(LTB_NAME_COLUMNS.includes('Co-op Name'), false);
});

test('normalizeLtbRow never includes any name-bearing field on the output record', () => {
  const row = {
    'Rental Unit Address': '1002-111 BELMONT DR, LONDON, ON N6J4X9',
    'Landlord Name': 'Jane Doe',
    'Landlord Agent Name': 'Some Agent',
    'Tenant Name': 'John Smith',
    'Former Tenant Name': 'Old Tenant',
    'Sub-Tenant Name': 'Sub Person',
    'Occupant Names': 'Occupant A; Occupant B',
    'Co-op Member Name': 'Member Name',
    'Co-op Name': 'Some Co-op',
    'File Number': 'LTB-ABC-12345',
    'Application Type': 'L1',
    'Document Type': 'Order',
    'Order Date': '2026-03-01',
    'ContentDownload URL': 'https://example.com/order.pdf',
  };

  const result = normalizeLtbRow(row);
  assert.ok(result);
  const serialized = JSON.stringify(result.record);
  for (const nameField of LTB_NAME_COLUMNS) {
    assert.equal(serialized.includes('Jane Doe'), false);
    assert.equal(serialized.includes('John Smith'), false);
    assert.equal(serialized.includes('Some Agent'), false);
    assert.equal(serialized.includes('Old Tenant'), false);
    assert.equal(serialized.includes('Sub Person'), false);
    assert.equal(serialized.includes('Occupant A'), false);
    assert.equal(serialized.includes('Member Name'), false);
    // The field name itself must not appear as a key either.
    assert.equal(Object.prototype.hasOwnProperty.call(result.record, nameField), false);
  }
});

test('normalizeLtbRow splits a unit-hyphen-number prefix into unit', () => {
  const row = { 'Rental Unit Address': '1002-111 BELMONT DR, LONDON, ON N6J4X9' };
  const result = normalizeLtbRow(row);
  assert.ok(result);
  assert.equal(result.record.unit, '1002');
  assert.equal(result.record.num, '111');
  assert.equal(result.record.street, 'BELMONT');
  assert.equal(result.record.type, 'DR');
  assert.equal(result.record.city, 'LONDON');
  assert.equal(result.record.province, 'ON');
  assert.equal(result.record.postal, 'N6J4X9');
});

test('normalizeLtbRow handles an address with no unit prefix', () => {
  const row = { 'Rental Unit Address': '90 ADELAIDE ST E, TORONTO, ON M5H3V9' };
  const result = normalizeLtbRow(row);
  assert.ok(result);
  assert.equal(result.record.unit, '');
  assert.equal(result.record.num, '90');
  assert.equal(result.record.street, 'ADELAIDE');
  assert.equal(result.record.type, 'ST');
  assert.equal(result.record.dir, 'E');
});

test('normalizeLtbRow falls back to Complex Address when Rental Unit Address is empty', () => {
  const row = { 'Rental Unit Address': '', 'Complex Address': '50 ALEXANDER ST, TORONTO, ON' };
  const result = normalizeLtbRow(row);
  assert.ok(result);
  assert.equal(result.record.street, 'ALEXANDER');
});

test('normalizeLtbRow returns null when no address is present', () => {
  assert.equal(normalizeLtbRow({}), null);
  assert.equal(normalizeLtbRow({ 'Rental Unit Address': '', 'Complex Address': '' }), null);
});

test('normalizeLtbRow assigns a partition key consistent with getPartitionKey', () => {
  const row = { 'Rental Unit Address': '90 ADELAIDE ST E, TORONTO, ON' };
  const result = normalizeLtbRow(row);
  assert.equal(result.key, 'A');
});
