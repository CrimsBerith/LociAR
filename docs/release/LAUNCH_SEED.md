# Launch seed content

19 October 2026. Plan: [LociAR Açılış İçeriği Planı](https://claude.ai/code/artifact/671af933-9b79-409a-8cff-8498bb14cb92).

The map must not open empty. Seed notes and approximate AR posts are written by the team, published under one managed
content account and tagged with a `seed_batch`, so they can be measured and retired once real notes take over.

## What is ready

| Batch | Places | Notes | AR | Source |
|---|---|---|---|---|
| `world-capitals-2026-10` | One busy place in 46 capitals | 322 | 46 | `scripts/seed/world_capitals.py` → `world-capitals.json` |
| `landmark-businesses-2026-10` | 52 well-known businesses in 33 cities (7 in Istanbul) | 52 | 0 | `scripts/seed/landmark_businesses.py` → `landmark-businesses.json` |
| `istanbul-beta-2026-10` | Kadıköy 150 + İstiklal/Galata/Karaköy 100 | 250 | 12 field-only drafts | `scripts/seed/turkey_launch.py` → `istanbul-beta.json` |
| `turkey-streets-2026-10` | 11 Turkish streets outside the beta layer | 120 | 11 approximate drafts | `scripts/seed/turkey_launch.py` → `turkey-streets.json` |

The prepared totals are 744 notes and 69 AR drafts, including the extra 52 business notes. The A/B texts are
original street prompts and fictional talking-street AR lines, not reviews or claims of personal visits. Their
source links identify OpenStreetMap street geometry; `source_scope` distinguishes geometry from editorial writing.
Frozen coordinates and ODbL attribution are in `launch-street-points.geojson`. Preliminary buffers exclude known
worship/monument points within 70 m and school/hospital/kindergarten points within 90 m. These are not a replacement
for complete server protected zones or on-site checks. Every A/B item remains `coord: approx` for owner map review.

The 30 October editorial revision replaces the rotating A/B prompt bank with 393 individually edited entries in
`scripts/seed/editorial/turkey-notes.json`. Each carries a writing-persona draft and a tone label; these are editorial
metadata, not an assigned account or publication approval. Adding geometry now also requires a separate text entry.
Pins, item IDs, notification settings and field-placement holds are unchanged. The local country/language identity
plan now has per-note author mapping and a locally tested anonymous/named admin publishing option. Managed accounts
are not provisioned. Production public-content provenance/group protocol must match before uploading persona content.

Rebuild/check both batches with `python3 scripts/seed/turkey_launch.py [--check]`. The same importer accepts
`--seed istanbul-beta` or `--seed turkey-streets`; `--only kadikoy`, `--only beyoglu`, `--only ankara`, or an exact
item id narrows the run. Only the first note in each area notifies. No batch is loaded by the generator.
All 23 A/B AR drafts have `placement_requirement: field_cloud_anchor`: the importer holds them even with
`--allow-approx`. They need physical Cloud Anchor capture and an authorized publishing workflow; a text draft
is not proof of a hosted anchor. Do not remove that hold to claim field placement remotely.

Each capital has seven location notes (English, plus one Turkish note for Turkish visitors) and one AR post. One note per
capital notifies; the rest show on the map only, so a busy street does not turn into a stream of notifications. Seeds of one
place stand at least 26 m apart, exceeding the current 6 m physical grouping distance. Reading radii are separate.

## Content rules

Business notes (one per business) state facts only: founding year, history and documented anecdotes, with the business
name and, where known, its street in the text, so a note still makes sense if its pin is a few metres off. They never
notify, and the generator refuses review words (taste, price, service, recommendations). Places that closed are left out
(Antico Caffè Greco, Rome, closed on 8 October 2025), and so are anecdotes about violence or tragedy at a place.

- Never review a business (taste, price, service). Shop-entrance notes speak about the kind of shop only.
- Every fact carries a source in the seed file. No links (the admin link check also reads `Amstel:` as a `tel:` link).
- No jokes about religion, politics, nations or tragedies. Memorials, places of worship, schools and hospitals belong in
  `protected_zones` before loading.
- Use distinct writing voices: a plain sentence, hesitation or unfinished thought can stand on its own. A joke, lesson,
  reassuring ending or lowercase spelling is not required on every note. Business facts still require sources. The world
  and business generators retain their opening-phrase check; the individually edited A/B bank permits ordinary shared
  openings such as “Bir şey” and instead rejects duplicate normalized full texts. Long-dash, link and length checks remain.
  A conversational voice never authorizes a made-up personal visit: no 'I ate here' or 'my favourite' about a business.
- At most 140 characters (owner decision, 29 October 2026); the generators and importer enforce this seed limit. Reviews on Google Maps or Tripadvisor may only be read by hand for themes, never scraped, quoted or
  fed to a model (both services' terms forbid it).

## Load a batch

The 30 October multi-identity editorial package is still held for coordinate, identity and attribution review.
Do not use the double-click helper below for that package: it loads a remote checkout, not these reviewed local edits.
The local helper now stops on failed strict preflight and no longer allows approximate pins automatically.
The following is the legacy single-author procedure, not approval to upload
the new drafts. A passing local selection needs an explicit strict dry run and expected-ID reconciliation first.

One step on a Mac: double-click `scripts/load-launch-seed.command` once Functions and the admin backend are deployed and
the protected zones are in. It checks out the published branch in `~/.lociar-seed` (local edits stay untouched), signs in
with `gcloud auth application-default login` if needed, runs `admin/scripts/seed-prepare.mjs` (picks the super admin,
`SEED_ACTOR_EMAIL` chooses one, and creates `@loci.guide` once), then requires a complete dry run before loading.
The log goes to `.git/lociar-seed-load.log`. The manual steps:

1. Deploy Functions and the admin backend, then create the content account in the panel: **Users → Create content user**,
   handle `loci.guide`, display name `LociAR Guide`. (`loci` and `lociar` are reserved handles.)
2. Add protected zones around places of worship and memorials near the seeds.
3. Sign in with Google credentials that can use Firestore (`gcloud auth application-default login`), then run a dry run.
   The actor is an admin account with `posts.create` and `posts.moderate` (super admin):

   ```sh
   python3 scripts/seed/world_capitals.py --check
   cd admin
   GOOGLE_CLOUD_PROJECT=lociar-2f38c node --conditions=react-server --import ./tests/register-typescript.mjs \
     scripts/seed-notes.mjs --seed world-capitals --actor <admin uid>
   ```

   `--seed` names a file in `scripts/seed/` (without `.json`); the importer reads no other path.

   The dry run reads only. It lists each city, items already loaded, items inside a protected zone and anchors marked
   `approx` (taken from general knowledge: Accra, Amsterdam, Belgrade, Bogotá, Hanoi, Jakarta, Lima, Madrid, Manila,
   Nairobi, Santiago, Sarajevo, Seoul, Skopje, Tashkent, Warsaw, Washington).
4. Check every approximate anchor on the admin map (Posts → Create shows the OpenStreetMap picker). Correct it in
   `world_capitals.py` if needed and rebuild.
5. Load: add `--apply --require-complete` (and `--allow-approx` only after the approximate anchors are checked). Each item goes through
   `saveAdminPost`: text and link checks, permissions, protected zones and one audit receipt. Keys derive from the batch
   and item id, so a rerun skips loaded items. `--only london,paris` limits the run to some places.
   Persona plans require per-item `author_handle` and `author_attribution` (`named` or `anonymous`); a global
   `--author` cannot override them. Draft editorial/identity/field holds are not released by `--allow-approx`.
   Strict preflight also refuses existing IDs whose text, author, attribution or active/public state differs.
   The 6 m preflight includes a bounded query of current active public posts, not just the selected source file;
   it is not a batch-wide transaction against concurrent mobile publishing. Existing text corrections require
   separately audited existing-ID edits.
6. Zoom out on the map: every capital should glow.
7. Business notes: repeat steps 3–5 with `--seed landmark-businesses`. Their approximate pins (38 of 52) come from the
   street address; check each on the admin map before `--allow-approx`.

To retire a batch, run the same command with `--retire`: every post of the batch gets an end date five minutes out and the
scheduled job removes up to 200 posts every 15 minutes (the whole world batch within about half an hour).

## Change a batch

Edit `scripts/seed/world_capitals.py` and run it without `--check` to rebuild `world-capitals.json`; CI fails while the two
disagree. `admin/tests/integration/launch-seed.test.mjs` runs the importer against the emulator (dry run, load, rerun,
retire). Item ids are load keys: a rerun skips an item whose id is already loaded, even if its text changed, and a changed
id loads as a new post. Edit a loaded seed in the panel; to replace a whole batch, retire it and load the new version under
a new batch id (retired posts keep their ids, so the old batch id cannot be loaded twice).
