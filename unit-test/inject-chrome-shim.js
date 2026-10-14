const chrome = {
    alarms: {
        // webextension-polyfill wraps these with callbacks. Resolve both styles.
        create(name, info, cb) {
            if (typeof name === 'object') {
                cb = info;
            }
            if (typeof cb === 'function') {
                cb();
                return;
            }
            return Promise.resolve();
        },
        get(name, cb) {
            if (typeof cb === 'function') {
                cb(undefined);
                return;
            }
            return Promise.resolve(undefined);
        },
        clear(name, cb) {
            const cleared = false;
            if (typeof cb === 'function') {
                cb(cleared);
                return;
            }
            return Promise.resolve(cleared);
        },
        onAlarm: {
            addListener() {},
            removeListener() {},
        },
    },
    browserAction: {
        setIcon: () => {},
    },
    contextMenus: {
        create: () => {},
        onClicked: {
            addListener: () => {},
        },
    },
    declarativeNetRequest: {
        isRegexSupported() {
            return { isSupported: true };
        },
        getDynamicRules() {},
        getSessionRules() {},
        getEnabledRulesets() {},
        updateDynamicRules() {},
        updateEnabledRulesets() {},
        updateSessionRules() {},
    },
    i18n: {
        getUILanguage() {
            return 'en-US';
        },
    },
    runtime: {
        id: '577dc9b9-c381-115a-2246-3f95fe0e6ffe',
        sendMessage: () => {},
        getManifest: () => {
            return { version: '1234.56' };
        },
        setUninstallURL: () => {},
        getURL: (path) => path,
        onConnect: {
            addListener() {},
            removeListener() {},
        },
        onInstalled: {
            addListener() {},
            removeListener() {},
        },
        onMessage: {
            addListener() {},
            removeListener() {},
        },
        onPerformanceWarning: {
            addListener(listener) {
                chrome.runtime.onPerformanceWarning._listeners.push(listener);
            },
            _listeners: [],
        },
        onStartup: {
            addListener() {},
            removeListener() {},
        },
        getContexts(query, cb) {
            const contexts = [];
            if (typeof cb === 'function') {
                cb(contexts);
                return;
            }
            return Promise.resolve(contexts);
        },
    },

    storage: {
        local: {
            set: (value) => {
                chrome.storage.local._setCalls.push(value);
            },
            get: (args, respond) => {
                respond({});
            },
            _setCalls: [],
        },
        managed: {
            get: (args, respond) => {
                respond({});
            },
        },
    },
    tabs: {
        onActivated: {
            addListener() {},
            removeListener() {},
        },
        onUpdated: {
            addListener() {},
            removeListener() {},
        },
        sendMessage: () => {},
        query(queryInfo, cb) {
            const tabs = [];
            if (typeof cb === 'function') {
                cb(tabs);
                return;
            }
            return Promise.resolve(tabs);
        },
        get(tabId, cb) {
            const tab = null;
            if (typeof cb === 'function') {
                cb(tab);
                return;
            }
            return Promise.resolve(tab);
        },
        update(tabId, updateProperties, cb) {
            if (typeof cb === 'function') {
                cb();
                return;
            }
            return Promise.resolve();
        },
        reload(tabId, reloadProperties, cb) {
            if (typeof cb === 'function') {
                cb();
                return;
            }
            return Promise.resolve();
        },
    },

    webNavigation: {
        onBeforeNavigate: {
            addListener() {},
            removeListener() {},
        },
        onCommitted: {
            addListener() {},
            removeListener() {},
        },
        onCompleted: {
            addListener() {},
            removeListener() {},
        },
        onErrorOccurred: {
            addListener() {},
            removeListener() {},
        },
    },
    webRequest: {
        OnBeforeSendHeadersOptions: {},
        OnHeadersReceivedOptions: {},
        onBeforeRequest: {
            addListener() {},
            removeListener() {},
        },
        onBeforeSendHeaders: {
            addListener() {},
            removeListener() {},
        },
        onCompleted: {
            addListener() {},
            removeListener() {},
        },
        onErrorOccurred: {
            addListener() {},
            removeListener() {},
        },
        onHeadersReceived: {
            addListener() {},
            removeListener() {},
        },
    },
    windows: {
        WINDOW_ID_NONE: -1,
        onFocusChanged: {
            addListener() {},
            removeListener() {},
        },
        getLastFocused(getInfo, cb) {
            const win = { id: 1, focused: true };
            if (typeof getInfo === 'function') {
                getInfo(win);
                return;
            }
            if (typeof cb === 'function') {
                cb(win);
                return;
            }
            return Promise.resolve(win);
        },
    },
};
export { chrome as 'globalThis.chrome', chrome };
