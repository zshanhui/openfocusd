# Chrome Web Store — Permission Justifications & Privacy Tab Answers

For OpenFocusd. Each justification is tied to real, verifiable code paths in this build
(search the cited files to confirm). Copy-paste into the matching field on the
**Privacy practices** tab of the item edit page.

> Updated for `browsers/chrome/manifest.json` version `2026.10.15`. That manifest adds the
> `favicon` permission for Time analytics icons. `activeTab` and `declarativeNetRequestFeedback`
> stay removed (see note at the end).

---

## Permission justifications

### alarms
**Used for:** enforcing daily site-blocking limits that must survive service-worker restarts,
and periodic refresh of remote protection lists.

The extension enforces per-group daily time allowances for blocked sites. Because Manifest V3
service workers can be suspended at any time, the background script registers
`chrome.alarms` timers to (a) reset each group's daily allowance at 6:00,
(b) expire/re-check group timers, and (c) wake the worker when a blocked group's allowance runs
out mid-session. See `ALARM_DAILY_RESET`, `ALARM_EXPIRY`, `ALARM_CHECKPOINT` in
`shared/js/background/components/site-groups.js`. Alarms are also used to refresh the
downloaded tracker/HTTPS rulesets on an interval (`shared/js/background/events.js`,
`shared/js/background/components/resource-loader.js`). No user data is involved beyond
local timers.

### cookies
**Used for:** closing a known gap in Manifest V3 cookie protection.

Third-party tracking cookies are stripped by observing response headers with the `webRequest`
API (see below), but in a few cases a `Set-Cookie` header can slip past the observation window.
`chrome.cookies.remove()` is then used to delete exactly that cookie for the URL in question, so
the user's browsing stays protected. See `validateSetCookieBlock` in
`shared/js/background/events/3p-tracking-cookie-blocking.js`. The API is only used to remove
cookies the extension was already blocking; cookies are never read for profiling, and nothing is
transmitted anywhere.

### declarativeNetRequest
**Used for:** the actual blocking engine. In Manifest V3, network requests cannot be cancelled
or redirected from `webRequest` observers, so the extension enforces all blocking with
declarative rules:

- **User site blocks** — every domain a user adds to a group/Always Block becomes a
  `chrome.declarativeNetRequest` dynamic rule that redirects that site to the in-extension
  blocked page (`shared/js/background/dnr-user-blocklist.js`).
- **Allowed Sites overrides** — user-allowed patterns create `allowAllRequests`-style rules
  that exempt those sites (`shared/js/background/dnr-user-allowlist.js`).
- **Bundled category rulesets** — the optional adult & gambling blocklist and the HTTPS-upgrade
  (Smarter Encryption) ruleset are shipped as rule resources in the manifest and applied on
  demand (`dnr-category-blocklist.js`, `dnr-smarter-encryption.js`).
- **Privacy rules** — Global Privacy Control header injection via DNR
  (`shared/js/background/dnr-gpc.js`), and Sanctuary Mode enforcement
  (`shared/js/background/dnr-sanctuary.js`).

Rule matching happens locally in the browser; no request data leaves the device.

### favicon
**Used for:** site icons on the Time analytics tab only.

The options page shows a 16px icon beside each host in Time analytics. The icon is loaded from
Chrome's favicon cache through the extension URL `/_favicon/?pageUrl=…&size=32`. See
`faviconURL` in `shared/js/ui/templates/time-analytics.js`. The page address is handed to Chrome
so it can look up an icon it already has. It is not sent to OpenFocusd, and the extension does
not call a third-party favicon host. Firefox builds omit the icon because `/_favicon/` is
Chrome-only.

### host permission use (`*://*/*`)
**Used for:** applying user-configured blocking to *any* domain the user chooses.

Because the whole point of the product is that *the user* decides which sites to block, the
rules cannot be limited to a fixed host list — a dynamic rule/`<all_urls>` match is required so
that whatever site the user adds to a group is blocked, and so the extension can read the URL of
the current page to show correct group/timer status and the blocking page. The same broad match
covers the registered content scripts (below) and the `webRequest`/`webNavigation` observers.
URLs are processed locally to decide blocking and to add up time. Page content is not read.
For sites the user puts in a group or in Allowed Sites, the hostname and the seconds spent that
day are stored on the device for the timer and Time analytics. Nothing is transmitted.

