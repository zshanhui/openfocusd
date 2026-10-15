const COMMENT_SECTIONS = [
    'ytd-comments',
    '#comments',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]',
];

const RELATED_SECTIONS = ['#related', 'ytd-watch-next-secondary-results-renderer'];

const COMMENTS_NOTE = 'Comments are hidden by OpenFocusd';
const RELATED_NOTE = 'Recommended videos are hidden by OpenFocusd';
const SHORTS_NOTE = 'Shorts are hidden by OpenFocusd';

const SHORTS_SURFACES = [
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-rich-section-renderer:has(ytd-reel-shelf-renderer)',
    'ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts])',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model)',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2)',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
    'ytd-reel-item-renderer',
    'ytd-video-renderer:has(a[href^="/shorts/"])',
    'ytd-grid-video-renderer:has(a[href^="/shorts/"])',
    'ytd-rich-item-renderer:has(a[href^="/shorts/"])',
    'ytd-compact-video-renderer:has(a[href^="/shorts/"])',
    'ytd-guide-entry-renderer:has(a[href^="/shorts"])',
    'ytd-mini-guide-entry-renderer:has(a[href^="/shorts"])',
];

const THUMBNAIL_SURFACES = [
    'yt-thumbnail-view-model',
    'ytd-thumbnail',
    'ytd-playlist-thumbnail',
    '.ytp-videowall-still',
    '.ytp-videowall-still-image',
];

export const YOUTUBE_MATCHES = ['*://*.youtube.com/*', '*://youtube.com/*'];

export const YOUTUBE_SANITIZE_LISTENER = 'public/js/content-scripts/youtube-sanitize.js';

export const YOUTUBE_CSS_REGISTRATION_ID = 'openfocusd-youtube-css';

/**
 * Rules stay in the page and match nothing until the matching class is on <html>.
 * Adding or removing the class at document_start shows or hides a section without
 * waiting for the document to finish loading.
 *
 * @type {{ setting: string, className: string, id: string, script: string, cssFile: string, extensionCss: string }[]}
 */
export const YOUTUBE_SANITIZE_SHEETS = [
    {
        setting: 'hideYoutubeComments',
        className: 'openfocusd-yt-comments',
        id: 'openfocusd-yt-class-comments',
        script: 'public/js/content-scripts/yt-class-comments.js',
        cssFile: 'comments.css',
        extensionCss: 'data/youtube-sanitize/comments.css',
    },
    {
        setting: 'hideYoutubeRecommendations',
        className: 'openfocusd-yt-related',
        id: 'openfocusd-yt-class-related',
        script: 'public/js/content-scripts/yt-class-related.js',
        cssFile: 'related.css',
        extensionCss: 'data/youtube-sanitize/related.css',
    },
    {
        setting: 'hideYoutubeShorts',
        className: 'openfocusd-yt-shorts',
        id: 'openfocusd-yt-class-shorts',
        script: 'public/js/content-scripts/yt-class-shorts.js',
        cssFile: 'shorts.css',
        extensionCss: 'data/youtube-sanitize/shorts.css',
    },
    {
        setting: 'blurYoutubeThumbnails',
        className: 'openfocusd-yt-thumbs',
        id: 'openfocusd-yt-class-thumbs',
        script: 'public/js/content-scripts/yt-class-thumbs.js',
        cssFile: 'thumbnails.css',
        extensionCss: 'data/youtube-sanitize/thumbnails.css',
    },
];

/**
 * @param {string} className
 * @param {string} selector
 * @returns {string}
 */
function scope(className, selector) {
    return `html.${className} ${selector}`;
}

/**
 * The combinator has to be repeated for every selector. `a, b > *` only
 * applies `> *` to `b`.
 *
 * @param {string} className
 * @param {string[]} sections
 * @param {string} note
 * @returns {string}
 */
function sectionCss(className, sections, note) {
    const rule = (suffix, declarations) =>
        `${sections.map((selector) => `${scope(className, selector)}${suffix}`).join(',')}{${declarations}}`;
    return [
        rule(' > *', 'display:none !important;'),
        rule(
            '::before',
            [
                `content:"${note}";`,
                'display:block !important;',
                'padding:12px 0 16px !important;',
                'font:14px/1.4 Roboto,Arial,sans-serif !important;',
                'color:var(--yt-spec-text-secondary,#aaa) !important;',
            ].join(''),
        ),
    ].join('');
}

/**
 * @param {string} className
 * @param {string[]} selectors
 * @returns {string}
 */
function hideElements(className, selectors) {
    return `${selectors.map((selector) => scope(className, selector)).join(',')}{display:none !important;}`;
}

const comments = YOUTUBE_SANITIZE_SHEETS[0].className;
const related = YOUTUBE_SANITIZE_SHEETS[1].className;
const shorts = YOUTUBE_SANITIZE_SHEETS[2].className;
const thumbs = YOUTUBE_SANITIZE_SHEETS[3].className;

/** @type {Record<string, string>} */
export const YOUTUBE_SANITIZE_CSS = {
    [YOUTUBE_SANITIZE_SHEETS[0].setting]: sectionCss(comments, COMMENT_SECTIONS, COMMENTS_NOTE),
    [YOUTUBE_SANITIZE_SHEETS[1].setting]: sectionCss(related, RELATED_SECTIONS, RELATED_NOTE),
    [YOUTUBE_SANITIZE_SHEETS[2].setting]: [hideElements(shorts, SHORTS_SURFACES), sectionCss(shorts, ['ytd-shorts'], SHORTS_NOTE)].join(''),
    [YOUTUBE_SANITIZE_SHEETS[3].setting]:
        `${THUMBNAIL_SURFACES.map((selector) => scope(thumbs, selector)).join(',')}{filter:blur(20px) !important;}`,
};

/**
 * @param {string} className
 * @returns {string}
 */
export function youtubeClassScript(className) {
    return `document.documentElement.classList.add(${JSON.stringify(className)});\n`;
}
