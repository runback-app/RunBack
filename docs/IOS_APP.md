# iPhone app (Capacitor)

The iPhone app is the same React site, packed into a real iOS app with [Capacitor](https://capacitorjs.com). The site's built files ship inside the app, so it opens fast and shows a "No connection" screen when offline.

- App ID: `net.runback.app`. Name on the Home Screen: Runback.
- iPhone only, portrait only (no iPad screenshots needed for review).
- Xcode project: `ios/App/App.xcodeproj`. Plugins come in through Swift Package Manager (no CocoaPods).
- Native code we changed: `ios/App/App/SceneDelegate.swift` (swipe back from the left edge).

## Run it on your iPhone (Mac)

1. Install Xcode from the Mac App Store and open it once to finish setup.
2. In the repo: `npm ci`, and make `.env.local` with the two `VITE_SUPABASE_...` lines from `.env.example` (same values as on Vercel).
3. `npm run app:sync` (builds the site and copies it into the iPhone project), then `npm run app:open`.
4. In Xcode: click **App** in the left list → **Signing & Capabilities** → Team: pick your Apple account. Plug in your iPhone, pick it at the top, press ▶︎.
5. First time on the phone: Settings → General → VPN & Device Management → trust your developer account. Also turn on Developer Mode if iPhone asks.

Run `npm run app:sync` again after every code change you want in the app.

## How the app differs from the website

- Links people share (crew invites, friend links) and email links (sign up, password reset) always use https://runback.net, because inside the app the page address is `capacitor://localhost`.
- Web push alerts don't work inside the app; the Profile page says alerts in the app are coming soon. Next step: Apple push (APNs) through `@capacitor/push-notifications`, and `send-alerts` sending to Apple.
- The browser service worker isn't registered in the app.
- Text can't be selected except in inputs and long text pages (privacy, terms), like a normal app.

## Still to do before App Store

- Apple push alerts (above)
- Open runback.net links in the app (universal links) so crew invites and email links land in the app
- Test on a real iPhone: sign in, check in, photo upload, chat, Got next, friends, crews, offline screen, swipe back

### Activate and test crew invite links

The native router accepts ordinary HTTPS crew invites on `runback.net`. Before enabling the website association, verify the signing team's App ID prefix for `net.runback.app`. In Xcode, add the Associated Domains capability with `applinks:runback.net`. Serve `/.well-known/apple-app-site-association` on the production domain as JSON with no redirect, using the verified app identifier.

Scope the website association to crew invite paths. Exclude signup confirmation and auth error callbacks that return to an invite URL with query parameters or a fragment. Password reset and signup verification use the existing web auth flow. Test that the association serves correctly before installing the signed build on an iPhone.

- Tap a crew invite in Messages with Runback closed, then again with Runback already running.
- Repeat while signed out. Sign in and confirm the same invitation is still open.
- Open the invite on a phone without Runback and confirm that the browser join page works.
- Sign up from a crew invite and open the verification email. Confirm verification succeeds and the invite is still available.
- Request a password reset from Runback, open the email on the phone, save a new password, and use it to sign back in.