### remote code use
**No remote code is executed.** All JavaScript is bundled into the extension and shipped inside
the package; the manifest content security policy is `script-src 'self'; object-src 'self'`
(`browsers/chrome/manifest.json`), which forbids remote scripts. The only network activity is
downloads of *data files* (tracker rulesets/configuration from `staticcdn.duckduckgo.com`), which
are parsed as JSON and never executed as code. If the dashboard asks whether the product uses
remote code, answer **No** and paste: "All code is bundled locally with the extension. Only data
files (JSON rulesets) are downloaded and parsed; no remote code is ever executed, as enforced by
the manifest's `script-src 'self'` CSP."

### scripting
**Used for:** registering the extension's content scripts, which Manifest V3 requires via
`chrome.scripting`.

At startup the background script registers two content scripts that run on page load
(`shared/js/background/components/mv3-content-script-injection.js`): a small isolated-world
messaging helper and the bundled protection script (`public/js/inject.js`), injected at
`document_start` in all frames, which applies the extension's on-page privacy protections
(tracker/cookie protection) under the remote configuration. The same API registers the YouTube
sanitizer: four bundled CSS files plus a small class-toggle script, matched only to YouTube,
also at `document_start` (`shared/js/background/components/sanitize-youtube.js`). Those styles
hide comments, recommendations, and Shorts, and blur thumbnails, when the user turns the
matching setting on. `chrome.scripting.executeScript` is also used for user-triggered
cookie-banner actions (`shared/js/background/components/cookie-prompt-management.js`) and to
apply the YouTube classes on tabs that are already open. Scripts and CSS are first-party,
bundled, and versioned with the extension. They do not skip video ads.

### storage
**Used for:** persisting the product's local state.

`chrome.storage.local` stores the user's own data: site groups, Allowed Sites, settings
(language, optional privacy toggles, YouTube sanitizer switches), and time records. Time
records are `groupUsage` and `allowedSiteUsage` (`shared/js/background/site-groups-store.js`,
`shared/js/background/allowed-sites-store.js`). Each finished day keeps the hostname and the
seconds spent. `USAGE_HISTORY_DAYS` in `shared/js/shared-utils/site-groups.js` is 30: older
days are deleted when the focus day rolls. The options page shows today and the last 7 days
of that store. Deleting a site group deletes that group's record immediately. Removing one
site, or clearing Allowed Sites, leaves that host's past time until the 30-day window drops
it or the group is deleted. Uninstalling the extension deletes the local store.
`chrome.storage.session` holds ephemeral state that should not survive a worker restart. See
`shared/js/background/settings.js` and `shared/js/background/wrapper.js`. There is no
`storage.sync` and nothing is uploaded. Cached tracker and HTTPS rulesets are also kept
locally.

### tabs
**Used for:** knowing which site is active so the extension can show the right state and act
only where the user is looking.

The extension tracks open tabs (URL/state) to (a) update the toolbar icon and popup with the
correct group/timer status for the current site, (b) answer popup queries about the active tab,
and (c) keep per-tab state in sync as pages load. See `shared/js/background/tab-manager.js` and
`shared/js/background/components/tab-tracking.js`. Tab URLs are used locally to decide
blocking, to show status, and to count time for the active site. They are never sent anywhere.

### webNavigation
**Used for:** reacting to navigations, which is how blocking is made visible and time is counted.

The extension listens to `webNavigation` events (`onCommitted`, `onBeforeNavigate`,
`onCompleted`, `onErrorOccurred`) so that (a) navigations to a site in a blocked group are
recognised and the daily timer is updated/counted correctly,
(b) the blocking/status UI stays accurate across SPA navigations, and (c) the action icon is
kept current per tab. See `shared/js/background/events.js` and
`shared/js/background/components/site-groups.js` / `sanctuary.js`. Navigation events are
processed locally only.

