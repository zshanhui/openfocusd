import browser from 'webextension-polyfill';
import { isHostnameAllowed } from '../shared-utils/allowed-sites';
import { hostnameMatchesCategoryList } from '../shared-utils/category-dnr-ruleset';
import { hostnameFromUrl } from '../shared-utils/site-groups';
import { isSanctuarySessionActive } from '../shared-utils/sanctuary';
import { getExtensionURL, getManifestVersion } from './wrapper';

const BLOCKED_PAGE_PATH = '/html/blocked.html';
const MAIN_FRAME_RESOURCE_TYPE = 'main_frame';

export const FOCUS_POLICY_STORAGE = {
    blocked: 'openfocusd.focus.blocked',
    sanctuary: 'openfocusd.focus.sanctuary',
    category: 'openfocusd.focus.category',
};

/**
 * In-memory focus policy for the Manifest V2 webRequest listener.
 *
 * @type {{
 *   blockedDomains: Set<string>,
 *   sanctuaryActive: boolean,
 *   sanctuaryEndsAt: number,
 *   allowPatterns: string[],
 *   categoryEnabled: boolean,
 *   categoryDomains: Set<string>,
 *   categoryAllowPatterns: string[],
 * }}
 */
const policy = {
    blockedDomains: new Set(),
    sanctuaryActive: false,
    sanctuaryEndsAt: 0,
    allowPatterns: [],
    categoryEnabled: false,
    categoryDomains: new Set(),
    categoryAllowPatterns: [],
};

let listenerInstalled = false;

/**
 * Firefox's background page can read localStorage synchronously. The webRequest
 * listener is installed before settings finish loading, so the previous block
 * list has to be available without a storage.local await.
 *
 * @returns {Storage | null}
 */
