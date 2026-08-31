# Contributing to the RBC Data Pipeline

Thanks for helping maintain the Rental Background Check (RBC) data
pipeline. This document covers how to propose a new data source, what
tests are required, and one hard privacy rule every contribution must
follow.

## The one rule that matters most: never commit a name-bearing column

**Never write a person's name — landlord, tenant, agent, occupant, or any
other individual — into any file in this repository, at any stage,
even temporarily.** This includes intermediate/debug files, log output
committed to source control, and code comments containing sample data.

This is not a display-layer filter to be added later. It must happen at
the earliest possible point in ingestion, before the data is normalized,
shaped into a record, or written anywhere. See `src/ltb.js` for the
existing pattern: `LTB_NAME_COLUMNS` lists every column that must be
dropped, and `normalizeLtbRow()` never copies those fields onto its output
record. If you add a new data source that includes personal names in its
raw form, follow this same pattern and add a test (like
`test/ltb.test.js`) that asserts none of those fields ever appear on the
output.

Organization/institution names (e.g. a co-op's name, a landlord company's
registered business name where it is not an individual's name) are not
personal names and may be retained — but if you are unsure whether a field
is personal or organizational, ask before adding it, don't guess.

## Proposing a new data source

1. Confirm the source is public, non-sensitive, and covered by an
   attribution-friendly open licence (Open Government Licence or
   equivalent) — see `README.md` "Licensing and attribution" for the
   pattern this repo already follows.
2. Add a fetch function alongside the existing ones in `src/ckan.js` (or a
   new module if the source isn't CKAN-based), following the existing
   `fetchFullDataset`/`resolveCsvResourceUrl` pattern: resolve the current
   CSV URL at runtime rather than hardcoding it, since source agencies
   rotate resource IDs/URLs when they publish new file versions.
3. Add an ingest function in `src/sync.js` (see `ingestAbp`, `ingestLtb`,
   etc. for the pattern) that maps raw rows into partitioned records using
   the shared `cleanAddress()` / `parseStreetDetails()` / `getPartitionKey()`
   helpers in `src/normalize.js`. Do not fork a second copy of these
   functions for a new source — if the whitelist of street types
   (`ST/AVE/RD/CRES/BLVD/PL/DR/CRT/WAY/LANE`) doesn't cover something your
   source needs, extend the one shared whitelist and add a test for it.
4. Add the new array key to `createEmptyPartition()` in `src/sync.js` so
   it's included in every shard file, and to the `partitionTotalItems()`
   sum so a shard containing only your new source's data still gets
   counted as non-empty.
5. Write unit tests for your new ingest/normalization logic in `test/`,
   covering at minimum: a normal well-formed row, a row with a missing
   address (should be skipped, not throw), and — if the source could ever
   contain personal names — a test asserting those fields never reach the
   output (see `test/ltb.test.js`).
6. Update the data-sources table in `README.md`.
7. Open a pull request. The `test` GitHub Actions check (separate from the
   daily-sync workflow) runs automatically and must pass before merge.

## Running tests

```bash
npm install
npm test
```

## Reporting a data quality issue

If you notice a street-type abbreviation the parser doesn't recognize, an
address that isn't normalizing correctly, or any other data quality
problem, please open an issue using the "data quality report" issue
template.

## Licence

By contributing, you agree your contribution is licensed under this
repository's MIT licence (`LICENSE`) — this covers the pipeline code only,
not the published Toronto/Ontario open data itself, which carries its own
separate attribution terms (see `README.md`).
