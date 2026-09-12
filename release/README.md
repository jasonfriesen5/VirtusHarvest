# Release materials — Virtus Cart

Everything needed to submit a version to the App Store, so none of it has to be
reconstructed from memory next time.

| file | what it's for |
|---|---|
| `demo-seed.sql` | **Re-runnable.** Wipes and rebuilds the App Review demo account's data. Run it if a reviewer ever deletes the account, or to reset it to a clean state before a submission. |
| `app-store-listing.md` | Promotional text, description, keywords — with character counts — plus URLs, category, rating, pricing and copyright. |
| `app-privacy-answers.md` | Exact answers for the App Privacy questionnaire, and why each one is what it is. |
| `smtp-setup.md` | How the Resend → Cloudflare → Supabase mail path was set up, step by step. |
| `app-review-2.1-reply.md` | The Guideline 2.1 information request: screen-recording shot list plus the full written answers. |
| `app-review-2.1-reply-final.txt` | The same reply trimmed to 3,930 characters, since App Store Connect's reply box caps at 4,000. |

## Release process

1. `native-app/bump-version.sh` — keeps `APP_VERSION`, Android
   `versionCode`/`versionName` and iOS `MARKETING_VERSION`/
   `CURRENT_PROJECT_VERSION` in step. Use it; they drift silently otherwise.
2. `cp index.html native-app/www/index.html && npx cap sync ios`
3. Archive in Xcode (or `xcodebuild archive`), then **Distribute App → App Store
   Connect** from Organizer. A command-line archive signs with a *development*
   identity — Organizer re-signs with distribution on export, which is fine.
4. Before submitting, sign in as the demo account once and confirm it works. It
   is the most common cause of a Guideline 2.1 rejection.

## Screenshots

App Store Connect's **6.9" slot covers 6.5" / 6.7" / 6.9"** — one set is enough.

| slot | size |
|---|---|
| iPhone 6.9" | 1320 × 2868 |
| iPad 13" | 2752 × 2064 (landscape) |

The iPad simulator captures 2752 × 2064 natively, so those need no processing.
An iPhone 17 Pro shoots 1206 × 2622, which scales into 1320 × 2868 with a
one-pixel trim. **Never route screenshots through a chat app** — WhatsApp
recompresses them to roughly a tenth of the size as JPEG.

## First submission, for reference

- **1.0.0 (9)** submitted 2026-08-13, Apple app ID 6800033526
- Came back as **Guideline 2.1 — Information Needed**, the routine first-time
  request for a demo video and app context. Answered with the reply in this
  folder plus a screen recording.
