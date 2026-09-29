import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
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
