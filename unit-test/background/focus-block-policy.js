import browser from 'webextension-polyfill';
import {
    FOCUS_POLICY_STORAGE,
    decideFocusBlock,
    installFocusBlockListener,
    resetFocusBlockPolicy,
    restoreCachedFocusPolicy,
    setBlockedDomains,
    setCategoryPolicy,
    setSanctuaryPolicy,
} from '../../shared/js/background/focus-block-policy';

describe('focus block policy', () => {
    beforeEach(() => {
        resetFocusBlockPolicy();
    });

    it('redirects a main-frame request to a blocked domain and cancels other requests', () => {
        setBlockedDomains(['reddit.com']);

        expect(decideFocusBlock({ url: 'https://reddit.com/r/all', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://www.reddit.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://reddit.com/ads.js', type: 'script' })).toEqual({ action: 'cancel' });
        expect(decideFocusBlock({ url: 'https://cdn.reddit.com/image.png', type: 'image' })).toEqual({ action: 'cancel' });
    });

    it('leaves a domain that still has time alone', () => {
        setBlockedDomains(['reddit.com']);

        expect(decideFocusBlock({ url: 'https://news.example/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://news.example/app.js', type: 'script' })).toBeNull();
    });

    it('allows an allowed host during sanctuary and redirects every other top-level navigation', () => {
        setSanctuaryPolicy(true, ['khanacademy.org', '*.youtube.com']);

        expect(decideFocusBlock({ url: 'https://khanacademy.org/math', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://www.youtube.com/watch', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://khanacademy.org/app.js', type: 'script' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://cdn.example/pixel.gif', type: 'image' })).toBeNull();
    });

    it('lets an allowed host through even when that domain is also blocked', () => {
        setBlockedDomains(['reddit.com', 'khanacademy.org']);
        setSanctuaryPolicy(true, ['khanacademy.org']);

        expect(decideFocusBlock({ url: 'https://khanacademy.org/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://khanacademy.org/a.js', type: 'script' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://reddit.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://reddit.com/a.js', type: 'script' })).toEqual({ action: 'cancel' });
    });

    it('keeps site-group blocking when sanctuary is off', () => {
        setBlockedDomains(['reddit.com']);
        setSanctuaryPolicy(false, ['khanacademy.org']);

        expect(decideFocusBlock({ url: 'https://reddit.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://khanacademy.org/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();
    });

    it('redirects a listed host and lets an allowed-site exception through', () => {
        setCategoryPolicy(true, ['pornhub.com'], ['khanacademy.org']);

        expect(decideFocusBlock({ url: 'https://www.pornhub.com/video', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://pornhub.com/a.js', type: 'script' })).toEqual({ action: 'cancel' });
        expect(decideFocusBlock({ url: 'https://khanacademy.org/math', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();
    });

    it('leaves requests alone when the category list is off', () => {
        setCategoryPolicy(false, ['pornhub.com'], []);

        expect(decideFocusBlock({ url: 'https://pornhub.com/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://pornhub.com/a.js', type: 'script' })).toBeNull();
    });

    it('lets sanctuary override the category list', () => {
        setCategoryPolicy(true, ['pornhub.com', 'khanacademy.org'], ['khanacademy.org']);
        setSanctuaryPolicy(true, ['pornhub.com']);

        expect(decideFocusBlock({ url: 'https://pornhub.com/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://khanacademy.org/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
    });

    it('stops sanctuary blocking after endsAt even if the expiry alarm is late', () => {
        setSanctuaryPolicy(true, ['khanacademy.org'], Date.now() - 1000);
        setBlockedDomains(['reddit.com']);

        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://reddit.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://khanacademy.org/', type: 'main_frame' })).toBeNull();
    });

    it('keeps sanctuary on when endsAt is still in the future', () => {
        setSanctuaryPolicy(true, ['khanacademy.org'], Date.now() + 60_000);

        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://khanacademy.org/', type: 'main_frame' })).toBeNull();
    });

    it('restores the last saved block list before settings load', () => {
        const endsAt = Date.now() + 60_000;
        setBlockedDomains(['reddit.com']);
        setSanctuaryPolicy(true, ['khanacademy.org'], endsAt);
        setCategoryPolicy(true, ['pornhub.com'], ['khanacademy.org']);

        const savedBlocked = localStorage.getItem(FOCUS_POLICY_STORAGE.blocked);
        const savedSanctuary = localStorage.getItem(FOCUS_POLICY_STORAGE.sanctuary);
        const savedCategory = localStorage.getItem(FOCUS_POLICY_STORAGE.category);

        setBlockedDomains([]);
        setSanctuaryPolicy(false);
        setCategoryPolicy(false);
        expect(decideFocusBlock({ url: 'https://reddit.com/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://pornhub.com/', type: 'main_frame' })).toBeNull();

        localStorage.setItem(FOCUS_POLICY_STORAGE.blocked, savedBlocked);
        localStorage.setItem(FOCUS_POLICY_STORAGE.sanctuary, savedSanctuary);
        localStorage.setItem(FOCUS_POLICY_STORAGE.category, savedCategory);
        restoreCachedFocusPolicy();

        expect(decideFocusBlock({ url: 'https://www.reddit.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://reddit.com/ads.js', type: 'script' })).toEqual({ action: 'cancel' });
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
        expect(decideFocusBlock({ url: 'https://khanacademy.org/math', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://pornhub.com/a.js', type: 'script' })).toEqual({ action: 'cancel' });
    });

    it('does not keep an expired sanctuary session from the saved list', () => {
        setBlockedDomains(['reddit.com']);
        setSanctuaryPolicy(true, ['khanacademy.org'], Date.now() - 1000);
        const savedSanctuary = localStorage.getItem(FOCUS_POLICY_STORAGE.sanctuary);
        setSanctuaryPolicy(false);
        localStorage.setItem(FOCUS_POLICY_STORAGE.sanctuary, savedSanctuary);
        restoreCachedFocusPolicy();

        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://reddit.com/', type: 'main_frame' })).toEqual({ action: 'redirect' });
    });

    it('does nothing when the policy is empty', () => {
        expect(decideFocusBlock({ url: 'https://example.com/', type: 'main_frame' })).toBeNull();
        expect(decideFocusBlock({ url: 'https://example.com/app.js', type: 'script' })).toBeNull();
    });

    it('installs one blocking listener that redirects and cancels from the policy', () => {
        spyOn(browser.runtime, 'getManifest').and.returnValue({ version: '2026.10.15', manifest_version: 2 });
        const addListener = spyOn(browser.webRequest.onBeforeRequest, 'addListener');
        installFocusBlockListener();
        installFocusBlockListener();
        expect(addListener).toHaveBeenCalledTimes(1);
        expect(addListener).toHaveBeenCalledWith(jasmine.any(Function), { urls: ['<all_urls>'] }, ['blocking']);

        const listener = addListener.calls.mostRecent().args[0];
        setBlockedDomains(['example.com']);

        expect(listener({ url: 'https://example.com/', type: 'main_frame' })).toEqual({
            redirectUrl: '/html/blocked.html',
        });
        expect(listener({ url: 'https://www.example.com/pixel.gif', type: 'image' })).toEqual({ cancel: true });
        expect(listener({ url: 'https://news.example.org/', type: 'main_frame' })).toBeUndefined();
    });
});
