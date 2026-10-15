import browser from 'webextension-polyfill';
import { registerMessageHandler } from '../message-registry';
import { executeScript, getManifestVersion, insertCSS, removeCSS } from '../wrapper';
import {
    YOUTUBE_CSS_REGISTRATION_ID,
    YOUTUBE_MATCHES,
    YOUTUBE_SANITIZE_LISTENER,
    YOUTUBE_SANITIZE_SHEETS,
} from '../../shared-utils/youtube-sanitize-css';

const YOUTUBE_CLASS_CACHE = 'openfocusd.youtubeClasses';

// Earlier builds injected these rules without the html class gate. Remove them
// from open tabs so turning a toggle off can show the section again.
const LEGACY_CSS = [
    [
        'ytd-comments,',
        '#comments,',
        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"] {',
        'display: none !important;',
        '}',
    ].join(''),
    [
        'ytd-comments,#comments,ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"] > * {',
        'display: none !important;',
        '}',
        'ytd-comments,#comments,ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]::before {',
        'content: "Comments are hidden by OpenFocusd";',
        'display: block !important;',
        'padding: 12px 0 16px !important;',
        'font: 14px/1.4 Roboto, Arial, sans-serif !important;',
        'color: var(--yt-spec-text-secondary, #606060) !important;',
        '}',
    ].join(''),
];

const ALL_CLASSES = YOUTUBE_SANITIZE_SHEETS.map((sheet) => sheet.className);

/**
 * @param {string[]} enabled
 * @param {string[]} all
 */
function applyYoutubeClasses(enabled, all) {
    const root = document.documentElement;
    if (!root) {
        return;
    }
    const set = new Set(enabled);
    for (const name of all) {
        root.classList.toggle(name, set.has(name));
    }
}

/**
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
 * @returns {string[]}
 */
function readCachedClasses() {
    const store = localStore();
    if (!store) {
        return [];
    }
    try {
        const parsed = JSON.parse(store.getItem(YOUTUBE_CLASS_CACHE) || '[]');
        return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string' && ALL_CLASSES.includes(name)) : [];
    } catch (e) {
        return [];
    }
}

/**
 * @param {string[]} classNames
 */
function writeCachedClasses(classNames) {
    const store = localStore();
    if (!store) {
        return;
    }
    try {
        store.setItem(YOUTUBE_CLASS_CACHE, JSON.stringify(classNames));
    } catch (e) {}
}

/**
 * @returns {undefined | { register: (options: object) => Promise<{ unregister: () => void }> }}
 */
function firefoxContentScripts() {
    if (getManifestVersion() !== 2) {
        return undefined;
    }
    return /** @type {any} */ (browser).contentScripts;
}

export default class SanitizeYoutube {
    /**
     * @param {{ settings: import('../settings.js') }} options
     */
    constructor({ settings }) {
        this.featureName = 'SanitizeYoutube';
        this.settings = settings;
        /** @type {{ unregister: () => void }[]} */
        this._firefoxRegs = [];
        this._chain = Promise.resolve();

        registerMessageHandler('getYoutubeSanitizeClasses', () => this.handleGetClasses());

        this.queue(() => this.start());
        for (const sheet of YOUTUBE_SANITIZE_SHEETS) {
            this.settings.onSettingUpdate.addEventListener(sheet.setting, () => {
                this.queue(() => this.applySettings());
            });
        }
    }

    /**
     * @param {() => Promise<void>} task
     */
    queue(task) {
        this._chain = this._chain.then(task).catch((error) => {
            console.error('Sanitize YouTube failed', error);
        });
        return this._chain;
    }

    async start() {
        await this.registerStatic();
        // Register from the last session before settings finish loading so the
        // next YouTube document gets its class at document_start.
        await this.registerClassScripts(readCachedClasses());
        await this.settings.ready();
        await this.applySettings();
    }

