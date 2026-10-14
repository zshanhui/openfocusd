import { generateDNRRule } from '@duckduckgo/ddg2dnr/lib/utils';
import { SANCTUARY_ALLOW_PRIORITY, SANCTUARY_BLOCK_PRIORITY } from '@duckduckgo/ddg2dnr/lib/rulePriorities';
import { dnrRegexForAllowedPattern, requestDomainForAllowedPattern } from '../shared-utils/allowed-sites';
import {
    SANCTUARY_ALLOW_RULE_ID_END,
    SANCTUARY_ALLOW_RULE_ID_START,
    SANCTUARY_BLOCK_MAIN_RULE_ID,
    SANCTUARY_BLOCK_SUBRESOURCE_RULE_ID,
} from './dnr-utils';
import { getManifestVersion } from './wrapper';
import { setSanctuaryPolicy } from './focus-block-policy';
import { getSanctuarySettings } from './sanctuary-store';

const BLOCKED_SITE_PAGE_PATH = '/html/blocked.html';
const MAIN_FRAME_RESOURCE_TYPE = 'main_frame';
const CATCH_ALL_REGEX = '^https?://';

function sanctuaryRuleIds() {
    const ids = [SANCTUARY_BLOCK_MAIN_RULE_ID, SANCTUARY_BLOCK_SUBRESOURCE_RULE_ID];
    for (let id = SANCTUARY_ALLOW_RULE_ID_START; id <= SANCTUARY_ALLOW_RULE_ID_END; id++) {
        ids.push(id);
    }
    return ids;
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
 * @param {string[]} patterns
 * @returns {Promise<chrome.declarativeNetRequest.Rule[]>}
 */
async function buildAllowRules(patterns) {
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
    let nextId = SANCTUARY_ALLOW_RULE_ID_START;

    // Only exempt top-level navigations. Tracker blocking still applies unless
    // the user has turned it off for the site.
    if (requestDomains.length && nextId <= SANCTUARY_ALLOW_RULE_ID_END) {
        rules.push(
            generateDNRRule({
                id: nextId,
                priority: SANCTUARY_ALLOW_PRIORITY,
                actionType: 'allow',
                requestDomains: Array.from(new Set(requestDomains)).sort(),
                resourceTypes: [MAIN_FRAME_RESOURCE_TYPE],
            }),
        );
        nextId += 1;
    }

    for (const regexFilter of regexFilters) {
        if (nextId > SANCTUARY_ALLOW_RULE_ID_END) {
            break;
        }
        if (!(await regexSupported(regexFilter))) {
            continue;
        }
        rules.push(
            generateDNRRule({
                id: nextId,
                priority: SANCTUARY_ALLOW_PRIORITY,
                actionType: 'allow',
                regexFilter,
                resourceTypes: [MAIN_FRAME_RESOURCE_TYPE],
            }),
        );
        nextId += 1;
    }

    return rules;
}

/**
 * @param {string[]} patterns
 * @returns {Promise<string[]>}
 */
export async function refreshSanctuaryRules(patterns) {
    // Firefox enforces sanctuary in the webRequest listener. Keep Chrome on
    // declarativeNetRequest.
    if (getManifestVersion() === 2) {
        const { endsAt } = getSanctuarySettings();
        setSanctuaryPolicy(true, patterns, endsAt);
        return patterns;
    }

    const addRules = [];

    if (await regexSupported(CATCH_ALL_REGEX)) {
        addRules.push(
            generateDNRRule({
                id: SANCTUARY_BLOCK_MAIN_RULE_ID,
                priority: SANCTUARY_BLOCK_PRIORITY,
                actionType: 'redirect',
                redirect: {
                    extensionPath: BLOCKED_SITE_PAGE_PATH,
                },
                regexFilter: CATCH_ALL_REGEX,
                resourceTypes: [MAIN_FRAME_RESOURCE_TYPE],
            }),
        );
        addRules.push(...(await buildAllowRules(patterns)));
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: sanctuaryRuleIds(),
        addRules,
    });

    return patterns;
}

export async function clearSanctuaryRules() {
    if (getManifestVersion() === 2) {
        setSanctuaryPolicy(false);
        return;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: sanctuaryRuleIds(),
        addRules: [],
    });
}