### webRequest
**Used for:** the cookie-protection feature, which cannot be expressed purely as static DNR
rules.

In Manifest V3 the extension observes `onHeadersReceived`/`onBeforeSendHeaders` (non-blocking,
with `extraHeaders`) to strip `Set-Cookie` / `Cookie` headers on third-party tracking requests,
and correlates with DNR to close protection gaps. See
`shared/js/background/events/3p-tracking-cookie-blocking.js` and the listener registrations in
`shared/js/background/events.js`. Headers are inspected locally to decide whether a request is a
tracker using the bundled rulesets; nothing is transmitted.

---

## Single purpose description

> OpenFocusd is a focus tool. Its single purpose is to help users stop wasting time by blocking
> distracting websites on a daily timer: sites are organised into user-defined groups with a
> shared daily allowance, an "Always Block" group for sites the user never wants to visit again,
> "Allowed Sites" that stay reachable even inside blocked groups, and Sanctuary Mode that locks
> the browser to only Allowed Sites for a chosen period. Time analytics shows that same on-device
> time for today and the last 7 days. The optional YouTube sanitizer hides comments,
> recommendations, and Shorts and blurs thumbnails on YouTube. The optional privacy protections
> (tracker blocking, Global Privacy Control, HTTPS upgrading) are supporting features of the same
> product and are controlled from the same settings; they exist to make focused browsing safer
> and do not constitute a separate purpose.

---

## Data usage / Developer Program Policies certification

Recommended answers for the Privacy practices questionnaire (answer carefully against the exact
questions shown). The published [privacy policy](https://zshanhui.github.io/openfocusd/#privacy)
still needs a sentence for the 30-day per-site history before you certify; `website/copy.yaml`
currently lists daily time used and was last updated 23 August 2026.

- **Collection/transmission:** OpenFocusd does not sell personal data and does not upload
  browsing history. It has no servers, no accounts, no remote analytics backend, and no
  advertising. Leave the "does not collect user data" certification unchecked. Local site
  lists and time records are user data under the questionnaire.
- **What is stored on the device:** site lists, groups, settings, and time records in
  `chrome.storage.local`. For sites in a group or in Allowed Sites, each day stores the
  hostname and the seconds spent. Daily records are kept for 30 days, then older days are
  deleted. The options page shows today and the last 7 days. Deleting a site group deletes
  that group's record immediately. Removing one site, or clearing Allowed Sites, leaves that
  host's past time until the 30-day window drops it or the group is deleted. Uninstalling
  the extension deletes the local store. The `favicon` permission only reads Chrome's icon
  cache for those hosts. The page address is not sent to OpenFocusd.
- **Third-party data flows to disclose (matching the policy):**
  - Optional HTTPS upgrading may send a short hash of a hostname to `duckduckgo.com` to learn
    whether the site supports HTTPS.
  - Optional tracker protection downloads public rulesets/config from `staticcdn.duckduckgo.com`.
  - If the user runs a search from the popup, the query goes to the search engine the user chose
    (DuckDuckGo or Brave Search).
  - None of these include the user's site lists, timers, or time records, and none are
    received by OpenFocusd.
- **Limited Use:** the extension complies with the Chrome Web Store Limited Use requirements;
  any data handled is used only to provide the stated blocking, timer, and on-device Time
  analytics features.

---

## Still required before publishing (cannot be done from the repo)

1. **Contact email** — add the publisher email on the item **Settings** page
   (use `shanhui.dev@proton.me`, which matches the privacy policy).
2. **Verify the email** — Google sends a verification link; click it, then re-check the item.
3. **Certify data usage** — tick the certification on the Privacy practices tab after filling in
   the answers above.

---

## Note: permissions removed to make review cleaner

- **`activeTab`** and **`declarativeNetRequestFeedback`** were present but unused in this build
  (no `getMatchedRules()` or active-tab script execution anywhere in the shipped bundle). They
  have been removed from `browsers/chrome/manifest.json` (and `activeTab` from
  `browsers/firefox/manifest.json`), which removes those justification prompts entirely and keeps
  the permission set to least-privilege.
