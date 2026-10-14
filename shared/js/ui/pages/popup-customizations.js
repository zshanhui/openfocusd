import { formatRemaining } from '../../shared-utils/site-groups';
import { formatSanctuaryDuration } from '../../shared-utils/sanctuary';
import { SEARCH_ENGINE_DDG, normalizeSearchEngine, searchPlaceholder } from '../../shared-utils/search-engine';

const app = document.getElementById('app');
const CHROME_CLASS = 'openfocusd-popup-chrome';
const TABS_CLASS = 'openfocusd-popup-tabs';
const OPTIONS_BAR_CLASS = 'openfocusd-popup-options';
const STATUS_CLASS = 'openfocusd-group-status';
const SANCTUARY_CLASS = 'openfocusd-sanctuary';
const TAB_BLOCKER = 'blocker';
const TAB_TRACKERS = 'trackers';
const TAB_BLOCKER_CLASS = 'openfocusd-tab-blocker';
const TAB_TRACKERS_CLASS = 'openfocusd-tab-trackers';
const SEARCH_ENGINE_ATTR = 'data-openfocusd-search-engine';

let activeTab = TAB_BLOCKER;
let searchEngine = SEARCH_ENGINE_DDG;
let searchEngineRequest = null;

function getTabId() {
    const value = Number(new URLSearchParams(location.search).get('tabId'));
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

// Firefox's chrome.runtime.sendMessage does not return a Promise unless a
// callback is passed. Chrome accepts the same callback form.
function sendExtensionMessage(message) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) {
                reject(new Error(runtimeError.message));
                return;
            }
            resolve(response);
        });
    });
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text != null) {
        node.textContent = text;
    }
    return node;
}

function displayedRemaining(status) {
    if (!status || status.ungrouped || status.remainingSeconds <= 0) {
        return 0;
    }
    return Math.max(0, status.remainingSeconds - (Date.now() - status.serverNow) / 1000);
}

