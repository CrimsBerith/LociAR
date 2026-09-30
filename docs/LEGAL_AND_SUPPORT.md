# Legal & Support (App Store prerequisites)

Replace placeholders before submission.

## Required live URLs

| Item | Placeholder | Action |
|------|-------------|--------|
| Privacy Policy | `https://lociar-admin.vercel.app/privacy` | Host real policy (location, camera, UGC, retention, delete) |
| Terms of Use | `https://lociar-admin.vercel.app/terms` | Host terms + UGC rules |
| Support | `https://lociar-admin.vercel.app/support` | Monitored inbox |

Values live in `Config/Base.xcconfig` (`LOCIAR_PRIVACY_URL`, `LOCIAR_TERMS_URL`, `LOCIAR_SUPPORT_URL`); the pages are served by the admin app (`admin/app/{privacy,terms,support}`).

## Privacy policy must cover

- Location (when in use) for create/view AR  
- Camera for AR editing  
- Text and social media links the user posts  
- Account phone number  
- UGC (posts, comments) + moderation  
- Account deletion request process  
- Third parties: Google Firebase (Auth, Firestore, Storage, Cloud Functions, App Check), Apple Maps  

## App Review contact

- Email: same as support  
- Demo path: e-posta doğrulanmış `apple-review@lociar.app` hesabı + `seed-review-content.mjs` örnek postları (şifre yalnız App Store Connect'te)  

## UGC statement (for App Review notes)

> User posts are held in `pending_review` until an admin approves. Users can report content. Contact email is available in Profile. 18+ content is not allowed. Protected locations are hard-blocked.
