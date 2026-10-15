import { generateDNRRule, resourceTypes } from '@duckduckgo/ddg2dnr/lib/utils';
import { CATEGORY_BLOCKLIST_ALLOW_PRIORITY, USER_BLOCKED_SITES_PRIORITY } from '@duckduckgo/ddg2dnr/lib/rulePriorities';
import { dnrRegexForAllowedPattern, isHostnameAllowed, requestDomainForAllowedPattern } from '../shared-utils/allowed-sites';
import {
    ADULT_GAMBLING_RULESET_ID,
    BLOCKED_SITE_PAGE_PATH,
    BLOCK_ADULT_GAMBLING_SETTING,
    hostnameMatchesCategoryList,
} from '../shared-utils/category-dnr-ruleset';
import { hostnameFromUrl } from '../shared-utils/site-groups';
import { getAllowedSites } from './allowed-sites-store';
import {
    CATEGORY_ALLOW_RULE_ID_END,
    CATEGORY_ALLOW_RULE_ID_START,
    CATEGORY_REDIRECT_RULE_ID_END,
    CATEGORY_REDIRECT_RULE_ID_START,
} from './dnr-utils';
import settings from './settings';
import { getExtensionURL, getManifestVersion } from './wrapper';
import { setCategoryPolicy } from './focus-block-policy';

const CATEGORY_RULES_PATH = 'data/bundled/adult-gambling-rules.json';
const MAIN_FRAME_RESOURCE_TYPE = 'main_frame';

/** @type {Set<string> | null} */
let categoryDomainSet = null;

function supportsCategoryDnr() {
    return getManifestVersion() === 3 && typeof chrome?.declarativeNetRequest?.updateEnabledRulesets === 'function';
}

function categoryDynamicRuleIds() {
    const ids = [];
    for (let id = CATEGORY_ALLOW_RULE_ID_START; id <= CATEGORY_ALLOW_RULE_ID_END; id++) {
        ids.push(id);
    }
    for (let id = CATEGORY_REDIRECT_RULE_ID_START; id <= CATEGORY_REDIRECT_RULE_ID_END; id++) {
        ids.push(id);
    }
    return ids;
}

/**
 * @returns {boolean}
 */
export function isAdultGamblingBlockEnabled() {
    return Boolean(settings.getSetting(BLOCK_ADULT_GAMBLING_SETTING));
}

/**
 * Enable or disable the static adult/gambling ruleset to match the setting.
 *
 * @returns {Promise<boolean>}
 */
export async function refreshAdultGamblingRuleset() {
    await settings.ready();
    const enabled = isAdultGamblingBlockEnabled();
    // Manifest V2 has no static rulesets. refreshCategoryAllowRules updates the
    // webRequest policy instead.
    if (!supportsCategoryDnr()) {
        return enabled;
    }

    try {
        await chrome.declarativeNetRequest.updateEnabledRulesets({
            enableRulesetIds: enabled ? [ADULT_GAMBLING_RULESET_ID] : [],
            disableRulesetIds: enabled ? [] : [ADULT_GAMBLING_RULESET_ID],
        });
    } catch (error) {
        console.error('Failed to toggle adult/gambling DNR ruleset', error);
    }
    return enabled;
}

/**
 * @param {string} regexFilter
 * @returns {Promise<boolean>}
 */
async function regexSupported(regexFilter) {
    try {
        const result = await chrome.declarativeNetRequest.isRegexSupported({ regex: regexFilter });
        return Boolean(result?.isSupported);
    } catch {
        return false;
    }
}

/**
 * Static DNR redirects to extension pages can fail the same way Always Block
 * did. Keep a domain set plus dynamic main_frame redirects as the reliable path
 * to /html/blocked.html.
 *
 * @returns {Promise<object[]>}
 */
async function loadBundledCategoryRules() {
    try {
        const response = await fetch(getExtensionURL(CATEGORY_RULES_PATH));
        if (!response.ok) {
            return [];
        }
        const rules = await response.json();
        return Array.isArray(rules) ? rules : [];
    } catch (error) {
        console.error('Failed to load adult/gambling DNR rules', error);
        return [];
    }
}

/**
 * @param {object[]} rules
 * @returns {Set<string>}
 */
function domainSetFromRules(rules) {
    const domains = new Set();
    for (const rule of rules) {
        for (const domain of rule?.condition?.requestDomains || []) {
            if (typeof domain === 'string' && domain) {
                domains.add(domain);
            }
        }
    }
    return domains;
}

async function ensureCategoryDomainSet() {
    if (!isAdultGamblingBlockEnabled()) {
        categoryDomainSet = null;
        return new Set();
    }
    if (categoryDomainSet) {
        return categoryDomainSet;
    }
    categoryDomainSet = domainSetFromRules(await loadBundledCategoryRules());
    return categoryDomainSet;
}

/**
 * @param {string} [url]
 * @returns {Promise<boolean>}
 */
