'use strict';

const proj4 = require('proj4');
const { cleanAddress, parseStreetDetails, getPartitionKey, getFlexibleValue } = require('./normalize');
const { fetchTorontoDataset, fetchLtbDataset } = require('./ckan');
const { normalizeLtbRow } = require('./ltb');
const { commitFile } = require('./github');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// Planned Developments X/Y conversion. Toronto's PDN dataset publishes
// coordinates in Toronto MTM Zone 10 (NAD27); the RBC front-end map
// (Webtools/Rental Background Checks/cityintel.html, cityintel-2.html)
// plots pdn.lat/pdn.lng directly with Leaflet and does a 150m Haversine
// proximity check against the selected address, so these must be
// standard WGS84 lat/lng, not raw MTM X/Y. Same projection strings as the
// legacy Apps Script (which used a local proj4.gs file).
const MTM_ZONE_10 = '+proj=tmerc +lat_0=0 +lon_0=-79.5 +k=0.9999 +x_0=304800 +y_0=0 +datum=NAD27 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

/** Shard size warning threshold in bytes, per spec §5. */
const SHARD_WARNING_BYTES = 8 * 1024 * 1024;

function createEmptyPartition() {
  return { rentsafe: [], abp: [], str: [], mth: [], pdn: [], ltb: [] };
}

function createPartitions() {
  const partitions = {};
  ALPHABET.forEach((char) => {
    partitions[char] = createEmptyPartition();
  });
  partitions['0-9'] = createEmptyPartition();
  return partitions;
}

function partitionTotalItems(partition) {
  return (
    partition.rentsafe.length +
    partition.abp.length +
    partition.str.length +
    partition.mth.length +
    partition.pdn.length +
    partition.ltb.length
  );
}

async function ingestAbp(partitions) {
  const rows = await fetchTorontoDataset('abp');
  for (const row of rows) {
    const streetName = getFlexibleValue(row, ['STREET_NAME', 'street_name', 'STREETNAME']);
    if (!streetName) continue;
    const key = getPartitionKey(streetName);
    partitions[key].abp.push({
      num: getFlexibleValue(row, ['STREET_NUM', 'street_num', 'STREETNUM', 'NUMBER']),
      street: streetName.toUpperCase().trim(),
      type: getFlexibleValue(row, ['STREET_TYPE', 'street_type', 'STREETTYPE', 'TYPE']),
      dir: getFlexibleValue(row, ['STREET_DIRECTION', 'street_direction', 'DIRECTION', 'DIR']),
      permit: getFlexibleValue(row, ['PERMIT_NUM', 'permit_num', 'PERMITNUMBER', 'PERMIT']),
      status: getFlexibleValue(row, ['STATUS', 'status']),
      desc: getFlexibleValue(row, ['DESCRIPTION', 'description', 'DESC']),
    });
  }
  return rows.length;
}

async function ingestRentSafe(partitions) {
  const rows = await fetchTorontoDataset('rentsafe');
  for (const row of rows) {
    const rawAddr = getFlexibleValue(row, ['SITE ADDRESS', 'site_address', 'SITE_ADDRESS', 'ADDRESS', 'address']);
    if (!rawAddr) continue;
    const parsed = parseStreetDetails(cleanAddress(rawAddr));
    if (!parsed.streetName) continue;
    const key = getPartitionKey(parsed.streetName);
    partitions[key].rentsafe.push(parsed.baseAddress);
  }
  return rows.length;
}

async function ingestStr(partitions) {
  const rows = await fetchTorontoDataset('str');
  for (const row of rows) {
    const rawAddr = getFlexibleValue(row, ['address', 'ADDRESS', 'address_string']);
    if (!rawAddr) continue;
    const parsed = parseStreetDetails(cleanAddress(rawAddr));
    if (!parsed.streetName) continue;
    const key = getPartitionKey(parsed.streetName);
    partitions[key].str.push({
      num: parsed.streetNum,
      street: parsed.streetName,
      type: parsed.streetType,
      dir: parsed.direction,
      postal: getFlexibleValue(row, ['postal_code', 'POSTAL_CODE', 'POSTAL']),
      unit: getFlexibleValue(row, ['unit', 'UNIT', 'apartment']),
      reg: getFlexibleValue(row, ['operator_registration_number', 'registration_number', 'REG_NUM']),
    });
  }
  return rows.length;
}

async function ingestMth(partitions) {
  const rows = await fetchTorontoDataset('mth');
  for (const row of rows) {
    const rawAddr = getFlexibleValue(row, ['SiteAddress', 'site_address', 'SITE_ADDRESS', 'address']);
    if (!rawAddr) continue;
    const parsed = parseStreetDetails(cleanAddress(rawAddr));
    if (!parsed.streetName) continue;
    const key = getPartitionKey(parsed.streetName);
    partitions[key].mth.push({
      num: parsed.streetNum,
      street: parsed.streetName,
      type: parsed.streetType,
      dir: parsed.direction,
      status: getFlexibleValue(row, ['Status', 'status', 'licence_status']),
    });
  }
  return rows.length;
}

