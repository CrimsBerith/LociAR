import assert from "node:assert/strict";
import test from "node:test";
import { publicSiteDecision } from "../lib/public-site.ts";

test("locidrop.com serves only legal and support pages; the admin stays off the public domain", () => {
  for (const host of ["locidrop.com", "www.locidrop.com", "LociDrop.com:443"]) {
    assert.equal(publicSiteDecision(host, "/"), "home");
    for (const path of ["/privacy", "/privacy/en", "/terms", "/terms/en/", "/support", "/support/en", "/_next/static/x.js", "/favicon.ico", "/icon.png"]) {
      assert.equal(publicSiteDecision(host, path), "pass", `${host}${path}`);
    }
    for (const path of ["/admin", "/admin/login", "/admin/dashboard", "/api/admin/v1/campaigns", "/auth/invite", "/auth/callback", "/login", "/privacy/../admin"]) {
      assert.equal(publicSiteDecision(host, path), "not_found", `${host}${path}`);
    }
  }
});

test("the App Hosting address keeps the whole admin", () => {
  for (const path of ["/", "/admin/login", "/api/admin/v1/campaigns", "/privacy"]) {
    assert.equal(publicSiteDecision("lociar-admin--lociar-2f38c.us-central1.hosted.app", path), "pass");
  }
  assert.equal(publicSiteDecision(null, "/admin"), "pass");
  assert.equal(publicSiteDecision("evil-locidrop.com", "/admin"), "pass");
});
