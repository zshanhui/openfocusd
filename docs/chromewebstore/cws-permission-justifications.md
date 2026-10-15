# Chrome Web Store — Permission Justifications & Privacy Tab Answers

For OpenFocusd. Each justification is tied to real, verifiable code paths in this build
(search the cited files to confirm). Copy-paste into the matching field on the
**Privacy practices** tab of the item edit page.

> Updated for `browsers/chrome/manifest.json` version `2026.10.15`. That manifest adds the
> `favicon` permission for Time analytics icons. `activeTab` and `declarativeNetRequestFeedback`
> stay removed (see note at the end).

---

## Permission justifications

Each block under a heading is one store field. Paste the paragraph only. Every block is under 900 characters.

### alarms

Enforces daily site-blocking limits across service-worker restarts, and refreshes downloaded protection lists. Manifest V3 service workers can be suspended, so the background registers chrome.alarms to reset each group's allowance at 6:00, re-check group timers, and wake the worker when a blocked group's time runs out (ALARM_DAILY_RESET, ALARM_EXPIRY, ALARM_CHECKPOINT in shared/js/background/components/site-groups.js). Alarms also refresh tracker and HTTPS rulesets (shared/js/background/events.js, shared/js/background/components/resource-loader.js). Only local timers are involved.

### cookies

Closes a gap in Manifest V3 cookie protection. Third-party tracking cookies are stripped by observing response headers with webRequest. If a Set-Cookie header slips past that window, chrome.cookies.remove() deletes that cookie for the URL (validateSetCookieBlock in shared/js/background/events/3p-tracking-cookie-blocking.js). The API only removes cookies the extension was already blocking. Cookies are never read for profiling, and nothing is transmitted.

### declarativeNetRequest

The blocking engine. Manifest V3 cannot cancel or redirect requests from webRequest, so blocking uses declarative rules matched locally. No request data leaves the device. Each domain added to a group or Always Block becomes a dynamic rule that redirects the site to the in-extension blocked page (shared/js/background/dnr-user-blocklist.js). Allowed Sites create allow rules that exempt those sites (dnr-user-allowlist.js). The optional adult and gambling list and the HTTPS-upgrade ruleset are manifest rule resources, applied on demand (dnr-category-blocklist.js, dnr-smarter-encryption.js). Global Privacy Control is injected with dnr-gpc.js. Sanctuary Mode is enforced with dnr-sanctuary.js.

### favicon

Site icons on the Time analytics tab only. The options page shows a 16px icon beside each host, loaded from Chrome's favicon cache via /_favicon/?pageUrl=…&size=32 (faviconURL in shared/js/ui/templates/time-analytics.js). The page address is given to Chrome so it can look up an icon it already has. It is not sent to OpenFocusd, and the extension does not call a third-party favicon host. Firefox builds omit the icon because /_favicon/ is Chrome-only.

### host permission (`*://*/*`)

Applies user-configured blocking to any domain the user chooses, and counts time on those sites. The user picks the sites, so rules cannot be limited to a fixed host list. A dynamic rule and <all_urls> match is required so any site added to a group is blocked, and so the extension can read the current page URL to show group and timer status and the blocking page. The same match covers the content scripts and the webRequest and webNavigation observers. URLs are processed locally to decide blocking and to add up time. Page content is not read. For a site in a group or in Allowed Sites, the hostname and the seconds spent that day are stored on the device. Nothing is transmitted.

### remote code

No remote code is executed. All JavaScript is bundled in the package. The manifest content security policy is script-src 'self'; object-src 'self' (browsers/chrome/manifest.json), which forbids remote scripts. The only network activity is downloads of data files: tracker rulesets and configuration from staticcdn.duckduckgo.com. Those files are parsed as JSON and are never executed as code.

### scripting

Registers content scripts, which Manifest V3 does through chrome.scripting. At startup the background registers a small messaging helper and the bundled protection script public/js/inject.js, both at document_start in all frames, for on-page tracker and cookie protection (shared/js/background/components/mv3-content-script-injection.js). The same API registers the YouTube sanitizer: four bundled CSS files plus a small class-toggle script, matched only to YouTube, also at document_start (shared/js/background/components/sanitize-youtube.js). Those styles hide comments, recommendations, and Shorts, and blur thumbnails, when the matching setting is on. chrome.scripting.executeScript also runs user-triggered cookie-banner actions and applies YouTube classes on tabs already open. Scripts and CSS ship with the extension. They do not skip video ads.

### storage

Persists local state. Nothing is uploaded, and there is no storage.sync. chrome.storage.local stores site groups, Allowed Sites, settings (language, privacy toggles, YouTube switches), and time records groupUsage and allowedSiteUsage (site-groups-store.js, allowed-sites-store.js). Each finished day keeps the hostname and the seconds spent. USAGE_HISTORY_DAYS in shared/js/shared-utils/site-groups.js is 30; older days are deleted when the focus day rolls. The options page shows today and the last 7 days. Deleting a site group deletes that group's record immediately. Removing one site, or clearing Allowed Sites, leaves that host's past time until the 30-day window drops it or the group is deleted. Uninstall deletes the local store. chrome.storage.session holds ephemeral state. Cached tracker and HTTPS rulesets stay on the device.

### tabs

Knows which site is active so the extension can show the right state for the tab the user is viewing. Open tabs are tracked to update the toolbar icon and popup with that site's group and timer, answer popup queries about the active tab, and keep per-tab state in sync as pages load (shared/js/background/tab-manager.js, shared/js/background/components/tab-tracking.js). Tab URLs are used locally to decide blocking, show status, and count time. They are never sent anywhere.

### webNavigation

Reacts to navigations so blocking stays visible and time is counted. The extension listens to webNavigation (onCommitted, onBeforeNavigate, onCompleted, onErrorOccurred) so a navigation into a blocked group updates the daily timer, the blocking and status UI stays accurate across in-page navigations, and the action icon stays current per tab (shared/js/background/events.js, site-groups.js, sanctuary.js). Navigation events are processed locally only.

### webRequest

Cookie protection, which cannot be expressed as static declarativeNetRequest rules alone. The extension observes onHeadersReceived and onBeforeSendHeaders (non-blocking, with extraHeaders) to strip Set-Cookie and Cookie headers on third-party tracking requests, and correlates with declarativeNetRequest to close protection gaps (shared/js/background/events/3p-tracking-cookie-blocking.js, listeners in shared/js/background/events.js). Headers are inspected locally, using the bundled rulesets, to decide whether a request is a tracker. Nothing is transmitted.

---

## Single purpose description

OpenFocusd is a focus tool. Its single purpose is to help users stop wasting time by blocking distracting websites on a daily timer. Sites go into user-defined groups with a shared daily allowance, an Always Block group for sites the user never wants to open again, and Allowed Sites that stay reachable. Sanctuary Mode locks the browser to only Allowed Sites for a chosen period. Time analytics shows that same on-device time for today and the last 7 days. The optional YouTube sanitizer hides comments, recommendations, and Shorts and blurs thumbnails. Optional tracker blocking, Global Privacy Control, and HTTPS upgrading are supporting features of the same product, controlled from the same settings.

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
