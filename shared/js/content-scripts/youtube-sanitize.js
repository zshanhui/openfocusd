(function () {
    const ALL = ['openfocusd-yt-comments', 'openfocusd-yt-related', 'openfocusd-yt-shorts', 'openfocusd-yt-thumbs'];

    function apply(enabled) {
        const root = document.documentElement;
        if (!root) {
            return;
        }
        const set = new Set(enabled || []);
        for (const name of ALL) {
            root.classList.toggle(name, set.has(name));
        }
    }

    try {
        chrome.runtime.sendMessage({ messageType: 'getYoutubeSanitizeClasses' }, (response) => {
            if (chrome.runtime.lastError || !response || !Array.isArray(response.classes)) {
                return;
            }
            apply(response.classes);
        });
    } catch (e) {}
})();
