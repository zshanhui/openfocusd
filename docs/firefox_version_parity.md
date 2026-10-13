# Firefox version parity

Release plan for making the Firefox build match the Chrome and Brave build for OpenFocus features.

Chrome and Brave are the same extension: Manifest V3, `BUILD_TARGET=chrome`, blocking through `declarativeNetRequest`. Firefox is Manifest V2, `BUILD_TARGET=firefox`, blocking through `webRequest` / `webRequestBlocking`. This release keeps that split. `declarativeNetRequest` is unavailable on Manifest V2, and a Manifest V3 port would also move background execution, content-script injection, and tracker blocking.

Implement and review one part at a time, in order. Each part is safe to land on its own. Later parts fill in enforcement the earlier part leaves to the existing `tabs.update` navigation guards.

## What already matches

Tracker blocking, HTTPS upgrades, the popup shell, and the Block Trackers options tab already run on Firefox. `npm run dev-firefox` writes `build/firefox/dev`. `npm run release-firefox` writes `build/firefox/release`.

## What does not match

`shared/js/background/background.js` starts these only when `BUILD_TARGET === 'chrome'`:

| Feature | Chrome / Brave | Firefox today |
| --- | --- | --- |
| Site groups (timer, expiry, redirect to `blocked.html`) | On | Background never starts |
| Allowed sites | On | Background never starts |
| Sanctuary | On | Background never starts |
| Adult / gambling category block | On, via the static ruleset plus dynamic rules | `categoryBlockSupported` is false because it checks manifest version 3 |
| Sanitize YouTube | On, via `browser.scripting.insertCSS` | Background never starts, and Firefox has no `browser.scripting` |
| Time analytics | On, fed by `getSiteGroupsState` | Options tab renders, then the message has no handler |
| Options: Block sites and Allowed sites views | Mounted | `options.js` skips both views |
| Popup group countdown and sanctuary card | Handlers registered | Messages go unanswered |

Cookie-prompt management, Manifest V3 content-script registration, `declarativeNetRequest` tracker rules, and new-tab tracker stats stay Chrome-only. Firefox already blocks trackers with `webRequest`. Those pieces are outside this plan.

## Blocking behavior the later parts preserve

Chrome enforces focus policy inside `declarativeNetRequest`. Parts 2–4 make the same decisions on `webRequest.onBeforeRequest` with `"blocking"`.

Evaluate in this order:

1. **Sanctuary active** (part 3). Allow a top-level navigation when the host matches an allowed-site pattern (`requestDomainForAllowedPattern` / `dnrRegexForAllowedPattern` equivalents already live in `shared/js/shared-utils/allowed-sites.js`). Redirect every other top-level navigation to `html/blocked.html`. Leave subresources of an allowed page alone, matching `refreshSanctuaryRules` in `dnr-sanctuary.js`.
2. **Site group exhausted or always-block** (part 2). Redirect the top-level navigation to `html/blocked.html`. Cancel other request types to that domain, matching `refreshUserBlockedSitesRules` in `dnr-user-blocklist.js`.
3. **Adult / gambling list enabled** (part 4). If the host is on the bundled list and is not an allowed site, redirect the top-level navigation and cancel other request types. Allowed sites stay exempt. Reuse `hostnameMatchesCategoryList` and the domain set built from `data/bundled/adult-gambling-rules.json`.

The navigation guards in `site-groups.js` and `sanctuary.js` (`tabs.update` to the blocked page) stay as a backstop. They already use `browser.webNavigation`, which Firefox has. `tab.pendingUrl` is Chrome-only; `webNavigation.onBeforeNavigate` is the early signal on Firefox.

Register the blocking listener while the background script is still evaluating, before any `await`. The Firefox background page is persistent, so an in-memory policy object is enough. Components update that object whenever they would have called `updateDynamicRules` or `updateEnabledRulesets`. The listener only reads it.

If Firefox refuses a `webRequest` `redirectUrl` to the extension page, add `/html/blocked.html` to `web_accessible_resources` in the Firefox manifest. If redirect is still rejected, cancel the request and let the existing `tabs.update` guard open the blocked page.

## Part 1 — Turn the features on

Status: implemented.

Land the options UI, popup, timer, and YouTube sanitizing on Firefox. Network-level blocking is still the `tabs.update` guards already in `site-groups.js` and `sanctuary.js`. Parts 2–4 replace that gap.

### Changes

- Raise `strict_min_version` in `browsers/firefox/manifest.json` from `102.0` to `128.0`. The manifest already sets content-script `world` to `ISOLATED` and `MAIN`, which Firefox honors from version 128. Firefox 128 also has `runtime.getContexts`, which `SiteGroups.isPopupOpen` uses to keep the countdown running while the popup is open. Keep the current fallback that returns false when `getContexts` is missing.
- In `background.js`, construct `SiteGroups`, `AllowedSites`, `Sanctuary`, and `SanitizeYoutube` for every `BUILD_TARGET`.
- Leave these on the Chrome branch: `MV3ContentScriptInjection`, `DNRListeners`, `require('./dnr-config-rulesets')`, `CookiePromptManagement`, and the session-rule offset in `startup.js`. Firefox content scripts stay in the manifest. Keep `RequestBlocklist` on the Firefox branch.
- On manifest version 2, make these return without calling `chrome.declarativeNetRequest`, with the same success shape callers already expect:
  - `refreshUserBlockedSitesRules` / `setBlockedSites` in `dnr-user-blocklist.js`
  - `refreshSanctuaryRules` / `clearSanctuaryRules` in `dnr-sanctuary.js`
  - `refreshAdultGamblingRuleset` / `refreshCategoryAllowRules` in `dnr-category-blocklist.js`
