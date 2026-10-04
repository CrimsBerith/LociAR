import assert from "node:assert/strict";
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRootUrl = new URL("../../", import.meta.url);
const repoRoot = fileURLToPath(repoRootUrl);
const ops = readFileSync(join(repoRoot, "admin/lib/ops.ts"), "utf8");
const rules = readFileSync(join(repoRoot, "firestore.rules"), "utf8");

test("admin audit records are keyed by idempotency key and created, never updated", () => {
  assert.match(ops, /collection\('admin_audit_log'\)\.doc\(idempotencyKey\)/);
  assert.match(ops, /tx\.create\(ref,/);
  assert.doesNotMatch(ops, /admin_audit_log'\)[^\n]*\.(update|delete)\(/);
});

test("approval workflow rejects self approval and stale targets", () => {
  assert.match(ops, /approval\.requested_by === actorId/);
  assert.match(ops, /self_approval_forbidden/);
  assert.match(ops, /postVersion\(postSnap\.data\(\)!\) !== approval\.target_version/);
  assert.match(ops, /Target changed before approval\./);
});

test("privileged admin collections are unavailable to client SDKs", () => {
  assert.match(rules, /match \/\{document=\*\*\} \{\n\s+allow read, write: if false;/);
  for (const collection of ["admin_audit_log", "admin_role_assignments", "admin_approval_requests", "admin_rate_limits"]) {
    assert.doesNotMatch(rules, new RegExp(`match /${collection}/`));
  }
});

test("admin writes use a Firestore-backed rate limiter", () => {
  assert.match(ops, /export async function consumeRateLimit/);
  assert.match(ops, /collection\('admin_rate_limits'\)\.doc\(`\$\{actorId\}_\$\{scope\}_\$\{bucket\}`\)/);
});

test("write handlers require same-origin and authenticated admin context", () => {
  // fileURLToPath avoids %20 path encoding breaking glob on spaces-in-path machines.
  const routeFiles = globSync(join(repoRoot, "admin/app/api/admin/v1/**/route.ts"));
  assert.ok(
    routeFiles.length >= 6,
    `expected >=6 admin v1 routes, found ${routeFiles.length}`,
  );

  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");
    if (!/\b(POST|PATCH|PUT|DELETE)\b/.test(source)) continue;
    assert.match(source, /requireSameOrigin/);
    assert.match(source, /requireAdminApi/);
    assert.match(source, /enforceRateLimit/);
  }
});

test("moderation approval is fail-closed and flag decisions are audited", () => {
  assert.match(ops, /before\.age_rating === '18_plus' \|\| before\.protected_zone_name/);
  assert.match(ops, /post_not_approvable/);
  assert.match(ops, /export async function resolveModerationFlag/);
  assert.match(ops, /action: `moderation_flag_\$\{action\}`/);
});

test("suspension and profile-photo decisions are permission-scoped, audited and MFA-gated", () => {
  for (const route of ["users/[luid]/suspend", "avatars/[luid]/decision"]) {
    const source = readFileSync(join(repoRoot, `admin/app/api/admin/v1/${route}/route.ts`), "utf8");
    assert.match(source, /requireAdminApi\('users\.suspend'\)/, route);
    assert.match(source, /idempotencyKey\(request\)/, `${route} needs an idempotency key`);
    assert.match(source, /requiredString\(body\.reason/, `${route} requires a reason`);
  }
  assert.match(ops, /export async function setUserSuspended/);
  assert.match(ops, /action: suspended \? 'user_suspend' : 'user_unsuspend'/);
  assert.match(ops, /export async function decideAvatar/);
  assert.match(ops, /action: `avatar_\$\{action\}`/);
  for (const page of ["avatars"]) {
    const source = readFileSync(join(repoRoot, `admin/app/admin/(protected)/${page}/page.tsx`), "utf8");
    assert.match(source, /requireAdmin\(\{ permission: 'users\.suspend' \}\)/);
  }
});

test("posts deleted by their author cannot be restored by moderators", () => {
  assert.match(ops, /before\.deleted_at && !before\.deleted_by && action !== 'soft_delete'/);
  assert.match(ops, /post_deleted_by_author/);
});

test("all planned operations pages are enabled", () => {
  const layout = readFileSync(join(repoRoot, "admin/app/admin/(protected)/layout.tsx"), "utf8");
  for (const route of ["moderation", "avatars", "anchors", "places", "zones", "analytics", "system"]) {
    assert.match(layout, new RegExp(`href: '/admin/${route}', label: .* enabled: true`));
    assert.ok(globSync(join(repoRoot, `admin/app/admin/(protected)/${route}/page.tsx`)).length === 1);
  }
  assert.ok(globSync(join(repoRoot, "admin/app/admin/(protected)/search/page.tsx")).length === 1);
});

test("service-role secret is never exposed through a public variable", () => {
  const sourceFiles = globSync(join(repoRoot, "admin/**/*.{ts,tsx,mjs}"), {
    exclude: (entry) =>
      entry.includes("/node_modules/") || entry.includes("/.next/"),
  });

  for (const file of sourceFiles) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /NEXT_PUBLIC_(?:FIREBASE_SERVICE_ACCOUNT|SUPABASE_SERVICE_ROLE)/,
    );
  }
});

test("admin magic links support cross-browser completion without weakening MFA", () => {
  const login = readFileSync(join(repoRoot, "admin/app/admin/login/page.tsx"), "utf8");
  const callback = readFileSync(join(repoRoot, "admin/app/auth/callback/page.tsx"), "utf8");
  const sessionRoute = readFileSync(join(repoRoot, "admin/app/api/auth/session/route.ts"), "utf8");
  const admin = readFileSync(join(repoRoot, "admin/lib/admin.ts"), "utf8");

  assert.match(login, /sendSignInLinkToEmail/);
  assert.match(login, /handleCodeInApp: true/);
  assert.match(login, /older links expire immediately/);
  assert.match(callback, /window\.history\.replaceState/);
  assert.match(callback, /auth\/multi-factor-auth-required/);
  assert.match(callback, /TotpMultiFactorGenerator\.assertionForSignIn/);
  assert.match(sessionRoute, /request\.headers\.get\('origin'\) !== requestUrl\.origin/);
  assert.match(sessionRoute, /verifyIdToken\(idToken, true\)/);
  assert.match(sessionRoute, /stale_sign_in/);
  assert.match(sessionRoute, /secondFactor \? '\/admin\/dashboard' : '\/admin\/mfa'/);
  assert.match(admin, /verifySessionCookie\(session, true\)/);
  assert.match(admin, /sign_in_second_factor/);
});

// ---- issue #13 ----
import { inviteAcceptError, commentFlagTarget, isCommentFlag, originAllowed, restoredCommentFromFlag, INVITE_TTL_MS } from "../lib/policy.ts";

test("admin deploys only to Firebase App Hosting and never needs a service-account key there", () => {
  for (const legacy of ["admin/Dockerfile", "admin/.dockerignore", ".dockerignore", "admin/vercel.json", "vercel.json"]) {
    assert.equal(existsSync(join(repoRoot, legacy)), false, `${legacy} must not exist (deployment is Firebase App Hosting)`);
  }
  const apphosting = readFileSync(join(repoRoot, "admin/apphosting.yaml"), "utf8");
  assert.doesNotMatch(apphosting, /FIREBASE_SERVICE_ACCOUNT_JSON|private_key/);
  const firebaseJson = JSON.parse(readFileSync(join(repoRoot, "firebase.json"), "utf8"));
  assert.deepEqual(firebaseJson.apphosting.map((b) => [b.backendId, b.rootDir]), [["lociar-admin", "admin"]]);
  const adminSdk = readFileSync(join(repoRoot, "admin/lib/firebase-admin.ts"), "utf8");
  assert.match(adminSdk, /applicationDefault\(\)/);
});

test("API errors never return raw exception messages", () => {
  const api = readFileSync(join(repoRoot, "admin/lib/api.ts"), "utf8");
  assert.doesNotMatch(api, /error instanceof Error \? error\.message/);
  assert.match(api, /Unexpected server error/);
});

test("invites: verified matching email within 72 hours; otherwise rejected", () => {
  const now = Date.now();
  const invite = { email: "New@Example.com", status: "sent", created_at_ms: now - 1000 };
  assert.equal(inviteAcceptError(invite, { email: "new@example.com", emailVerified: true }, now), null);
  assert.equal(inviteAcceptError(invite, { email: "new@example.com", emailVerified: false }, now), "invite_email_unverified");
  assert.equal(inviteAcceptError(invite, { email: "other@example.com", emailVerified: true }, now), "invite_email_mismatch");
  assert.equal(inviteAcceptError({ ...invite, created_at_ms: now - INVITE_TTL_MS - 1 }, { email: "new@example.com", emailVerified: true }, now), "invite_expired");
  assert.equal(inviteAcceptError({ ...invite, status: "accepted" }, { email: "new@example.com", emailVerified: true }, now), "invite_not_pending");
});

test("comment flags never act on the post", () => {
  assert.equal(isCommentFlag({ reason: "comment_filtered", metadata: { comment_id: "c1" } }), true);
  assert.equal(isCommentFlag({ reason: "spam", metadata: { target: "comment", comment_id: "c2" } }), true);
  assert.equal(isCommentFlag({ reason: "spam", metadata: { source: "native_ios" } }), false);
  assert.equal(commentFlagTarget({ metadata: { comment_id: "c3" } }), "c3");
  const ops = readFileSync(join(repoRoot, "admin/lib/ops.ts"), "utf8");
  assert.match(ops, /if \(isCommentFlag\(flag\)\)/);
});

test("same-origin check handles null/garbage origins and a pinned ADMIN_ORIGIN", () => {
  assert.equal(originAllowed("null", "a.example", undefined), false);
  assert.equal(originAllowed("not a url", "a.example", undefined), false);
  assert.equal(originAllowed(null, "a.example", undefined), false);
  assert.equal(originAllowed("https://a.example", "a.example", undefined), true);
  assert.equal(originAllowed("https://evil.example", "a.example", undefined), false);
  assert.equal(originAllowed("https://admin.example.com", "internal:3000", "https://admin.example.com"), true);
  assert.equal(originAllowed("https://a.example", "a.example", "https://admin.example.com"), false);
});

test("session cookie is short-lived and always secure in production; sign-in and sign-out are audited", () => {
  const session = readFileSync(join(repoRoot, "admin/app/api/auth/session/route.ts"), "utf8");
  assert.match(session, /SESSION_HOURS = 8/);
  assert.match(session, /NODE_ENV === 'production'/);
  assert.match(session, /admin_sign_in/);
  assert.match(readFileSync(join(repoRoot, "admin/app/api/auth/signout/route.ts"), "utf8"), /admin_sign_out/);
  assert.match(readFileSync(join(repoRoot, "admin/app/api/admin/v1/approvals/route.ts"), "utf8"), /approval_requested/);
});

test("approving a filtered-comment flag restores the comment as a false positive", () => {
  const flag = { reason: "comment_filtered", post_id: "p1", metadata: { comment_id: "c1", author_id: "u1", text: "fine text" } };
  assert.deepEqual(restoredCommentFromFlag(flag), { id: "c1", post_id: "p1", user_id: "u1", text: "fine text" });
  assert.equal(restoredCommentFromFlag({ ...flag, reason: "spam" }), null);
  assert.equal(restoredCommentFromFlag({ ...flag, metadata: { comment_id: "c1" } }), null);
  const ops = readFileSync(join(repoRoot, "admin/lib/ops.ts"), "utf8");
  assert.match(ops, /admin_restored: true/);
  assert.match(ops, /filtered_comments/);
  const triggers = readFileSync(join(repoRoot, "functions/src/triggers.ts"), "utf8");
  assert.match(triggers, /comment\.admin_restored !== true && containsBlockedTerm/);
});

test("protected zones are validated before they are written", async () => {
  const { parseZoneInput, roleRevokeError } = await import("../lib/policy.ts");
  assert.deepEqual(parseZoneInput({ name: "Okul", category: "school", lat: 41, lng: 29, radius_meters: 150.4 }), { zone: { name: "Okul", category: "school", lat: 41, lng: 29, radius_meters: 150 } });
  assert.ok("error" in parseZoneInput({ name: "x", category: "school", lat: 41, lng: 29, radius_meters: 150 }));
  assert.ok("error" in parseZoneInput({ name: "Okul", category: "mall", lat: 41, lng: 29, radius_meters: 150 }));
  assert.ok("error" in parseZoneInput({ name: "Okul", category: "school", lat: 91, lng: 29, radius_meters: 150 }));
  assert.ok("error" in parseZoneInput({ name: "Okul", category: "school", lat: 41, lng: 29, radius_meters: 5000 }));
  assert.equal(roleRevokeError("super_admin", 1), "cannot_revoke_last_super_admin");
  assert.equal(roleRevokeError("super_admin", 2), null);
  assert.equal(roleRevokeError("support_agent", 1), null);
});

test("admin hardening: kill switch, streamed avatars, nonce CSP and personal-data audit", () => {
  const read = (p) => readFileSync(join(repoRoot, p), "utf8");
  assert.match(read("admin/app/api/admin/v1/system/kill-switch/route.ts"), /requireAdminApi\('system\.kill_switch'\)/);
  assert.doesNotMatch(read("admin/app/admin/(protected)/avatars/page.tsx"), /getSignedUrl/);
  const proxy = read("admin/proxy.ts");
  assert.match(proxy, /'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.match(read("admin/app/admin/layout.tsx"), /force-dynamic/);
  assert.match(read("admin/app/admin/(protected)/users/page.tsx"), /recordPersonalDataRead/);
  assert.match(read("admin/app/admin/(protected)/search/page.tsx"), /recordPersonalDataRead/);
  assert.match(read("admin/app/api/auth/session/route.ts"), /auditMfaEnrollment/);
});
