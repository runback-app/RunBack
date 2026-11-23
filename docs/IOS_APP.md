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
- Web push alerts do not work inside the app. Native Apple push is implemented behind a setup flag; activate and verify it using the steps below.
- The browser service worker isn't registered in the app.
- Text can't be selected except in inputs and long text pages (privacy, terms), like a normal app.

## Still to do before App Store

- Configure and verify native Apple push on a real iPhone (below)
- Activate the website association for crew/friend/run links. Authentication email callbacks stay on the website.
- Test on a real iPhone: sign in, check in, photo upload, chat, Got next, friends, crews, offline screen, swipe back

## November 23 app preparation

The iPhone project now includes the native Push Notifications plugin, APNs registration callbacks, notification tap routing, and associated-domain/push entitlements. The web app exposes Updates in its phone navigation. Native notifications remain disabled by default until the server and Apple configuration below are ready.

### Activate under Sanjay's Apple Developer account

1. In Sanjay's Apple Developer account, verify membership and register the explicit bundle ID `net.runback.app`. Enable Push Notifications and Associated Domains. In Xcode select Sanjay's team and let automatic signing create a development profile. Archive/distribute through Xcode for the production APNs entitlement.
2. From the registered identifier, copy the **App ID prefix** (verify it; do not assume it equals the Team ID). Run `npm run app:links -- PREFIX.net.runback.app`. Commit the generated `public/.well-known/apple-app-site-association`, deploy, and verify the URL returns JSON directly over HTTPS, without a redirect. The Vercel content-type header is configured. Never publish a placeholder prefix.
3. Create APNs token signing keys for this app and the environment being tested. Keep `.p8` files out of source control. Configure these only as Supabase Edge Function secrets: `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY` for production; `APNS_SANDBOX_KEY_ID`, `APNS_SANDBOX_PRIVATE_KEY` for sandbox. Sandbox and production may require different keys. The topic is fixed to `net.runback.app`.
4. Apply the native push migration and deploy the updated `send-alerts` function in the **shared production project** `ioxmdthiblgudygedjmc`. Test server connectivity to Apple before enabling clients. Devices reuse the private subscription table and existing check-in, run and Got Next targeting rules. A new RPC validates Apple tokens; players can only read/remove their own devices.
5. In the local iPhone build environment set `VITE_NATIVE_PUSH_ENABLED=true`. Set `VITE_NATIVE_PUSH_ENVIRONMENT=sandbox` for Xcode device builds, `production` for TestFlight/App Store. Run `npm run app:sync` after setting these values. Never enable the client flag until matching server credentials are ready.
6. Open Xcode with `npm run app:open`, select the iPhone and run. Enable alerts from Profile. Permission is only requested on that button; app startup only refreshes a previously opted-in account. Verify the same device moves to the current account on a shared phone and stops receiving new notifications after alerts are turned off/sign-out.

The `iPhone build` GitHub workflow compiles an unsigned simulator build. It does not sign, upload, or publish the app. Local `app:sync` verifies the JavaScript build and plugin wiring; a Mac/Xcode compile and physical-phone delivery are separate checks.

### Real iPhone acceptance checks

- Signup and login, invitation preserved through email confirmation; fresh reset link, password change and fresh login. Auth callbacks remain in the browser.
- Crew and friend links with the app closed/open/signed out. Without the app installed, the same links must work on the website.
- Check in/out and switch courts; Got Next team membership; crew roster, private crew chat, per-run chat, report and block; photo selection and camera; account deletion using a disposable account.
- Cancel one recurring date, stop a whole series, return after refresh and the next scheduler run; confirm attendees receive updates and canceled dates do not return.
- Enable/disable notifications; test background and closed-app delivery, notification tap to the right court/run, revoked permission and expired device registration. Use sandbox on Xcode builds and production on TestFlight.
- Keyboard, safe areas, five navigation tabs, swipe back, loss/recovery of internet and return from background.

App Store submission still needs an app record, signed archive/TestFlight testing, screenshots and metadata, privacy disclosures, a review account, and verification of the moderation/support process. No App Store submission is performed by this code change.