export async function shouldRedirectCategoryNavigation(url) {
    await settings.ready();
    if (!isAdultGamblingBlockEnabled() || !url) {
        return false;
    }
    const hostname = hostnameFromUrl(url);
    if (!hostname || isHostnameAllowed(hostname, getAllowedSites())) {
        return false;
    }
    return hostnameMatchesCategoryList(hostname, await ensureCategoryDomainSet());
}

/**
 * Allowed Sites exceptions and main_frame redirects for the category list.
 *
 * @param {string[]} [patterns]
 * @returns {Promise<chrome.declarativeNetRequest.Rule[]>}
 */
export async function refreshCategoryAllowRules(patterns) {
    if (getManifestVersion() === 2) {
        await settings.ready();
        const enabled = isAdultGamblingBlockEnabled();
        const allowPatterns = patterns ?? getAllowedSites();
        if (!enabled) {
            categoryDomainSet = null;
            setCategoryPolicy(false);
            return [];
        }
        const bundledRules = await loadBundledCategoryRules();
        categoryDomainSet = domainSetFromRules(bundledRules);
        setCategoryPolicy(true, categoryDomainSet, allowPatterns);
        return [];
    }

    if (!supportsCategoryDnr()) {
        return [];
    }

    await settings.ready();
    const enabled = isAdultGamblingBlockEnabled();
    /** @type {chrome.declarativeNetRequest.Rule[]} */
    const addRules = [];

    if (enabled) {
        const bundledRules = await loadBundledCategoryRules();
        categoryDomainSet = domainSetFromRules(bundledRules);
        addRules.push(...buildCategoryRedirectRules(bundledRules));
        addRules.push(...(await buildCategoryAllowRules(patterns ?? getAllowedSites())));
    } else {
        categoryDomainSet = null;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: categoryDynamicRuleIds(),
        addRules,
    });

    return addRules;
}

/**
 * Sync the static ruleset and Allowed Sites exceptions with current settings.
 *
 * @returns {Promise<boolean>}
 */
export async function refreshAdultGamblingEnforcement() {
    const enabled = await refreshAdultGamblingRuleset();
    await refreshCategoryAllowRules();
    return enabled;
}

/**
 * @param {boolean} enabled
 * @returns {Promise<boolean>}
 */
export async function setAdultGamblingBlockEnabled(enabled) {
    await settings.ready();
    settings.updateSetting(BLOCK_ADULT_GAMBLING_SETTING, Boolean(enabled));
    return refreshAdultGamblingEnforcement();
}

/**
 * @param {object[]} bundledRules
 * @returns {chrome.declarativeNetRequest.Rule[]}
 */
function buildCategoryRedirectRules(bundledRules) {
    const rules = [];
    let nextId = CATEGORY_REDIRECT_RULE_ID_START;

    for (const rule of bundledRules) {
        if (rule?.action?.type !== 'redirect' || nextId > CATEGORY_REDIRECT_RULE_ID_END) {
            continue;
        }
        const requestDomains = rule.condition?.requestDomains;
        if (!Array.isArray(requestDomains) || requestDomains.length === 0) {
            continue;
        }
        rules.push(
            generateDNRRule({
                id: nextId,
                priority: USER_BLOCKED_SITES_PRIORITY,
                actionType: 'redirect',
                redirect: {
                    extensionPath: rule.action.redirect?.extensionPath || BLOCKED_SITE_PAGE_PATH,
                },
                requestDomains,
                resourceTypes: [MAIN_FRAME_RESOURCE_TYPE],
            }),
        );
        nextId += 1;
    }

    return rules;
}

/**
 * @param {string[]} patterns
 * @returns {Promise<chrome.declarativeNetRequest.Rule[]>}
 */
async function buildCategoryAllowRules(patterns) {
    /** @type {string[]} */
    const requestDomains = [];
    /** @type {string[]} */
    const regexFilters = [];

    for (const pattern of patterns) {
        const domain = requestDomainForAllowedPattern(pattern);
        if (domain) {
            requestDomains.push(domain);
            continue;
        }
        const regexFilter = dnrRegexForAllowedPattern(pattern);
        if (regexFilter) {
            regexFilters.push(regexFilter);
        }
    }

    /** @type {chrome.declarativeNetRequest.Rule[]} */
    const rules = [];
    let nextId = CATEGORY_ALLOW_RULE_ID_START;

    if (requestDomains.length && nextId <= CATEGORY_ALLOW_RULE_ID_END) {
        rules.push(
            generateDNRRule({
                id: nextId,
                priority: CATEGORY_BLOCKLIST_ALLOW_PRIORITY,
                actionType: 'allow',
                requestDomains: Array.from(new Set(requestDomains)).sort(),
                resourceTypes,
            }),
        );
        nextId += 1;
    }

    for (const regexFilter of regexFilters) {
        if (nextId > CATEGORY_ALLOW_RULE_ID_END) {
            break;
        }
        if (!(await regexSupported(regexFilter))) {
            continue;
        }
        rules.push(
            generateDNRRule({
                id: nextId,
                priority: CATEGORY_BLOCKLIST_ALLOW_PRIORITY,
                actionType: 'allow',
                regexFilter,
                resourceTypes,
            }),
        );
        nextId += 1;
    }

    return rules;
}