    /**
     * @returns {string[]}
     */
    enabledClasses() {
        return YOUTUBE_SANITIZE_SHEETS.filter((sheet) => this.settings.getSetting(sheet.setting) === true).map((sheet) => sheet.className);
    }

    async handleGetClasses() {
        await this.settings.ready();
        const classes = this.enabledClasses();
        writeCachedClasses(classes);
        return { classes };
    }

    async applySettings() {
        await this.settings.ready();
        const classes = this.enabledClasses();
        writeCachedClasses(classes);
        await this.registerClassScripts(classes);
        await this.syncOpenTabs(classes);
    }

    async registerStatic() {
        if (getManifestVersion() !== 3 || !browser.scripting?.registerContentScripts) {
            return;
        }
        try {
            await browser.scripting.unregisterContentScripts({ ids: [YOUTUBE_CSS_REGISTRATION_ID] });
        } catch (e) {}
        await browser.scripting.registerContentScripts([
            {
                id: YOUTUBE_CSS_REGISTRATION_ID,
                matches: YOUTUBE_MATCHES,
                runAt: 'document_start',
                css: YOUTUBE_SANITIZE_SHEETS.map((sheet) => sheet.extensionCss),
                js: [YOUTUBE_SANITIZE_LISTENER],
            },
        ]);
    }

    /**
     * @param {string[]} classNames
     */
    async registerClassScripts(classNames) {
        const wanted = new Set(classNames);
        const contentScripts = firefoxContentScripts();
        if (contentScripts?.register) {
            await Promise.all(this._firefoxRegs.splice(0).map((reg) => Promise.resolve(reg.unregister()).catch(() => {})));
            for (const sheet of YOUTUBE_SANITIZE_SHEETS) {
                if (!wanted.has(sheet.className)) {
                    continue;
                }
                const reg = await contentScripts.register({
                    matches: YOUTUBE_MATCHES,
                    runAt: 'document_start',
                    js: [{ file: sheet.script }],
                });
                this._firefoxRegs.push(reg);
            }
            return;
        }

        if (getManifestVersion() !== 3 || !browser.scripting?.registerContentScripts) {
            return;
        }
        const ids = YOUTUBE_SANITIZE_SHEETS.map((sheet) => sheet.id);
        try {
            await browser.scripting.unregisterContentScripts({ ids });
        } catch (e) {}
        /** @type {import('webextension-polyfill').Scripting.RegisteredContentScript[]} */
        const scripts = YOUTUBE_SANITIZE_SHEETS.filter((sheet) => wanted.has(sheet.className)).map((sheet) => ({
            id: sheet.id,
            matches: YOUTUBE_MATCHES,
            runAt: 'document_start',
            js: [sheet.script],
        }));
        if (scripts.length) {
            await browser.scripting.registerContentScripts(scripts);
        }
    }

    /**
     * @param {string[]} classes
     */
    async syncOpenTabs(classes) {
        let tabs = [];
        try {
            tabs = await browser.tabs.query({ url: YOUTUBE_MATCHES });
        } catch (e) {
            return;
        }
        await Promise.all(tabs.map((tab) => (tab.id == null ? Promise.resolve() : this.applyTab(tab.id, classes))));
    }

    /**
     * Already-open tabs missed document_start. Inject the class-gated CSS and
     * set the classes now. Later navigations get both from the registered scripts.
     *
     * @param {number} tabId
     * @param {string[]} classes
     */
    async applyTab(tabId, classes) {
        await Promise.all(
            LEGACY_CSS.map(async (css) => {
                try {
                    await removeCSS({ target: { tabId }, css });
                } catch (e) {}
            }),
        );
        for (const sheet of YOUTUBE_SANITIZE_SHEETS) {
            try {
                await insertCSS({ target: { tabId }, files: [sheet.extensionCss] });
            } catch (e) {}
        }
        try {
            await executeScript({
                target: { tabId },
                func: applyYoutubeClasses,
                args: [classes, ALL_CLASSES],
            });
        } catch (e) {}
    }
}
