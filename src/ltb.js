'use strict';

const { cleanAddress, parseStreetDetails, getPartitionKey } = require('./normalize');

/**
 * Name-bearing columns that must never be written to any intermediate
 * file, log, or commit — see docs/TOHS-Rental-Background-Check-Scope.md
 * and docs/TOHS-City-Intel-Data-Pipeline-Spec.md §3.1. This is a hard
 * privacy rule, not a display-layer filter. `Co-op Name` is the
 * organization, not a person, and is intentionally not in this list.
 */
const LTB_NAME_COLUMNS = [
  'Landlord Name',
  'Landlord Agent Name',
  'Tenant Name',
  'Former Tenant Name',
  'Sub-Tenant Name',
  'Occupant Names',
  'Co-op Member Name',
];

/**
 * Normalizes one raw LTB CSV row into the shape stored in shard files, or
 * null if the row has no usable address. Every name-bearing column is
 * dropped before this function returns — never pass a raw LTB row further
 * into the pipeline (logs, intermediate files, commits) than this step.
 *
 * LTB addresses arrive as a single string, e.g.
 * "1002-111 BELMONT DR, LONDON, ON N6J4X9" (optional unit-hyphen prefix,
 * comma-separated city/province/postal). This adapter splits that shape
 * apart, then feeds the plain street portion into the same
 * cleanAddress()/parseStreetDetails() used by all other sources, per spec
 * §3.2 — it does not re-implement normalization.
 *
 * @param {Record<string, string>} row raw parsed CSV row
 * @returns {null | {key: string, record: object}} partition key + record, or null
 */
function normalizeLtbRow(row) {
  // Bilingual/near-duplicate address columns: prefer Rental Unit Address,
  // fall back to Complex Address, per spec §3.1.
  const rawAddress =
    row['Rental Unit Address'] ||
    row['Rental Unit Address//Adresse du logement locatif'] ||
    row['Complex Address'] ||
    '';
  if (!rawAddress || !rawAddress.trim()) return null;

  // Step 1: split off city/province/postal (everything after the first comma).
  const [streetPortionRaw, ...restParts] = rawAddress.split(',');
  const cityProvincePostal = restParts.join(',').trim();

  // Step 2: split off a leading unit-hyphen-number prefix, e.g. "1002-111 BELMONT DR".
  let streetPortion = streetPortionRaw.trim();
  let unit = '';
  const unitMatch = streetPortion.match(/^(\d+)-(\d.*)$/);
  if (unitMatch) {
    unit = unitMatch[1];
    streetPortion = unitMatch[2];
  }

  // Step 3: feed the cleaned, unit-stripped remainder into the shared,
  // unmodified normalization helpers so street-type/direction handling
  // stays identical to the other five sources.
  const cleaned = cleanAddress(streetPortion);
  const parsed = parseStreetDetails(cleaned);
  if (!parsed.streetName) return null;

  // Step 5: retain parsed city/province/postal since LTB is province-wide.
  let city = '';
  let province = '';
  let postal = '';
  if (cityProvincePostal) {
    // e.g. "LONDON, ON N6J4X9" already split on the outer comma above may
    // leave "LONDON" then " ON N6J4X9"; handle both single- and
    // double-comma variants defensively.
    const segments = cityProvincePostal.split(',').map((s) => s.trim()).filter(Boolean);
    if (segments.length >= 2) {
      city = segments[0];
      const provincePostal = segments[1].trim().split(/\s+/);
      province = provincePostal[0] || '';
      postal = provincePostal.slice(1).join(' ');
    } else if (segments.length === 1) {
      const provincePostal = segments[0].trim().split(/\s+/);
      province = provincePostal[0] || '';
      postal = provincePostal.slice(1).join(' ');
    }
  }

  const key = getPartitionKey(parsed.streetName);

  const record = {
    num: parsed.streetNum,
    street: parsed.streetName,
    type: parsed.streetType,
    dir: parsed.direction,
    unit,
    city,
    province,
    postal,
    fileNumber: row['File Number'] || '',
    applicationType: row['Application Type'] || '',
    documentType: row['Document Type'] || '',
    orderDate: row['Order Date'] || '',
    documentUrl: row['ContentDownload URL'] || '',
  };

  return { key, record };
}

module.exports = { LTB_NAME_COLUMNS, normalizeLtbRow };