- Manifest V3 keeps the current rule updates.
- In `shared/js/ui/pages/options.js`, mount `SiteGroupsView` and `AllowedSitesView` for Firefox. `shared/html/options.html` already has both panels.
- YouTube CSS: `SanitizeYoutube` calls `browser.scripting.insertCSS` and `removeCSS`, which Firefox does not have. In `shared/js/background/wrapper.js`, map the Manifest V3 `css` string to the Manifest V2 `code` field inside `convertScriptingAPIOptionsForTabsAPI`. Add `removeCSS` that calls `browser.tabs.removeCSS(tabId, { code })` when `browser.scripting` is missing, and `browser.scripting.removeCSS` otherwise. Call those helpers from `sanitize-youtube.js`. Firefox already has the `tabs` permission.
- `Sanctuary` calls `chrome.alarms` and `chrome.webNavigation`. Firefox exposes those under `chrome.*`. Switch them to `browser` from `webextension-polyfill` only if a call throws during the review below.
- Time analytics icons stay absent on Firefox. `/_favicon/` is a Chrome API, and this plan does not call a third-party favicon host. Totals and the site list are the feature.

### Review

`npm run dev-firefox`, load `build/firefox/dev` in Firefox 128 or newer:

- Block sites and Allowed sites tabs render and save.
- A group timer counts, and the popup shows it. Opening the popup keeps the countdown running.
- An expired or always-block group redirects the open tab through the existing navigation guard.
- Time analytics today / week totals match the group. Rows have no favicons.
- Each YouTube sanitizer option applies on an open YouTube tab and clears when turned off.
- Chrome unit tests for site groups and allowed sites still pass. DeclarativeNetRequest writes on Chrome are unchanged.

## Part 2 — Block site groups with webRequest

Status: implemented.

Add the listener and enforce exhausted and always-block groups before the document loads.

### Changes

- Add `shared/js/background/focus-block-policy.js` with the blocked-domain set, `installFocusBlockListener()`, and a setter part 3 and part 4 will extend (sanctuary and category fields can exist and stay empty).
- Call `installFocusBlockListener()` from the Firefox branch of `background.js` during initial evaluation, before any `await`.
- `refreshUserBlockedSitesRules` on manifest version 2 updates that domain set instead of returning a pure no-op.
- Listener decisions for this part: a main-frame request to a blocked domain redirects to `html/blocked.html`; any other request type to that domain cancels. Every other request is left alone, including while sanctuary and category fields are empty.

### Review

Unit-test the decision function with no browser APIs:

- expired or always-block domain: main frame redirects, subresource cancels
- group with time remaining: request is untouched
- empty policy: no redirect and no cancel

Manual, on the Firefox dev build:

- Let a group expire and confirm the open tab lands on the blocked page.
- Navigate to that host again and confirm the blocked page appears without a flash of the site.
- Add a site to an always-block group and confirm it blocks immediately.
- Confirm a site that still has time opens normally.

## Part 3 — Sanctuary

Status: implemented.

Enforce sanctuary in the same listener, ahead of the site-group check.

### Changes

- `refreshSanctuaryRules` and `clearSanctuaryRules` on manifest version 2 set or clear the sanctuary flag and allow patterns on the policy object.
- When sanctuary is active, allow a top-level navigation that matches an allowed-site pattern. Redirect every other top-level navigation to `html/blocked.html`. Leave subresources of an allowed page alone.
- Site-group counting already pauses while sanctuary is active (`syncFromFocusedTab` in `site-groups.js`). Keep that.

### Review

Extend the part 2 unit tests:

- sanctuary on: allowed host passes, any other host redirects, a subresource of an allowed host passes
- sanctuary off: part 2 behavior is unchanged

Manual, on the Firefox dev build:

- Add an allowed site, start sanctuary, and confirm that site opens.
- Confirm a site outside the allow list hits the blocked page.
- End sanctuary and confirm normal browsing and group limits return.

## Part 4 — Adult / gambling block, then release sign-off

Status: implemented. The manual Firefox pass and release checklist below are still open.

Turn the category list on for Firefox and run the full release pass.

### Changes

- On manifest version 2, `refreshAdultGamblingRuleset` / `refreshCategoryAllowRules` load the domain set from `data/bundled/adult-gambling-rules.json` into the policy object and record the allowed-site exceptions. They do not call `updateEnabledRulesets`.
- When the toggle is on, a listed host that is not an allowed site redirects on the main frame and cancels on other request types. An allowed-site exception passes. The toggle off clears the set.
- `categoryBlockSupported` in `SiteGroups.getState` is true when either declarativeNetRequest rulesets or the webRequest listener is available. The checkbox in `shared/js/ui/templates/site-groups.js` follows that flag.

### Review

Extend the unit tests:

- category on: listed host redirects, allowed-site exception passes
- category off: request is untouched
- sanctuary still wins over the category list when both are active

Manual, on `npm run dev-firefox`:

- The adult/gambling checkbox is visible and persists.
- A listed host is blocked. An allowed-site exception of a listed host opens.
- Repeat the part 1–3 checks once more so the combined listener still matches.

Then `npm run release-firefox` and repeat that combined pass on `build/firefox/release`.

### Release checklist

- [ ] `strict_min_version` is `128.0`
- [ ] Firefox background starts site groups, allowed sites, sanctuary, and YouTube sanitizing
- [ ] Site-group, sanctuary, and category decisions go through the webRequest listener
- [ ] Chrome and Brave still use declarativeNetRequest only
- [ ] Options Block sites and Allowed sites tabs work on Firefox
- [ ] YouTube sanitizer CSS applies and clears on Firefox
- [ ] Combined manual pass is done on `build/firefox/release`
- [ ] Store listing text does not claim cookie-prompt controls or new-tab tracker stats on Firefox