async function ingestPdn(partitions) {
  const rows = await fetchTorontoDataset('pdn');
  for (const row of rows) {
    const streetName = getFlexibleValue(row, ['STREET_NAME', 'street_name', 'STREETNAME']);
    if (!streetName) continue;

    const status = getFlexibleValue(row, ['STATUS', 'status']);
    if (status.toUpperCase() === 'CLOSED') continue;

    const key = getPartitionKey(streetName);

    // Extract raw MTM coordinates from the data payload and convert to
    // WGS84, same as the legacy pipeline. Falls back to raw
    // LATITUDE/LONGITUDE fields only if X/Y aren't present or conversion
    // fails, matching legacy behaviour exactly.
    const xVal = parseFloat(getFlexibleValue(row, ['X', 'x']));
    const yVal = parseFloat(getFlexibleValue(row, ['Y', 'y']));

    let lat = null;
    let lng = null;

    if (!isNaN(xVal) && !isNaN(yVal)) {
      try {
        // proj4 expects/returns coordinates as [x, y] i.e. [lng, lat].
        const converted = proj4(MTM_ZONE_10, WGS84, [xVal, yVal]);
        lng = converted[0];
        lat = converted[1];
      } catch (err) {
        console.warn(`Coordinate transformation failed for application on ${streetName}: ${err.message}`);
      }
    } else {
      lat = parseFloat(getFlexibleValue(row, ['LATITUDE', 'latitude', 'LAT'])) || null;
      lng = parseFloat(getFlexibleValue(row, ['LONGITUDE', 'longitude', 'LNG', 'LON'])) || null;
    }

    partitions[key].pdn.push({
      num: getFlexibleValue(row, ['STREET_NUM', 'street_num', 'NUMBER']),
      street: streetName.toUpperCase().trim(),
      type: getFlexibleValue(row, ['STREET_TYPE', 'street_type']),
      dir: getFlexibleValue(row, ['STREET_DIRECTION', 'street_direction', 'DIR']),
      lat,
      lng,
      num_app: getFlexibleValue(row, ['APPLICATION#', 'APPLICATION_NUMBER', 'application_number', 'APP_NUM']),
      url: getFlexibleValue(row, ['APPLICATION_URL', 'application_url', 'URL']),
      desc: getFlexibleValue(row, ['DESCRIPTION', 'description', 'DESC']),
    });
  }
  return rows.length;
}

async function ingestLtb(partitions) {
  const rows = await fetchLtbDataset();
  for (const row of rows) {
    const normalized = normalizeLtbRow(row);
    if (!normalized) continue;
    partitions[normalized.key].ltb.push(normalized.record);
  }
  return rows.length;
}

async function runSync({ dryRun = false, owner, repo, token = process.env.GITHUB_TOKEN } = {}) {
  // GitHub Actions automatically sets GITHUB_REPOSITORY to "owner/repo".
  // Fall back to the known repo defaults for local/manual runs.
  if (!owner || !repo) {
    const fromEnv = process.env.GITHUB_REPOSITORY;
    if (fromEnv && fromEnv.includes('/')) {
      const [envOwner, envRepo] = fromEnv.split('/');
      owner = owner || envOwner;
      repo = repo || envRepo;
    }
  }
  owner = owner || 'drxTO';
  repo = repo || 'TOHS-tool-rbc';

  console.log(`Starting RBC daily sync${dryRun ? ' (dry run)' : ''}...`);

  const partitions = createPartitions();

  const counts = {
    abp: await ingestAbp(partitions),
    rentsafe: await ingestRentSafe(partitions),
    str: await ingestStr(partitions),
    mth: await ingestMth(partitions),
    pdn: await ingestPdn(partitions),
    ltb: await ingestLtb(partitions),
  };
  console.log('Source row counts fetched:', counts);

  let uploadCount = 0;
  for (const key of Object.keys(partitions)) {
    const partition = partitions[key];
    const totalItems = partitionTotalItems(partition);
    if (totalItems === 0) continue;

    const path = `data/${key.toLowerCase()}.json`;
    const content = JSON.stringify(partition, null, 2);
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    if (sizeBytes > SHARD_WARNING_BYTES) {
      console.warn(
        `::warning::Shard ${path} is ${(sizeBytes / (1024 * 1024)).toFixed(2)}MB, over the ${SHARD_WARNING_BYTES / (1024 * 1024)}MB threshold. Consider re-sharding to two-letter keys (see docs/TOHS-City-Intel-Data-Pipeline-Spec.md §5).`
      );
    }

    if (dryRun) {
      console.log(`[dry-run] Would commit ${path} (${totalItems} items, ${sizeBytes} bytes)`);
      uploadCount++;
      continue;
    }

    if (!token) {
      throw new Error('GITHUB_TOKEN is required to commit (omit --dry-run only when a token is available).');
    }
    await commitFile({ owner, repo, token, path, content, message: `Automated data harvest: ${path}` });
    uploadCount++;
    // Mirrors the legacy pipeline's 1s pacing between commits.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.log(`Sync sequence terminated. ${uploadCount} partitions updated.`);
  return { counts, uploadCount };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  runSync({ dryRun }).catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = {
  createEmptyPartition,
  createPartitions,
  partitionTotalItems,
  runSync,
  SHARD_WARNING_BYTES,
};
