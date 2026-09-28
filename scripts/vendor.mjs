import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';

const packages = [
  ['marked', 'lib/marked.umd.js', 'marked.js', 'LICENSE'],
  ['dompurify', 'dist/purify.min.js', 'purify.js', 'LICENSE'],
  ['turndown', 'dist/turndown.js', 'turndown.js', 'LICENSE'],
  ['turndown-plugin-gfm', 'dist/turndown-plugin-gfm.js', 'turndown-plugin-gfm.js', 'LICENSE'],
];
await mkdir('vendor', { recursive: true });
const notices = ['# Third-party libraries', '', 'The following browser libraries are bundled locally. No CDN is used.', ''];
for (const [name, source, target, license] of packages) {
  const root = `node_modules/${name}`;
  const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  await copyFile(`${root}/${source}`, `vendor/${target}`);
  await copyFile(`${root}/${license}`, `vendor/${name}.LICENSE`);
  notices.push(`- ${name} ${pkg.version} (${pkg.license}) — [license](vendor/${name}.LICENSE)`);
}
await writeFile('THIRD_PARTY_NOTICES.md', notices.join('\n') + '\n');
console.log('Browser libraries and licenses copied to vendor/.');
