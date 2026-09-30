import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';

const packages = [
  ['marked', 'lib/marked.umd.js', 'marked.js', 'LICENSE'],
  ['dompurify', 'dist/purify.min.js', 'purify.js', 'LICENSE'],
  ['turndown', 'dist/turndown.js', 'turndown.js', 'LICENSE'],
  ['turndown-plugin-gfm', 'dist/turndown-plugin-gfm.js', 'turndown-plugin-gfm.js', 'LICENSE'],
  ['prismjs', 'components/prism-core.min.js', 'prism.js', 'LICENSE'],
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
const languages = ['markup', 'css', 'clike', 'javascript', 'python', 'typescript', 'json', 'bash', 'c', 'cpp', 'csharp', 'java', 'go', 'rust', 'sql', 'yaml', 'markdown', 'diff', 'powershell', 'ini', 'ruby'];
const prism = ["window.Prism = { manual: true, disableWorkerMessageHandler: true };", await readFile('vendor/prism.js', 'utf8')];
for (const language of languages) prism.push(await readFile(`node_modules/prismjs/components/prism-${language}.min.js`, 'utf8'));
await writeFile('vendor/prism.js', prism.join('\n'));
await writeFile('THIRD_PARTY_NOTICES.md', notices.join('\n') + '\n');
console.log('Browser libraries and licenses copied to vendor/.');
