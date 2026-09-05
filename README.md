# Virtus Harvest — phone app

The app that runs beside the scale: a single-page `index.html` wrapped by
Capacitor for iOS and Android. No bundler — what ships is what is in the file.

## What's on this branch

| path | |
|---|---|
| `index.html` | the whole app |
| `native-app/` | the Capacitor wrapper, iOS and Android projects |
| `privacy.html`, `support.html`, `Reset Password.html` | the pages Apple and Google have on file |
| `release/` | store listing notes and screenshots |
| `hardware/`, `virtus_scale/`, `dfu_flash_feather/` | the scale's own board and flashing tools |

The web console is on `harvest-web`. Virtus Feed is on `feed-web` and
`feed-app`. The nRF firmware lives in its own repository.

## Building

    cd native-app
    npx cap sync android
    npx cap sync ios

Sync **both** platforms after any change to `index.html`. Syncing one and not
the other silently ships the previous assets to the other, with no error.

Android needs an explicit JDK 21 — Android Studio's bundled runtime is Java 25
and breaks the Gradle version this project pins.

## Not in this repository

`auth_keys/` and `dfu_keys/` hold the ECDSA keys the scale signs its challenge
with and that sign firmware packages. They are gitignored deliberately: leaking
either would let someone build a scale the app accepts as genuine, or sign
firmware that devices in the field would install.
