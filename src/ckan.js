'use strict';

const { parse } = require('csv-parse/sync');

const DEFAULT_HEADERS = {
  'User-Agent': 'TOHS-RBC-data-pipeline/1.0',
};

/**
 * Toronto Open Data (CKAN) package IDs. Same package IDs as the legacy
 * Apps Script's DATASETS constant.
 */
const TORONTO_DATASETS = {
  rentsafe: '4ef82789-e038-44ef-a478-a8f3590c3eb1',
  abp: '108c2bd1-6945-46f6-af92-02f5658ee7f7',
  str: '2ab20f80-3599-486a-8f8a-9cb59117977c',
  mth: 'a3a1d939-f792-4ac5-8b7c-a25648a7a98b',
  pdn: '0aa7e480-9b48-4919-98e0-6af7615b7809',
};

const TORONTO_BASE_URL = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action';

/** Ontario Open Data CKAN package id/name for the LTB Order Catalogue. */
const LTB_PACKAGE_ID = 'ltb-order-catalogue';
const ONTARIO_BASE_URL = 'https://data.ontario.ca/api/3/action';

/**
 * Resolves the current CSV resource URL for a CKAN package. CKAN resource
 * IDs/URLs change as source agencies publish new file versions, so this
 * must be called at runtime rather than hardcoding a URL — same approach
 * the legacy pipeline used (`package_show`) to bypass CKAN's
 * `datastore_search` endpoint, which was blocking requests.
 * @param {string} baseUrl e.g. TORONTO_BASE_URL or ONTARIO_BASE_URL
 * @param {string} packageId
 * @returns {Promise<string|null>} the resource's download URL, or null if no CSV resource exists
 */
async function resolveCsvResourceUrl(baseUrl, packageId) {
  const url = `${baseUrl}/package_show?id=${packageId}`;
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) return null;

  const body = await response.json();
  const resources = body?.result?.resources || [];
  const csvResource = resources.find(
    (r) => typeof r.format === 'string' && r.format.toLowerCase() === 'csv' && r.url
  );
  return csvResource ? csvResource.url : null;
}

/**
 * Fetches a CKAN package's CSV resource and parses it into an array of
 * plain row objects keyed by CSV header. Returns [] on any failure
 * (network error, no CSV resource found, etc.) so callers can treat a
 * failed source as "no records this run" rather than crashing the whole
 * sync, matching the legacy pipeline's fail-soft behaviour.
 * @param {string} baseUrl
 * @param {string} packageId
 * @returns {Promise<Record<string, string>[]>}
 */
async function fetchFullDataset(baseUrl, packageId) {
  try {
    const csvUrl = await resolveCsvResourceUrl(baseUrl, packageId);
    if (!csvUrl) {
      console.warn(`No CSV resource found for package ${packageId}`);
      return [];
    }

    const response = await fetch(csvUrl, { headers: DEFAULT_HEADERS });
    if (!response.ok) {
      console.warn(`CSV fetch failed for package ${packageId}: HTTP ${response.status}`);
      return [];
    }
    const csvText = await response.text();
    // Toronto's CKAN CSV exports have been observed with mixed line
    // endings (header row terminated with \r\n, data rows with bare \n),
    // which defeats csv-parse's record-delimiter auto-detection and
    // causes the entire body to be read as one record. Normalize to \n
    // before parsing rather than trying to guess/pass multiple
    // delimiters.
    const normalizedCsvText = csvText.replace(/\r\n/g, '\n');
    return parse(normalizedCsvText, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      // A stray unescaped comma/newline inside a free-text field has also
      // been observed to occasionally produce a ragged row; relax rather
      // than fail the whole fetch on one bad row.
      relax_column_count: true,
    });
  } catch (err) {
    console.warn(`Fetch error for package ${packageId}: ${err.message}`);
    return [];
  }
}

/**
 * Fetches one of the five Toronto Open Data sources by short key
 * (rentsafe/abp/str/mth/pdn).
 * @param {keyof typeof TORONTO_DATASETS} key
 * @returns {Promise<Record<string, string>[]>}
 */
function fetchTorontoDataset(key) {
  return fetchFullDataset(TORONTO_BASE_URL, TORONTO_DATASETS[key]);
}

/** Fetches the Ontario LTB Order Catalogue raw CSV rows. */
function fetchLtbDataset() {
  return fetchFullDataset(ONTARIO_BASE_URL, LTB_PACKAGE_ID);
}

module.exports = {
  TORONTO_DATASETS,
  TORONTO_BASE_URL,
  LTB_PACKAGE_ID,
  ONTARIO_BASE_URL,
  resolveCsvResourceUrl,
  fetchFullDataset,
  fetchTorontoDataset,
  fetchLtbDataset,
};
