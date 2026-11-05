# LociAR 1.0 — Security Audit & Penetration Review

> Phase: P5 (Security, Privacy & Compliance)  
> Owners: A07 (Security & Privacy Specialist), A15 (Independent Red Team)  
> Date: 2 Kasım 2026  
> Verdict: PASS (Zero P0/P1 Security Vulnerabilities)  

---

## 1. Secrets Scanning & Credential Isolation

- **Verification Script**: `node scripts/qa-secret-scan.mjs`
- **Scope**: Scanned all tracked and non-ignored files (Swift, TypeScript, JSON, Markdown, Shell, CI workflows).
- **Result**: `Secret scan passed (tracked and non-ignored files, including docs and tests). Findings: 0`
- **Key Isolation Architecture**:
  - GIPHY production API key is stored exclusively as a Google Cloud secret in Firebase Functions (`functions/src/giphy.ts`) and is never embedded in the iOS binary.
  - Client queries the server proxy `getGiphyTrending` / `searchGiphy`; the client never sees the raw GIPHY key.
  - Reviewer account passwords are generated dynamically on demand and never committed to version control.

---

## 2. Server-Authoritative Data Mutability (Firestore Rules)

Direct write access to core business collections from client SDKs is disabled by design in `firestore.rules`:
- `match /posts/{postId}`: `allow write: if false;` (All posts, status updates, edits, and deletions are executed exclusively via authenticated Cloud Functions).
- `match /profiles/{luid}`: `allow create, delete: if false;` (Updates restricted strictly to self, safe fields `display_name`, `bio`, `avatar_preset`, with strict character bounds).
- `match /admin_audit_logs/{id}`: `allow write: if false;`
- `match /users_private/{luid}`: `allow write: if false;`
- `match /account_access/{luid}`: `allow write: if false;`

---

## 3. Account Deletion & Token Revocation (Guideline 5.1.1(v))

- **In-App Flow**: User navigates to Profile -> Settings -> Delete Account.
- **Backend Handler**: `functions/src/accountDeletion.ts`:
  1. Revokes Apple Sign-In authorization tokens via Apple REST API using signed client secret JWT.
  2. Creates an `account_deletion_jobs` document with a unique generation timestamp.
  3. Purges all user posts, comments, likes, saves, and personal avatars in bounded sequential batches.
  4. Deletes Firebase Auth user record and sets profile `deleted_at`.
- **Regression Tests**: Verified in `functions/test/account-deletion.test.mjs` (6 passing assertions).

---

## 4. Differential Privacy & Anonymous Post Muting

- **Threat**: In an anonymous location social app, an attacker might deduce who created an anonymous post by muting/blocking a suspected user and checking whether the anonymous post disappears.
- **Countermeasure**:
  - `user_blocks` (identity blocks) apply strictly to attributed posts.
  - `anonymous_blocks` apply at the post display level via client filter without altering server rules:
    ```javascript
    function blockedOnPost(postId) {
      return post(postId).get('is_anonymous', false) != true && blockedBy(post(postId).creator_id);
    }
    ```
  - An unauthorized user cannot determine through permission rejections who authored an anonymous note.
- **Verification**: Verified in `functions/test/anonymous.test.mjs`.

---

## 5. Transport Security & Network Protection

- **App Transport Security (ATS)**: Default-deny with strict HTTPS TLS 1.3 enforced. Zero ATS exceptions in `Info.plist`.
- **App Attest / DeviceCheck**: Configured with production environment for App Attest tokens on live builds.
- **Rate Limiting**: Server-side sliding window rate limiter prevents automated spam (10 posts/hour, 50 posts/day).

