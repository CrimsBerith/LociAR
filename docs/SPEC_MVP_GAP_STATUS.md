> **ARŞİV (28 Eylül 2026):** Bu belge Supabase dönemine aittir. Backend artık Firebase — güncel kaynaklar: `AGENTS.md`, `docs/FIREBASE_SETUP.md`, `ARCHITECTURE.md`.

# Spec MVP completion status (best-effort on Expo iOS stack)

Updated: 2026-07-25

## Done in product code

| Spec MVP item | Implementation |
|---------------|----------------|
| Auth | Apple / Google / email magic link services |
| Profile | Premium profile + saves/following stats |
| Camera hub | Create modes |
| Text / gallery / draw | CreateTagScreen |
| Map nearby | Map + `nearby_posts` (incl. own pending after migration) |
| Explore | Discover premium |
| Like / comment | Store + remote + activity emit |
| Save / bookmark | `post_saves` + AR save + collections quick-save |
| Follow | `follows` + AR follow |
| Block | `user_blocks` + hide posts |
| Collections | Collections screen + SQL tables |
| Place detail | PlaceDetail screen from map |
| Activity | Remote `activity_events` + local fallback |
| Report | moderation_flags |
| Offline draft | pending sync queue |
| YouTube | Chromeless embed |
| Spotify | Official embed URL + open platform |
| Multi-user AR lock | ARWorldMap upload/download + atomic publish |
| Quality world lock publish | create_post → **active** when nativeEligible + map URL |
| Creator visibility | RLS + nearby includes own pending |
| Backend banner | Dev banner when not onlineReady |

## Explicitly not this stack (separate multi-month tracks)

| Item | Why |
|------|-----|
| Pure SwiftUI + Compose dual apps | Product is Expo + iOS native module |
| Google ARCore Cloud Anchors | Needs Google Cloud + native SDKs; facade uses WorldMap |
| Android store binary | Removed by product decision |
| Push notifications | Paid Apple team + server workers |
| Full CI dual-platform gates | Spec §43 only partial |

## Owner actions (required for “online complete”)

```bash
cd /Users/khankartal/Desktop/loci/LociAR
export PATH="$HOME/.local/node/bin:$PATH"
npx supabase login
export SUPABASE_PROJECT_REF=zijavwumpsdlfosylkjo
npx supabase link --project-ref zijavwumpsdlfosylkjo
npx supabase db push
npx supabase functions deploy create_post
npm run supabase:online-check
```

Dashboard → Auth → enable **Email** (and Apple when team ready).

Physical iPhone field: pin any surface → publish → leave → return multi-angle → second account if multi-user.

## Score (honest)

- **Shipable iOS social+AR product path:** ~85% of *adapted* MVP  
- **Literal master-spec dual-native Cloud Anchor:** ~30%  
