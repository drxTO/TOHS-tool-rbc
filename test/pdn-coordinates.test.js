'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const proj4 = require('proj4');

// Same projection strings used in src/sync.js's ingestPdn(). This test
// exists to catch any accidental change to those strings, since a wrong
// projection produces a plausible-looking but wrong lat/lng (no runtime
// error), which would silently place developments in the wrong spot on
// the RBC map.
const MTM_ZONE_10 = '+proj=tmerc +lat_0=0 +lon_0=-79.5 +k=0.9999 +x_0=304800 +y_0=0 +datum=NAD27 +units=m +no_defs';
const WGS84 = '+proj=longlat +datum=WGS84 +no_defs';

test('MTM Zone 10 -> WGS84 conversion places a known downtown Toronto point correctly', () => {
  // Approximate MTM Zone 10 (NAD27) coordinates for City Hall / downtown
  // Toronto (roughly 313000E, 4834000N in this projection's local frame).
  const [lng, lat] = proj4(MTM_ZONE_10, WGS84, [313000, 4834000]);
  // Toronto is roughly -79.5..-79.3 lng, 43.6..43.7 lat.
  assert.ok(lat > 43 && lat < 44, `expected lat in Toronto range, got ${lat}`);
  assert.ok(lng > -80 && lng < -79, `expected lng in Toronto range, got ${lng}`);
});
