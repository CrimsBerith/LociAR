# Legal & Support (App Store prerequisites)

Replace placeholders before submission.

## Required live URLs

| Item | Placeholder | Action |
|------|-------------|--------|
| Privacy Policy | `https://example.com/lociar/privacy` | Host real policy (location, camera, UGC, retention, delete) |
| Terms of Use | `https://example.com/lociar/terms` | Host terms + UGC rules |
| Support | `mailto:support@example.com` or `https://example.com/lociar/support` | Monitored inbox |

Set in EAS / env:

```bash
EXPO_PUBLIC_PRIVACY_URL=https://...
EXPO_PUBLIC_TERMS_URL=https://...
EXPO_PUBLIC_SUPPORT_URL=https://...
EXPO_PUBLIC_SUPPORT_EMAIL=support@...
```

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
