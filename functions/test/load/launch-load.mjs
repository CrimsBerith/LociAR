// Launch-day load rehearsal against the local emulators only (demo-lociar; never a live project).
// Run: firebase emulators:exec --only auth,firestore,storage,functions --project demo-lociar "node test/load/launch-load.mjs"
// Prints per-callable latency/error tables and how long social triggers need to settle a burst.
// Emulator timings are relative (one process, no cold starts, no maxInstances); use them to find
// hot spots and correctness problems under concurrency, not absolute production latency.
import { randomUUID } from 'node:crypto';
import { adminDb, closeClients, newUser, postBody } from '../integration/_harness.mjs';

const USERS = Number(process.env.LOAD_USERS ?? 40);
// The functions emulator starts one worker process per concurrent request and fails to load
// workers past a few dozen at once, so callables are capped; trigger storms stay fully parallel.
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 12);
let active = 0; const waiting = [];
async function limited(fn) {
  if (active >= CONCURRENCY) await new Promise(r => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}
const CENTRE = { lat: 41.0335, lng: 28.978 };
const stats = new Map();
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0;

async function timed(name, fn) {
  const s = stats.get(name) ?? { ms: [], errors: {} }; stats.set(name, s);
  return limited(async () => {
  const t = performance.now();
  try { return await fn(); }
  catch (e) { const code = e?.code ?? e?.message ?? 'error'; s.errors[code] = (s.errors[code] ?? 0) + 1; return undefined; }
  finally { s.ms.push(performance.now() - t); }
  });
}

function report(title) {
  console.log(`\n## ${title}`);
  console.log('| call | n | p50 ms | p90 ms | max ms | errors |\n|---|---|---|---|---|---|');
  for (const [name, s] of [...stats].sort()) {
    const ms = [...s.ms].sort((a, b) => a - b);
    console.log(`| ${name} | ${ms.length} | ${pct(ms, .5).toFixed(0)} | ${pct(ms, .9).toFixed(0)} | ${ms.at(-1).toFixed(0)} | ${JSON.stringify(s.errors) === '{}' ? '-' : JSON.stringify(s.errors)} |`);
  }
  stats.clear();
}

async function settle(label, check, timeoutMs = 120_000) {
  const t = performance.now();
  for (;;) {
    const state = await check();
    if (state.done) { console.log(`- ${label}: settled in ${((performance.now() - t) / 1000).toFixed(1)} s (${state.detail})`); return true; }
    if (performance.now() - t > timeoutMs) { console.log(`- ${label}: NOT settled after ${timeoutMs / 1000} s (${state.detail})`); return false; }
    await new Promise(r => setTimeout(r, 250));
  }
}

const near = i => ({ latitude: CENTRE.lat + (i % 10) * 0.0004, longitude: CENTRE.lng + Math.floor(i / 10) * 0.0004, heading: 10, accuracy: 8 });

(async () => {
  const t0 = performance.now();
  // 1. Sign-up burst: every user creates an account and profile at the same moment.
  const users = (await Promise.all(Array.from({ length: USERS }, (_, i) => timed('signup+ensureProfile', () => newUser(`load${i}${randomUUID().slice(0, 4)}`))))).filter(Boolean);
  report(`1. ${USERS} simultaneous sign-ups (${users.length} ok)`);

  // 2. Half the users post at once.
  const creators = users.slice(0, Math.ceil(users.length / 2));
  const posts = (await Promise.all(creators.map((u, i) => timed('createPost', async () => {
    const body = postBody({ pose: near(i) });
    const r = await u.call('createPost', body);
    return r?.publishStatus === 'active' ? { id: body.clientMutationId, author: u } : null;
  })))).filter(Boolean);
  report(`2. ${creators.length} simultaneous posts (${posts.length} active)`);
  if (!posts.length) { console.log('No active posts; stopping.'); await closeClients(); process.exit(1); }

  // 3. Everyone opens the app: nearby feed, activity, like counts, a post view.
  await Promise.all(users.flatMap((u, i) => [
    timed('readPublicContent nearby', () => u.call('readPublicContent', { mode: 'nearby', latitude: CENTRE.lat, longitude: CENTRE.lng, radiusMeters: 1000 })),
    timed('readActivity', () => u.call('readActivity', {})),
    timed('readLikeCount', () => u.call('readLikeCount', { postId: posts[i % posts.length].id })),
    timed('recordPostView', () => u.call('recordPostView', { postId: posts[i % posts.length].id })),
  ]));
  report(`3. ${users.length} users open the app at once (4 calls each)`);

  // 4. Like storm: every user likes the same hot post, plus one spread like each.
  const hot = posts[0];
  console.log(`hot post ${hot.id} by ${hot.author.luid}; like rows use user ids like ${users[1].luid}`);
  await Promise.all(users.flatMap((u, i) => [
    adminDb.collection('likes').doc(`${hot.id}_${u.luid}`).set({ post_id: hot.id, user_id: u.luid, created_at: new Date() }),
    adminDb.collection('likes').doc(`${posts[(i + 1) % posts.length].id}_${u.luid}`).set({ post_id: posts[(i + 1) % posts.length].id, user_id: u.luid, created_at: new Date() }),
  ]));
  const expectHot = users.filter(u => u.luid !== hot.author.luid).length;
  await settle(`hot post likes_count -> ${users.length}`, async () => {
    const post = await adminDb.collection('posts').doc(hot.id).get();
    const n = post.get('likes_count') ?? 0;
    const rows = (await adminDb.collection('likes').where('post_id', '==', hot.id).count().get()).data().count;
    return { done: n === users.length, detail: `likes_count=${n} like_rows=${rows} status=${post.get('status')} offsets=${JSON.stringify(post.get('metrics_counter_offsets') ?? null)} manual=${Boolean(post.get('metrics_admin_edited_at'))}` };
  });
  await settle(`like activity for hot author -> ${expectHot}`, async () => {
    const n = (await adminDb.collection('activity_events').where('recipient_id', '==', hot.author.luid).where('kind', '==', 'like').count().get()).data().count;
    return { done: n >= expectHot, detail: `events=${n}` };
  });

  // 5. Follow storm: everyone follows the first author.
  const star = hot.author;
  const fans = users.filter(u => u.luid !== star.luid);
  await Promise.all(fans.map(u => adminDb.collection('follows').doc(`${u.luid}_${star.luid}`).set({ follower_id: u.luid, following_id: star.luid, created_at: new Date() })));
  await settle(`follower_count -> ${fans.length}`, async () => {
    const n = (await adminDb.collection('profiles').doc(star.luid).get()).get('follower_count') ?? 0;
    return { done: n === fans.length, detail: `follower_count=${n}` };
  });

  // 6. Read again after the storm (activity lists are now non-empty).
  await Promise.all(users.flatMap(u => [
    timed('readActivity (after storm)', () => u.call('readActivity', {})),
    timed('readPublicContent profile', () => u.call('readPublicContent', { mode: 'profile', creatorId: star.luid })),
  ]));
  report('6. reads after the like/follow storm');

  console.log(`\nTotal ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  await closeClients();
  process.exit(0);
})().catch(async e => { console.error('LOAD_FAILED', e); await closeClients(); process.exit(1); });
