import fs from 'fs';
import path from 'path';
import { YOUTUBE_SANITIZE_CSS, YOUTUBE_SANITIZE_SHEETS, youtubeClassScript } from '../../shared/js/shared-utils/youtube-sanitize-css';

const root = process.cwd();

describe('youtube sanitize stylesheets', () => {
    it('keeps the packaged CSS and class scripts in sync with the builder', () => {
        for (const sheet of YOUTUBE_SANITIZE_SHEETS) {
            const cssPath = path.join(root, 'shared/data/youtube-sanitize', sheet.cssFile);
            const scriptPath = path.join(root, 'shared/js/content-scripts', path.basename(sheet.script));
            expect(fs.readFileSync(cssPath, 'utf8')).toBe(YOUTUBE_SANITIZE_CSS[sheet.setting]);
            const script = fs.readFileSync(scriptPath, 'utf8');
            expect(script.includes('classList.add')).toBeTrue();
            expect(script.includes(sheet.className)).toBeTrue();
            expect(youtubeClassScript(sheet.className).includes(sheet.className)).toBeTrue();
            expect(YOUTUBE_SANITIZE_CSS[sheet.setting].includes(`html.${sheet.className} `)).toBeTrue();
        }
    });
});
