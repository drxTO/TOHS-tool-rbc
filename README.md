# TOHS Rental Background Check (RBC) Data Pipeline

This repository was previously named "TOHS-city-intel" / "City Intel." That
name is retired — this pipeline and the product it powers are now called
**Rental Background Check (RBC)** only. See
`docs/TOHS-City-Intel-Data-Pipeline-Spec.md` in the main `tohs-systemv1`
repository for the full naming-decision history and rebuild rationale.

## What this pipeline does

Toronto and Ontario each publish renter-relevant public open data as
separate datasets that reference addresses differently (full street
strings, split number/street/type/direction fields, unit-prefixed strings,
etc.). This pipeline runs once a day, fetches those datasets, normalizes
every address into one consistent shape, and commits the result as
address-keyed JSON files under `data/`, partitioned by the first letter of
the street name (`data/a.json` … `data/z.json`, plus `data/0-9.json` for
digit-led street names).

The **Rental Background Check** public tool (and any other consumer) reads
these JSON files directly rather than querying multiple government APIs
live on every user request — this pipeline does the address-reconciliation
work once, offline, on a schedule.

## Data sources

| Key | Source | Licence |
|---|---|---|
| `rentsafe` | Toronto RentSafeTO apartment building registry | Open Government Licence – Toronto |
| `abp` | Toronto Active Building Permits | Open Government Licence – Toronto |
| `str` | Toronto Short-Term Rental Registry | Open Government Licence – Toronto |
| `mth` | Toronto Multi-Tenant House Licences | Open Government Licence – Toronto |
| `pdn` | Toronto Planned Developments | Open Government Licence – Toronto |
| `ltb` | Ontario Landlord and Tenant Board Order Catalogue | Open Government Licence – Ontario |

Toronto sources are fetched from the City of Toronto Open Data CKAN API
(`ckan0.cf.opendata.inter.prod-toronto.ca`). The LTB source is fetched from
Ontario's Open Data CKAN API (`data.ontario.ca`), at
https://data.ontario.ca/dataset/ltb-order-catalogue.

**Privacy rule for LTB data (non-negotiable):** every name-bearing column in
the raw LTB CSV (`Landlord Name`, `Landlord Agent Name`, `Tenant Name`,
`Former Tenant Name`, `Sub-Tenant Name`, `Occupant Names`, `Co-op Member
Name`) is stripped at ingest, before anything is written to any
intermediate file, log, or commit. See `src/ltb.js` and its tests in
`test/ltb.test.js`, which assert no name field ever reaches the output
record. `Co-op Name` (the organization, not a person) is retained.

## Running locally

```bash
npm install
npm run sync:dry   # normalizes and prints what would be committed, without touching GitHub
npm run sync       # fetches, normalizes, and commits to this repo (requires GITHUB_TOKEN)
npm test           # runs the unit test suite
```

`sync:dry` is safe to run at any time — it never writes to GitHub. Use it to
verify a change before testing a real commit.

## How the daily schedule works

`.github/workflows/daily-sync.yml` runs `npm run sync` on a cron schedule
using the workflow's automatically-provided `GITHUB_TOKEN` — no personal
access token is stored in this repository or needs to be rotated.

## Licensing and attribution

The **pipeline source code** in this repository (everything outside
`data/`) is MIT-licensed — see `LICENSE`. Anyone may reuse it, open issues,
or send pull requests.

The **published data** under `data/` is a derived, re-normalized product of:

- City of Toronto Open Data, licensed under the **Open Government Licence –
  Toronto**.
- Government of Ontario Open Data (LTB Order Catalogue), licensed under the
  **Open Government Licence – Ontario**.

Both licences permit commercial use and redistribution, subject to
attribution and a prohibition on implying government endorsement. Any
consumer of this repository's `data/` files must include both of the
following attribution statements:

> Contains information licensed under the Open Government Licence – Toronto.

> Contains information licensed under the Open Government Licence – Ontario.

Do not use City of Toronto or Government of Ontario logos/crests, and do not
phrase results in a way that implies government endorsement of this project
or any tool built on it.

## Shard size

Shard files are monitored for size at commit time; the daily workflow warns
(via a GitHub Actions annotation) if any shard exceeds ~8MB. If that
happens, the partitioning key should move from "first letter" to "first two
letters" of the street name — this has not been needed yet as of the last
size check (`b.json` is currently the largest, well under the ~8MB
threshold).

## Contributing

See `CONTRIBUTING.md` for how to propose a new data source, the required
tests, and the privacy rule every contributor must follow.