function localStore() {
    try {
        if (typeof localStorage === 'undefined') {
            return null;
        }
        return localStorage;
    } catch (e) {
        return null;
    }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {boolean}
 */
function writeJson(key, value) {
    const store = localStore();
    if (!store) {
        return false;
    }
    try {
        store.setItem(key, JSON.stringify(value));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * @param {string} key
 * @returns {unknown}
 */
function readJson(key) {
    const store = localStore();
    if (!store) {
        return null;
    }
    try {
        const raw = store.getItem(key);
        if (!raw) {
            return null;
        }
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((item) => typeof item === 'string' && item);
}

function persistBlockedDomains() {
    writeJson(FOCUS_POLICY_STORAGE.blocked, [...policy.blockedDomains]);
}

function persistSanctuary() {
    writeJson(FOCUS_POLICY_STORAGE.sanctuary, {
        active: policy.sanctuaryActive,
        endsAt: policy.sanctuaryEndsAt,
        allowPatterns: policy.allowPatterns,
    });
}

function persistCategory() {
    const payload = {
        enabled: policy.categoryEnabled,
        domains: [...policy.categoryDomains],
        allowPatterns: policy.categoryAllowPatterns,
        domainsOmitted: false,
    };
    if (writeJson(FOCUS_POLICY_STORAGE.category, payload)) {
        return;
    }
    writeJson(FOCUS_POLICY_STORAGE.category, {
        enabled: policy.categoryEnabled,
        domains: [],
        allowPatterns: policy.categoryAllowPatterns,
        domainsOmitted: true,
    });
}

/**
 * Put the last saved block list back before the listener is installed.
 * A missing snapshot leaves that part of the policy empty.
 */
export function restoreCachedFocusPolicy() {
    const blocked = readJson(FOCUS_POLICY_STORAGE.blocked);
    if (Array.isArray(blocked)) {
        policy.blockedDomains = new Set(stringList(blocked));
    }

    const sanctuary = readJson(FOCUS_POLICY_STORAGE.sanctuary);
    if (sanctuary && typeof sanctuary === 'object') {
        const saved = /** @type {{ active?: unknown, endsAt?: unknown, allowPatterns?: unknown }} */ (sanctuary);
        policy.sanctuaryActive = Boolean(saved.active);
        policy.sanctuaryEndsAt = Number(saved.endsAt) || 0;
        policy.allowPatterns = stringList(saved.allowPatterns);
    }

    const category = readJson(FOCUS_POLICY_STORAGE.category);
    if (category && typeof category === 'object') {
        const saved = /** @type {{ enabled?: unknown, domains?: unknown, allowPatterns?: unknown }} */ (category);
        policy.categoryEnabled = Boolean(saved.enabled);
        policy.categoryDomains = new Set(stringList(saved.domains));
        policy.categoryAllowPatterns = stringList(saved.allowPatterns);
    }
}

/**
 * @param {Iterable<string>} domains
 */
export function setBlockedDomains(domains) {
    policy.blockedDomains = new Set(domains);
    persistBlockedDomains();
}

/**
 * @param {boolean} active
 * @param {string[]} [patterns]
 * @param {number} [endsAt] Sanctuary session end time. When > 0, the listener
 *   treats sanctuary as off after that timestamp even if the expiry alarm is late.
 */
export function setSanctuaryPolicy(active, patterns = [], endsAt = 0) {
    policy.sanctuaryActive = Boolean(active);
    policy.sanctuaryEndsAt = policy.sanctuaryActive ? Number(endsAt) || 0 : 0;
    policy.allowPatterns =
        policy.sanctuaryActive && Array.isArray(patterns) ? patterns.filter((pattern) => typeof pattern === 'string' && pattern) : [];
    persistSanctuary();
}

/**
 * @param {boolean} enabled
 * @param {Iterable<string>} [domains]
 * @param {string[]} [allowPatterns]
 */
export function setCategoryPolicy(enabled, domains = [], allowPatterns = []) {
    policy.categoryEnabled = Boolean(enabled);
    policy.categoryDomains = new Set(policy.categoryEnabled ? domains : []);
    policy.categoryAllowPatterns =
        policy.categoryEnabled && Array.isArray(allowPatterns)
            ? allowPatterns.filter((pattern) => typeof pattern === 'string' && pattern)
            : [];
    persistCategory();
}

export function resetFocusBlockPolicy() {
    policy.blockedDomains = new Set();
    policy.sanctuaryActive = false;
    policy.sanctuaryEndsAt = 0;
    policy.allowPatterns = [];
    policy.categoryEnabled = false;
    policy.categoryDomains = new Set();
    policy.categoryAllowPatterns = [];
    const store = localStore();
    if (!store) {
        return;
    }
    for (const key of Object.values(FOCUS_POLICY_STORAGE)) {
        try {
            store.removeItem(key);
        } catch (e) {}
    }
}

/**
 * Sanctuary stays on until cleared, or until endsAt when that timestamp is set.
 * Tests that omit endsAt keep the flag-only behavior.
 *
 * @param {number} [now]
 * @returns {boolean}
 */
function isPolicySanctuaryActive(now = Date.now()) {
    if (!policy.sanctuaryActive) {
        return false;
    }
    if (policy.sanctuaryEndsAt > 0) {
        return isSanctuarySessionActive(policy.sanctuaryEndsAt, now);
    }
    return true;
}

/**
 * Decide what the blocking listener should do with one request.
 * Sanctuary is checked first. Site-group blocks come next. The adult/gambling
 * list then redirects a listed host that is not an allowed site, and cancels
 * its other requests. A blocked domain matches the host and every subdomain,
 * same as declarativeNetRequest requestDomains.
 *
 * @param {{ url?: string, type?: string }} request
 * @returns {{ action: 'redirect' } | { action: 'cancel' } | null}
 */
export function decideFocusBlock(request) {
    const hostname = hostnameFromUrl(request?.url);
    const isMainFrame = request?.type === MAIN_FRAME_RESOURCE_TYPE;

    if (isPolicySanctuaryActive()) {
        const allowed = Boolean(hostname && isHostnameAllowed(hostname, policy.allowPatterns));
        if (allowed) {
            return null;
        }
        if (isMainFrame && hostname) {
            return { action: 'redirect' };
        }
    }

    if (hostname && hostnameMatchesCategoryList(hostname, policy.blockedDomains)) {
        return isMainFrame ? { action: 'redirect' } : { action: 'cancel' };
    }

    if (
        policy.categoryEnabled &&
        hostname &&
        hostnameMatchesCategoryList(hostname, policy.categoryDomains) &&
        !isHostnameAllowed(hostname, policy.categoryAllowPatterns)
    ) {
        return isMainFrame ? { action: 'redirect' } : { action: 'cancel' };
    }

    return null;
}

/**
 * @param {{ url?: string, type?: string }} request
 * @returns {browser.WebRequest.BlockingResponse | undefined}
 */
function blockingResponse(request) {
    const decision = decideFocusBlock(request);
    if (!decision) {
        return undefined;
    }
    if (decision.action === 'cancel') {
        return { cancel: true };
    }
    return { redirectUrl: getExtensionURL(BLOCKED_PAGE_PATH) };
}

/**
 * Register the blocking listener once, during background startup, before any await.
 */
export function installFocusBlockListener() {
    // Chrome keeps blocking in declarativeNetRequest. A second listener here
    // would cancel or redirect those same requests.
    if (getManifestVersion() !== 2 || listenerInstalled) {
        return;
    }
    restoreCachedFocusPolicy();
    listenerInstalled = true;
    browser.webRequest.onBeforeRequest.addListener(blockingResponse, { urls: ['<all_urls>'] }, ['blocking']);
}
