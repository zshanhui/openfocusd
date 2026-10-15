# Chrome Web Store Listing — OpenFocusd

Draft prepared from `docs/` copy and the actual product behavior (site groups, Allowed Sites,
Sanctuary Mode, optional tracker protection). Everything below is written to be honest about
what the extension does and to survive review. **Remember to bump the manifest version before
each upload** (current: `2026.10.15`).

---

## Store fields (quick reference)

| Field | Value |
|---|---|
| Name | OpenFocusd |
| Category | Productivity |
| Language | English (United States) |
| Developer name | (your name or org, as on the dashboard) |
| Developer website | https://zshanhui.github.io/openfocusd/ |
| Support email | shanhui.dev@proton.me (must match policy contact) |
| Privacy policy URL | https://zshanhui.github.io/openfocusd/#privacy |
| Single purpose | A focus tool: block distracting websites on a daily timer (see text below) |

---

## Short description (max 132 characters)

Primary (76 chars):

> Block distracting websites on a daily timer, keep work sites reachable, and stay in control. Free and open source.

Backup (104 chars):

> A daily-timer website blocker with site groups, Allowed Sites, and Sanctuary Mode. Free and open source.

---

## Detailed description

> OpenFocusd helps you decide what matters — and block the rest.
>
> OpenFocusd is a focus tool that blocks distracting websites on a daily timer, keeps the
> sites you need for work reachable, and lets you take breaks on purpose. It is free, open
> source (Apache 2.0), and built around a simple rule: your data stays on your device.
>
> **How it works**
>
> Sites go into groups — for example News, Social, or Video. Every group has its own daily
> time allowance. When a group's time for the day runs out, every site in it stays blocked
> until the next day starts at 6:00. Sites you genuinely need stay in "Allowed Sites", so
> they remain reachable even when a group that contains them is blocked.
>
> **Features**
>
> • **Site groups with shared daily timers** — group the sites that eat your time and give
>   each group the allowance you choose. Time is shared across the group and resets daily
>   at 6:00.
>
> • **Always Block** — for the sites you never want to open again, no timer required.
>
> • **Allowed Sites** — keep essential work sites reachable even when their group is blocked.
>
> • **Sanctuary Mode** — lock the browser to only your Allowed Sites for the time you set,
>   for those moments when you need to get something done.
>
> • **Clear blocked page & popup timer** — see how much time each group has left at a glance
>   and manage your groups from the popup.
>
> • **Time analytics** — see time spent today and over the last 7 days, for sites in your
>   groups and for Allowed Sites. The record stays on this device.
>
> • **Optional adult & gambling list** — switch on a bundled blocklist when you want those
>   categories blocked by default. Allowed Sites can still make an exception.
>
> • **Optional privacy protections** — the same extension can block trackers, send Global
>   Privacy Control, and prefer encrypted connections, using public rulesets maintained by
>   DuckDuckGo. All of it is optional and toggled from the same settings.
>
> **Your data**
>
> OpenFocusd has no servers and no user accounts. Site lists, timers, and settings are stored
> locally by Chrome and are deleted when you uninstall the extension. Optional tracker
> protection downloads public rulesets hosted by DuckDuckGo; those downloads never include
> your site lists, timers, or browsing history.
>
> **Why OpenFocusd needs broad permissions**
>
> To block whichever sites you choose and show you the blocking page, the extension must be
> able to read the address of the pages you open. Nothing you browse is ever sent anywhere.
>
> Privacy policy: https://zshanhui.github.io/openfocusd/#privacy
> Source code: https://github.com/zshanhui/openfocus

---

## Screenshots (required: at least 1; recommended 3–5)

Ready-to-upload, cropped to **1280×800** in `website/screenshots/cws/` (generated from the
marketing originals; north-anchored to keep page headings and block-page tops).

Suggested order and captions:

1. `website/screenshots/cws/blocksite-2-1280x800.png` — Block Sites groups with daily time limits
   (first/hero image — it shows the core feature immediately).
2. `website/screenshots/cws/allowedsites-1280x800.png` — Allowed Sites list and Sanctuary Mode duration.
3. `website/screenshots/cws/always-block-1280x800.png` — Always Block group and the adult & gambling toggle.
4. `website/screenshots/cws/blocksites-1280x800.png` — The popup over the Block Sites page.
5. `website/screenshots/cws/blockpage-1280x800.png` — The page shown when a site is blocked.

Promotional tile (optional): 440×280 — reuse the hero treatment from the website.

Icon: `img/icon_128.png` from the extension build (128×128).

---

## Store form answers (paste-ready)

**Single purpose**
> This extension is a focus tool. Its single purpose is to help users block distracting
> websites on a daily timer, with per-group time allowances, Allowed Sites, and Sanctuary
> Mode. The optional privacy protections (tracker blocking and Global Privacy Control) are
> part of the same product and serve that purpose by making focused browsing safer; they are
> toggled from the same settings screen.

**Justification for host permissions (`<all_urls>`)**
> The extension blocks user-chosen websites and shows a blocking page in their place. It must
> read the URL of any page the user may decide to block, and apply declarativeNetRequest rules
> to those sites. URL data is processed locally and is never transmitted.

**Privacy practices (Data Safety section)**
> Recommended answers, to be completed carefully against the current questionnaire:
> - This extension does not collect or transmit user data (no accounts, no analytics, no backend).
> - Note: Chrome treats locally stored settings and site lists as user data even though they
>   never leave the device — answer the dashboard questions accordingly and reference the
>   privacy policy, which already covers this.
> - Do not claim "does not collect" if you enable the DuckDuckGo HTTPS check (hostname hash
>   requests) or Brave/DDG search — the privacy policy discloses those.

---

## Review checklist

- [ ] Version bumped above the last published one (`browsers/chrome/manifest.json`).
- [ ] Re-upload `build/chrome/release/chrome-release-<timestamp>.zip` (verify no `_metadata/` in it).
- [ ] Screenshots cropped to 1280×800.
- [ ] Support email matches the one in the privacy policy.
- [ ] Don't name-drop "StayFocusd" or "DuckDuckGo" as trademarks in the listing title; keep the
      factual note about DDG rulesets only in the privacy/technical copy (it already reads that way).
- [ ] **Consistency check:** the omnibox "ddg" keyword was removed from this build, but the
      website copy and privacy policy still mention an "address-bar keyword" search — update
      `website/copy.yaml` and the policy page to avoid contradicting the shipped extension.
- [ ] Confirm the localization claim before adding one — the shipped UI may only be fully
      translated for a subset of the ~40 bundled locales (Arabic screens exist).
