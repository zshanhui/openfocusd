import { test, expect } from './helpers/playwrightHarness';
import backgroundWait from './helpers/backgroundWait';
import { routeFromLocalhost } from './helpers/testPages';

const testSite = 'https://privacy-test-pages.site/privacy-protections/request-blocking/';

test('shows the website blocker timer in the Firefox popup', async ({ context, backgroundPage, page }) => {
    await backgroundWait.forExtensionLoaded(context);
    await backgroundWait.forAllConfiguration(backgroundPage);
    await routeFromLocalhost(page);
    await page.goto(testSite, { waitUntil: 'domcontentloaded' });

    const panelUrl = await backgroundPage.evaluate(async () => {
        const currentTab = await globalThis.dbg.utils.getCurrentTab();
        const manifest = chrome.runtime.getManifest();
        const popupPath = manifest.action?.default_popup || manifest.browser_action?.default_popup;
        return chrome.runtime.getURL(`${popupPath}?tabId=${currentTab.id}`);
    });

    const panel = await context.newPage();
    const pageErrors = [];
    panel.on('pageerror', (err) => pageErrors.push(err.message));
    await panel.goto(panelUrl);

    const groupStatus = panel.locator('.openfocusd-group-status');
    await expect(groupStatus).toBeVisible();
    await expect(groupStatus).toContainText('You are currently on');
    await expect(groupStatus).toContainText('Group');
    expect(pageErrors).toEqual([]);
});
