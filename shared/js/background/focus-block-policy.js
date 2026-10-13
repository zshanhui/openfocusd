import browser from 'webextension-polyfill';
import { isHostnameAllowed } from '../shared-utils/allowed-sites';
import { hostnameMatchesCategoryList } from '../shared-utils/category-dnr-ruleset';
import { hostnameFromUrl } from '../shared-utils/site-groups';
import { getExtensionURL, getManifestVersion } from './wrapper';

const BLOCKED_PAGE_PATH = '/html/blocked.html';
const MAIN_FRAME_RESOURCE_TYPE = 'main_frame';

/**
 * In-memory focus policy for the Manifest V2 webRequest listener.
 */
const policy = {
    blockedDomains: new Set(),
    sanctuaryActive: false,
    allowPatterns: [],
    categoryEnabled: false,
    categoryDomains: new Set(),
    categoryAllowPatterns: [],
};

let listenerInstalled = false;

/**
 * @param {Iterable<string>} domains
 */
export function setBlockedDomains(domains) {
    policy.blockedDomains = new Set(domains);
}

/**
 * @param {boolean} active
 * @param {string[]} [patterns]
 */
export function setSanctuaryPolicy(active, patterns = []) {
    policy.sanctuaryActive = Boolean(active);
    policy.allowPatterns =
        policy.sanctuaryActive && Array.isArray(patterns) ? patterns.filter((pattern) => typeof pattern === 'string' && pattern) : [];
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
}

export function resetFocusBlockPolicy() {
    policy.blockedDomains = new Set();
    policy.sanctuaryActive = false;
    policy.allowPatterns = [];
    policy.categoryEnabled = false;
    policy.categoryDomains = new Set();
    policy.categoryAllowPatterns = [];
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

    if (policy.sanctuaryActive) {
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
    listenerInstalled = true;
    browser.webRequest.onBeforeRequest.addListener(blockingResponse, { urls: ['<all_urls>'] }, ['blocking']);
}
