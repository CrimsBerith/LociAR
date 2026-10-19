# Launch seed content

19 October 2026. Plan: [LociAR Açılış İçeriği Planı](https://claude.ai/code/artifact/671af933-9b79-409a-8cff-8498bb14cb92).

The map must not open empty. Seed notes and approximate AR posts are written by the team, published under one managed
content account and tagged with a `seed_batch`, so they can be measured and retired once real notes take over.

## What is ready

| Batch | Places | Notes | AR | Source |
|---|---|---|---|---|
| `world-capitals-2026-10` | One busy place in 46 capitals | 322 | 46 | `scripts/seed/world_capitals.py` → `world-capitals.json` |

Each capital has seven location notes (English, plus one Turkish note for Turkish visitors) and one AR post. One note per
capital notifies; the rest show on the map only, so a busy street does not turn into a stream of notifications. Seeds of one
place stand at least 26 m apart, so each forms its own 25 m group.

## Content rules

- Never review a business (taste, price, service). Shop-entrance notes speak about the kind of shop only.
- Every fact carries a source in the seed file. No links (the admin link check also reads `Amstel:` as a `tel:` link).
- No jokes about religion, politics, nations or tragedies. Memorials, places of worship, schools and hospitals belong in
  `protected_zones` before loading.
- At most 220 characters. Reviews on Google Maps or Tripadvisor may only be read by hand for themes, never scraped, quoted or
  fed to a model (both services' terms forbid it).

## Load a batch

1. Deploy Functions and the admin backend, then create the content account in the panel: **Users → Create content user**,
   handle `loci.guide`, display name `LociAR Guide`. (`loci` and `lociar` are reserved handles.)
2. Add protected zones around places of worship and memorials near the seeds.
3. Sign in with Google credentials that can use Firestore (`gcloud auth application-default login`), then run a dry run.
   The actor is an admin account with `posts.create` and `posts.moderate` (super admin):

   ```sh
   python3 scripts/seed/world_capitals.py --check
   cd admin
   GOOGLE_CLOUD_PROJECT=lociar-2f38c node --conditions=react-server --import ./tests/register-typescript.mjs \
     scripts/seed-notes.mjs --file ../scripts/seed/world-capitals.json --actor <admin uid>
   ```

   The dry run reads only. It lists each city, items already loaded, items inside a protected zone and anchors marked
   `approx` (taken from general knowledge: Accra, Amsterdam, Belgrade, Bogotá, Hanoi, Jakarta, Lima, Madrid, Manila,
   Nairobi, Santiago, Sarajevo, Seoul, Skopje, Tashkent, Warsaw, Washington).
4. Check every approximate anchor on the admin map (Posts → Create shows the OpenStreetMap picker). Correct it in
   `world_capitals.py` if needed and rebuild.
5. Load: add `--apply` (and `--allow-approx` once the approximate anchors are checked). Each item goes through
   `saveAdminPost`: text and link checks, permissions, protected zones and one audit receipt. Keys derive from the batch
   and item id, so a rerun skips loaded items. `--only london,paris` limits the run to some places.
6. Zoom out on the map: every capital should glow.

To retire a batch, run the same command with `--retire`: every post of the batch gets an end date five minutes out and the
scheduled job removes it.
