import browser from 'webextension-polyfill';
import settings from '../../shared/js/background/settings';
import { insertCSS, removeCSS } from '../../shared/js/background/wrapper';
import { refreshUserBlockedSitesRules } from '../../shared/js/background/dnr-user-blocklist';
import { setAdultGamblingBlockEnabled } from '../../shared/js/background/dnr-category-blocklist';
import { decideFocusBlock, resetFocusBlockPolicy } from '../../shared/js/background/focus-block-policy';
import { clearSanctuaryRules, refreshSanctuaryRules } from '../../shared/js/background/dnr-sanctuary';

describe('Manifest V2 focus rules', () => {
    let updateDynamicRules;

    beforeEach(() => {
        resetFocusBlockPolicy();
        spyOn(browser.runtime, 'getManifest').and.returnValue({
            version: '2026.10.15',
            manifest_version: 2,
        });
        updateDynamicRules = spyOn(chrome.declarativeNetRequest, 'updateDynamicRules').and.resolveTo();
    });

    it('returns normalized blocked domains without updating dynamic rules', async () => {
        const domains = await refreshUserBlockedSitesRules(['Example.INVALID', '/', 'sub.example.invalid']);
        expect(domains).toEqual(['example.invalid', 'sub.example.invalid']);
        expect(updateDynamicRules).not.toHaveBeenCalled();
        expect(decideFocusBlock({ url: 'https://sub.example.invalid/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://open.example/', type: 'main_frame' })).toBeNull();
    });

    it('stores sanctuary allow patterns without updating dynamic rules', async () => {
        await expectAsync(refreshSanctuaryRules(['khanacademy.org', '*.youtube.com'])).toBeResolvedTo(['khanacademy.org', '*.youtube.com']);
        expect(updateDynamicRules).not.toHaveBeenCalled();
        expect(decideFocusBlock({ url: 'https://www.youtube.com/watch', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://khanacademy.org/app.js', type: 'script' })).toBeNull();

        await clearSanctuaryRules();
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();
        expect(updateDynamicRules).not.toHaveBeenCalled();
    });

    it('loads the adult/gambling list without declarativeNetRequest', async () => {
        const stored = new Map([
            ['blockAdultGamblingSites', false],
            ['allowedSites', ['khanacademy.org']],
        ]);
        spyOn(settings, 'ready').and.resolveTo();
        spyOn(settings, 'getSetting').and.callFake((name) => stored.get(name));
        spyOn(settings, 'updateSetting').and.callFake((name, value) => {
            stored.set(name, value);
        });
        const updateEnabledRulesets = spyOn(chrome.declarativeNetRequest, 'updateEnabledRulesets').and.resolveTo();
        spyOn(globalThis, 'fetch').and.resolveTo({
            ok: true,
            json: async () => [
                {
                    condition: { requestDomains: ['pornhub.com'] },
                },
            ],
        });

        await expectAsync(setAdultGamblingBlockEnabled(true)).toBeResolvedTo(true);
        expect(updateDynamicRules).not.toHaveBeenCalled();
        expect(updateEnabledRulesets).not.toHaveBeenCalled();
        expect(decideFocusBlock({ url: 'https://www.pornhub.com/video', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://pornhub.com/a.js', type: 'script' })).toEqual({ action: 'cancel' });
        expect(decideFocusBlock({ url: 'https://khanacademy.org/math', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();

        await setAdultGamblingBlockEnabled(false);
        expect(decideFocusBlock({ url: 'https://pornhub.com/', type: 'main_frame' })).toBeNull();
        expect(updateDynamicRules).not.toHaveBeenCalled();
        expect(updateEnabledRulesets).not.toHaveBeenCalled();
    });
});

describe('Manifest V2 CSS injection', () => {
    function chromeCssSpy() {
        return jasmine.createSpy('css').and.callFake((tabId, details, callback) => {
            if (typeof callback === 'function') {
                callback();
            }
            return { tabId, details };
        });
    }

    function lastCssCall(spy) {
        const args = spy.calls.mostRecent().args;
        return { tabId: args[0], details: args[1] };
    }

    it('maps a css string onto tabs.insertCSS', async () => {
        chrome.tabs.insertCSS = chromeCssSpy();
        await insertCSS({ target: { tabId: 4 }, css: 'body{display:none}' });
        expect(lastCssCall(chrome.tabs.insertCSS)).toEqual({
            tabId: 4,
            details: { code: 'body{display:none}' },
        });
    });

    it('maps a css string onto tabs.removeCSS', async () => {
        chrome.tabs.removeCSS = chromeCssSpy();
        await removeCSS({ target: { tabId: 4 }, css: 'body{display:none}' });
        expect(lastCssCall(chrome.tabs.removeCSS)).toEqual({
            tabId: 4,
            details: { code: 'body{display:none}' },
        });
    });
});
