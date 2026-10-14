import browser from 'webextension-polyfill';
import settings from '../../shared/js/background/settings';
import { refreshUserBlockedSitesRules } from '../../shared/js/background/dnr-user-blocklist';
import { setAdultGamblingBlockEnabled } from '../../shared/js/background/dnr-category-blocklist';
import { clearSanctuaryRules, refreshSanctuaryRules } from '../../shared/js/background/dnr-sanctuary';
import { decideFocusBlock, installFocusBlockListener, resetFocusBlockPolicy } from '../../shared/js/background/focus-block-policy';

describe('Chrome focus enforcement stays on declarativeNetRequest', () => {
    let updateDynamicRules;

    beforeEach(() => {
        resetFocusBlockPolicy();
        spyOn(browser.runtime, 'getManifest').and.returnValue({
            version: '2026.10.15',
            manifest_version: 3,
        });
        updateDynamicRules = spyOn(chrome.declarativeNetRequest, 'updateDynamicRules').and.resolveTo();
        spyOn(chrome.declarativeNetRequest, 'isRegexSupported').and.resolveTo({ isSupported: true });
        spyOn(chrome.declarativeNetRequest, 'updateEnabledRulesets').and.resolveTo();
    });

    it('does not install the webRequest listener', () => {
        const addListener = spyOn(browser.webRequest.onBeforeRequest, 'addListener');
        installFocusBlockListener();
        expect(addListener).not.toHaveBeenCalled();
    });

    it('writes blocked-site rules and leaves the Firefox policy empty', async () => {
        await refreshUserBlockedSitesRules(['example.com']);
        expect(updateDynamicRules).toHaveBeenCalled();
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://example.com/app.js', type: 'script' })).toBeNull();
    });

    it('writes sanctuary rules and leaves the Firefox policy empty', async () => {
        await refreshSanctuaryRules(['khanacademy.org']);
        expect(updateDynamicRules).toHaveBeenCalled();
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();

        await clearSanctuaryRules();
        expect(decideFocusBlock({ url: 'https://khanacademy.org/', type: 'main_frame' })).toBeNull();
    });

    it('writes adult/gambling rules and leaves the Firefox policy empty', async () => {
        const stored = new Map([
            ['blockAdultGamblingSites', false],
            ['allowedSites', ['khanacademy.org']],
        ]);
        spyOn(settings, 'ready').and.resolveTo();
        spyOn(settings, 'getSetting').and.callFake((name) => stored.get(name));
        spyOn(settings, 'updateSetting').and.callFake((name, value) => {
            stored.set(name, value);
        });
        spyOn(globalThis, 'fetch').and.resolveTo({
            ok: true,
            json: async () => [{ condition: { requestDomains: ['pornhub.com'] } }],
        });

        await setAdultGamblingBlockEnabled(true);
        expect(chrome.declarativeNetRequest.updateEnabledRulesets).toHaveBeenCalled();
        expect(updateDynamicRules).toHaveBeenCalled();
        expect(decideFocusBlock({ url: 'https://pornhub.com/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://pornhub.com/a.js', type: 'script' })).toBeNull();
    });
});
