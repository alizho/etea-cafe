import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// /tutorial is the same app, but link previews and search results need their own
// title + description, so after the build we copy dist/index.html to dist/tutorial.html
// with the tutorial metadata swapped in. vercel.json rewrites /tutorial to it.
const TUTORIAL_META = {
  title: 'how to play etea.cafe',
  description: 'Learn how to play etea.cafe with interactive tutorial puzzles.',
  url: 'https://etea.cafe/tutorial',
};

function tutorialPage(): Plugin {
  let outDir = 'dist';
  return {
    name: 'tutorial-page',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const { title, description, url } = TUTORIAL_META;
      let html = readFileSync(resolve(outDir, 'index.html'), 'utf8');
      const swaps: [RegExp, string][] = [
        [/<title>[^<]*<\/title>/, `<title>${title}</title>`],
        [/(property="og:title" content=")[^"]*/, `$1${title}`],
        [/(name="twitter:title" content=")[^"]*/, `$1${title}`],
        [/(property="og:description" content=")[^"]*/, `$1${description}`],
        [/(name="twitter:description" content=")[^"]*/, `$1${description}`],
        [/(property="og:url" content=")[^"]*/, `$1${url}`],
      ];
      for (const [pattern, replacement] of swaps) {
        if (!pattern.test(html)) throw new Error(`tutorial-page: no match for ${pattern}`);
        html = html.replace(pattern, replacement);
      }
      html = html.replace(
        '</title>',
        `</title>\n    <meta name="description" content="${description}" />\n    <link rel="canonical" href="${url}" />`
      );
      writeFileSync(resolve(outDir, 'tutorial.html'), html);
    },
  };
}

export default defineConfig({
  plugins: [tutorialPage()],
});
