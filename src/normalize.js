'use strict';

/**
 * Address normalization helpers.
 *
 * Ported near line-for-line from the legacy Google Apps Script pipeline
 * (archive/background/legacy-squarespace-elements-rbc-build-0/rbc-build-0/city-intel-api.txt
 * in the tohs-systemv1 repo) so all five existing Toronto Open Data sources
 * keep normalizing identically. Do not change behaviour here without adding
 * a matching test in test/normalize.test.js — a future contributor changing
 * these functions silently would change output for every existing source.
 */

const STREET_TYPES = ['ST', 'AVE', 'RD', 'CRES', 'BLVD', 'PL', 'DR', 'CRT', 'WAY', 'LANE'];
const DIRECTIONS = ['W', 'E', 'N', 'S', 'WEST', 'EAST', 'NORTH', 'SOUTH'];

/**
 * Uppercases, strips postal codes and CANADA/CAN/ONTARIO/ON/TORONTO tokens,
 * collapses whitespace. Same behaviour as the Apps Script's cleanAddress().
 * @param {string} addr
 * @returns {string}
 */
function cleanAddress(addr) {
  if (!addr) return '';
  let clean = addr.toUpperCase().trim();
  clean = clean.replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/g, '');
  clean = clean.replace(/\b(CANADA|CAN|ONTARIO|ON|TORONTO)\b/g, '');
  clean = clean.replace(/\s+/g, ' ');
  return clean.trim();
}

/**
 * Splits a cleaned address string into street number, street name, street
 * type, and direction. Same behaviour as the Apps Script's
 * parseStreetDetails(): splits off a trailing direction token, then a
 * trailing street-type token from the fixed whitelist, leaving street number
 * and street name.
 * @param {string} addrStr already-cleaned address string
 * @returns {{streetNum: string, streetName: string, streetType: string, direction: string, baseAddress: string}}
 */
function parseStreetDetails(addrStr) {
  const parts = addrStr.split(' ');
  const streetNum = parts[0];
  let streetName = '';
  let streetType = '';
  let direction = '';

  if (parts.length > 1) {
    const lastWord = parts[parts.length - 1];
    if (DIRECTIONS.indexOf(lastWord) !== -1) {
      direction = lastWord.charAt(0);
      parts.pop();
    }
    const potentialType = parts[parts.length - 1];
    if (STREET_TYPES.indexOf(potentialType) !== -1) {
      streetType = potentialType;
      parts.pop();
    }
    streetName = parts.slice(1).join(' ');
  }

  return {
    streetNum,
    streetName,
    streetType,
    direction,
    baseAddress: addrStr,
  };
}

/**
 * First letter of the street name, uppercased, or "0-9" if it isn't a plain
 * A-Z letter (covers digit-led street names and empty input). Same
 * behaviour as the Apps Script's getPartitionKey().
 * @param {string} streetName
 * @returns {string} a single uppercase letter A-Z, or "0-9"
 */
function getPartitionKey(streetName) {
  if (!streetName) return '0-9';
  const firstChar = streetName.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(firstChar) ? firstChar : '0-9';
}

/**
 * Returns the first defined, non-null value among structuralKeys on row,
 * trimmed to a string, or '' if none match. Same behaviour as the Apps
 * Script's getFlexibleValue() — datasets vary in header casing/naming
 * across CKAN resource refreshes, so callers probe several known aliases.
 * @param {Record<string, unknown>} row
 * @param {string[]} structuralKeys
 * @returns {string}
 */
function getFlexibleValue(row, structuralKeys) {
  for (let i = 0; i < structuralKeys.length; i++) {
    const value = row[structuralKeys[i]];
    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }
  return '';
}

module.exports = {
  STREET_TYPES,
  DIRECTIONS,
  cleanAddress,
  parseStreetDetails,
  getPartitionKey,
  getFlexibleValue,
};