function createTabButton(id, label) {
    const button = el('button', 'openfocusd-popup-tab', label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('data-openfocusd-tab', id);
    return button;
}

function applyActiveTab(page) {
    page.classList.toggle(TAB_BLOCKER_CLASS, activeTab === TAB_BLOCKER);
    page.classList.toggle(TAB_TRACKERS_CLASS, activeTab === TAB_TRACKERS);
    page.querySelectorAll('[data-openfocusd-tab]').forEach((button) => {
        const selected = button.getAttribute('data-openfocusd-tab') === activeTab;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
}

function applySearchEngine(page, search) {
    page.setAttribute(SEARCH_ENGINE_ATTR, searchEngine);
    const input = search.querySelector('.search-form__input');
    if (input) {
        input.setAttribute('placeholder', searchPlaceholder(searchEngine));
    }
}

function refreshSearchEngine(page, search) {
    applySearchEngine(page, search);
    if (!searchEngineRequest) {
        searchEngineRequest = sendExtensionMessage({
            messageType: 'getSetting',
            options: { name: 'searchEngine' },
        })
            .then((value) => {
                searchEngine = normalizeSearchEngine(value);
            })
            .catch(() => {
                searchEngine = SEARCH_ENGINE_DDG;
            });
    }

    return searchEngineRequest.then(() => applySearchEngine(page, search));
}

function ensureChrome(page) {
    let chromeBar = page.querySelector(`:scope > .${CHROME_CLASS}`);
    if (!chromeBar) {
        chromeBar = el('div', CHROME_CLASS);

        const tabs = el('nav', TABS_CLASS);
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Popup sections');
        tabs.append(createTabButton(TAB_BLOCKER, 'Website Blocker'), createTabButton(TAB_TRACKERS, 'Tracker Blocker'));
        tabs.addEventListener('click', (event) => {
            const button = event.target.closest('[data-openfocusd-tab]');
            if (!button) {
                return;
            }
            activeTab = button.getAttribute('data-openfocusd-tab') || TAB_BLOCKER;
            applyActiveTab(page);
        });

        const optionsBar = el('div', OPTIONS_BAR_CLASS);
        chromeBar.append(tabs, optionsBar);
        page.prepend(chromeBar);
    } else if (chromeBar !== page.firstElementChild) {
        page.prepend(chromeBar);
    }

    applyActiveTab(page);
    return chromeBar;
}

function ensureStatusCard(page, afterNode) {
    let card = page.querySelector(`:scope > .${STATUS_CLASS}`);
    if (!card) {
        card = document.createElement('section');
        card.className = STATUS_CLASS;
        afterNode.after(card);
    } else if (card.previousElementSibling !== afterNode) {
        afterNode.after(card);
    }
    return card;
}

function renderStatus(card, status) {
    card.replaceChildren();

    const current = el('div', 'openfocusd-group-status__current');
    current.append(el('div', 'openfocusd-group-status__label', 'You are currently on'));
    current.append(el('div', 'openfocusd-group-status__host', status?.hostname || 'this page'));
    card.append(current);

    const box = el('div', 'openfocusd-group-status__box');

    if (!status || status.ungrouped) {
        box.classList.add('is-empty');
        box.append(el('div', 'openfocusd-group-status__group-label', 'Group'));
        box.append(el('div', 'openfocusd-group-status__group-name', 'Not in a group'));
        card.append(box);
        return;
    }

    if (status.isBlocked || displayedRemaining(status) <= 0) {
        box.classList.add('is-blocked');
    }

    const row = el('div', 'openfocusd-group-status__row');
    const details = el('div', 'openfocusd-group-status__details');
    details.append(el('div', 'openfocusd-group-status__group-label', 'Group'));
    details.append(el('div', 'openfocusd-group-status__group-name', status.groupName));
    details.append(el('div', 'openfocusd-group-status__allowance', status.allowanceLabel));

    const remaining = el('div', 'openfocusd-group-status__time');
    remaining.append(el('div', 'openfocusd-group-status__remaining-label', 'Time remaining'));
    remaining.append(el('div', 'openfocusd-group-status__remaining', formatRemaining(displayedRemaining(status))));

    row.append(details);
    row.append(remaining);
    box.append(row);
    card.append(box);
}

function tickRemaining(card) {
    const status = card._status;
    if (!status || status.ungrouped) {
        return;
    }

    const remaining = displayedRemaining(status);
    const node = card.querySelector('.openfocusd-group-status__remaining');
    if (node) {
        node.textContent = formatRemaining(remaining);
    }

    const box = card.querySelector('.openfocusd-group-status__box');
    if (box && remaining <= 0) {
        box.classList.add('is-blocked');
    }

    if (remaining <= 0 && !status.isBlocked) {
        refreshStatus(card);
    }
}

async function refreshStatus(card) {
    try {
        const status = await sendExtensionMessage({
            messageType: 'getPopupGroupStatus',
            options: { tabId: getTabId() },
        });
        card._status = status;
        renderStatus(card, status);
    } catch (error) {
        console.warn('Failed to load group status', error);
        if (!card._status) {
            renderStatus(card, null);
        }
    }
}

function displayedSanctuaryRemaining(state) {
    if (!state?.active || state.remainingSeconds <= 0) {
        return 0;
    }
    return Math.max(0, state.remainingSeconds - (Date.now() - state.serverNow) / 1000);
}

function ensureSanctuaryCard(page) {
    let card = page.querySelector(`:scope > .${SANCTUARY_CLASS}`);
    if (!card) {
        card = document.createElement('section');
        card.className = SANCTUARY_CLASS;
        card.hidden = true;
        page.append(card);
        card.addEventListener('click', (event) => onSanctuaryClick(card, event));
    } else if (page.lastElementChild !== card) {
        page.append(card);
    }
    return card;
}

function cannotActivateLabel(state) {
    if (state?.cannotActivateReason === 'empty') {
        return 'Add at least one Allowed Site first.';
    }
    if (state?.cannotActivateReason === 'duration') {
        return 'Set a duration of at least 1 minute.';
    }
    return '';
}

function renderSanctuary(card, state) {
    card.replaceChildren();
    if (!state?.showOnPopup && !state?.active) {
        card.hidden = true;
        return;
    }
    card.hidden = false;

    const box = el('div', 'openfocusd-sanctuary__box');
    const row = el('div', 'openfocusd-sanctuary__row');
    box.append(el('div', 'openfocusd-sanctuary__label', 'Sanctuary Mode'));
    if (state.active) {
        box.classList.add('is-active');
        row.append(el('div', 'openfocusd-sanctuary__time', formatRemaining(displayedSanctuaryRemaining(state))));
        box.append(row);
        box.append(el('div', 'openfocusd-sanctuary__note', 'Cannot be turned off until the timer ends.'));
        card.append(box);
        return;
    }

    row.append(el('div', 'openfocusd-sanctuary__time', state.durationLabel || formatSanctuaryDuration(state.durationSeconds)));
    const button = el('button', 'openfocusd-sanctuary__activate', 'Activate');
    button.type = 'button';
    button.disabled = !state.canActivate;
    row.append(button);
    box.append(row);
    const reason = cannotActivateLabel(state);
    if (reason) {
        box.append(el('div', 'openfocusd-sanctuary__note', reason));
    }
    card.append(box);
}

function showSanctuaryDialog(card, state) {
    const existing = card.querySelector('.openfocusd-sanctuary__dialog');
    existing?.remove();
    const dialog = el('div', 'openfocusd-sanctuary__dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const panel = el('div', 'openfocusd-sanctuary__dialog-panel');
    const duration = state.durationLabel || formatSanctuaryDuration(state.durationSeconds);
    panel.append(
        el(
            'p',
            'openfocusd-sanctuary__dialog-text',
            `Block every website except your Allowed Sites for ${duration}? You cannot turn this off until the time is up.`,
        ),
    );
    const actions = el('div', 'openfocusd-sanctuary__dialog-actions');
    const cancel = el('button', 'openfocusd-sanctuary__dialog-cancel', 'Cancel');
    cancel.type = 'button';
    const confirm = el('button', 'openfocusd-sanctuary__dialog-confirm', 'Activate');
    confirm.type = 'button';
    actions.append(cancel, confirm);
    panel.append(actions);
    dialog.append(panel);
    card.append(dialog);
}

async function activateSanctuary(card) {
    try {
        const state = await sendExtensionMessage({ messageType: 'activateSanctuary' });
        card._sanctuary = state;
        renderSanctuary(card, state);
    } catch (error) {
        console.warn('Failed to activate Sanctuary Mode', error);
    }
}

function onSanctuaryClick(card, event) {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }
    if (target.closest('.openfocusd-sanctuary__dialog') === target) {
        card.querySelector('.openfocusd-sanctuary__dialog')?.remove();
        return;
    }
    if (target.closest('.openfocusd-sanctuary__dialog-cancel')) {
        card.querySelector('.openfocusd-sanctuary__dialog')?.remove();
        return;
    }
    if (target.closest('.openfocusd-sanctuary__dialog-confirm')) {
        card.querySelector('.openfocusd-sanctuary__dialog')?.remove();
        activateSanctuary(card);
        return;
    }
    if (target.closest('.openfocusd-sanctuary__activate')) {
        const button = target.closest('.openfocusd-sanctuary__activate');
        if (button instanceof HTMLButtonElement && button.disabled) {
            return;
        }
        showSanctuaryDialog(card, card._sanctuary || {});
    }
}

function tickSanctuary(card) {
    const state = card._sanctuary;
    if (!state?.active) {
        return;
    }
    const remaining = displayedSanctuaryRemaining(state);
    const node = card.querySelector('.openfocusd-sanctuary__time');
    if (node) {
        node.textContent = formatRemaining(remaining);
    }
    if (remaining <= 0) {
        refreshSanctuary(card);
    }
}

async function refreshSanctuary(card) {
    try {
        const state = await sendExtensionMessage({ messageType: 'getSanctuaryState' });
        card._sanctuary = state;
        if (card.querySelector('.openfocusd-sanctuary__dialog') && !state?.active) {
            return;
        }
        renderSanctuary(card, state);
    } catch {
        card.hidden = true;
    }
}

function customizePopupLayout() {
    const page = app?.querySelector('.site-info > .page-inner');
    const search = page?.querySelector(':scope > .search');

    if (!page || !search) {
        return;
    }

    const chromeBar = ensureChrome(page);
    if (search.previousElementSibling !== chromeBar) {
        chromeBar.after(search);
    }
    const statusCard = ensureStatusCard(page, search);
    const sanctuaryCard = ensureSanctuaryCard(page);
    const optionsBar = chromeBar.querySelector(`.${OPTIONS_BAR_CLASS}`);

    const cogButton = search.querySelector(':scope > .cog-button');
    if (cogButton && optionsBar && cogButton.parentElement !== optionsBar) {
        optionsBar.append(cogButton);
    }

    page.querySelectorAll('.link-action--rounded').forEach((link) => {
        const wrapper = link.closest('.text--center');
        (wrapper || link).remove();
    });

    refreshSearchEngine(page, search);

    if (!statusCard._refreshing) {
        statusCard._refreshing = true;
        refreshStatus(statusCard);
        window.setInterval(() => tickRemaining(statusCard), 250);
        window.setInterval(() => refreshStatus(statusCard), 1000);
    }

    if (!sanctuaryCard._refreshing) {
        sanctuaryCard._refreshing = true;
        refreshSanctuary(sanctuaryCard);
        window.setInterval(() => tickSanctuary(sanctuaryCard), 250);
        window.setInterval(() => refreshSanctuary(sanctuaryCard), 1000);
    }
}

if (app) {
    new MutationObserver(customizePopupLayout).observe(app, {
        childList: true,
        subtree: true,
    });
    customizePopupLayout();
}
