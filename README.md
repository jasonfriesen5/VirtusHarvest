# Virtus Harvest — phone app

The app that runs on the scale: a single-page `index.html` wrapped by Capacitor
for iOS and Android. No bundler — what ships is what is in the file.

## What's on this branch

| path | |
|---|---|
| `index.html` | the whole app |
| `native-app/` | the Capacitor wrapper, iOS and Android projects |
| `privacy.html`, `support.html`, `Reset Password.html` | the pages Apple and Google have on file |
| `release/` | store listing notes and screenshots |

The web console is on `harvest-web`. Virtus Feed is on `feed-web` and
`feed-app`. Firmware lives in its own repository.

## Building

    cd native-app
    npx cap sync android
    npx cap sync ios

Both platforms need syncing after any change to `index.html` — syncing one and
not the other silently ships the old assets to the other.

Android needs an explicit JDK 21; Android Studio's bundled runtime is Java 25
and breaks the Gradle version this project uses.
