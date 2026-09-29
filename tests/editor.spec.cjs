const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('source, visual editing and undo preserve GFM structures', async ({ page }) => {
  const markdown = '# Test\n\n- [x] Done\n- [ ] Todo\n\n| A | B |\n| --- | --- |\n| one | two |\n\n```js\nconst x = 1;\n```\n\n~~old~~';
  await page.locator('#source').fill(markdown);
  await expect(page.locator('#preview h1')).toHaveText('Test');
  await page.locator('#visual-edit').check();
  await page.locator('#preview h1').click();
  await page.keyboard.press('Home');
  await page.keyboard.type('Edited ');
  await expect(page.locator('#source')).toHaveValue(/# Edited Test/);
  await expect(page.locator('#source')).toHaveValue(/\[x\] Done/);
  await expect(page.locator('#source')).toHaveValue(/```js\nconst x = 1;/);
  await expect(page.locator('#source')).toHaveValue(/\| one \| two \|/);
  await page.locator('#preview input[type=checkbox]').nth(1).check();
  await expect(page.locator('#source')).toHaveValue(/\[x\] Todo/);
  await page.locator('#undo-button').click();
  await expect(page.locator('#source')).toHaveValue(/\[ \] Todo/);
  await page.locator('#redo-button').click();
  await expect(page.locator('#source')).toHaveValue(/\[x\] Todo/);
  await page.locator('[data-mode=source]').filter({ hasText: 'ソース' }).click();
  await expect(page.locator('#visual-edit')).not.toBeChecked();
  await expect(page.locator('#preview')).not.toBeVisible();
});

test('downloads exact source and restores drafts', async ({ page }) => {
  const markdown = '# 日本語\n\n**そのまま保存**\n';
  await page.locator('#source').fill(markdown);
  await page.locator('#filename').fill('テスト.md');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-button').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('テスト.md');
  expect(await readFile(await download.path(), 'utf8')).toBe(markdown);
  await page.reload();
  await expect(page.locator('#source')).toHaveValue(markdown);
  await expect(page.locator('#filename')).toHaveValue('テスト.md');
});

test('opens UTF-8 files in tabs and protects unsaved work when closing', async ({ page }) => {
  await page.locator('#file-input').setInputFiles({ name: 'opened.md', mimeType: 'text/markdown', buffer: Buffer.from('\uFEFF# 読み込み\r\n\r\n本文') });
  await expect(page.locator('#preview h1')).toHaveText('読み込み');
  await expect(page.locator('#filename')).toHaveValue('opened.md');
  await page.locator('#source').fill('# unsaved');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'opened.mdを閉じる', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue('# unsaved');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'opened.mdを閉じる', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'opened.md', exact: true })).toHaveCount(0);
  await page.locator('#new-button').click();
  await expect(page.locator('#source')).toHaveValue('');
});

test('untrusted Markdown cannot execute scripts or inject app controls', async ({ page }) => {
  await page.locator('#source').fill('<script>window.pwned=true</script>\n\n<img src="x" onerror="window.pwned=true">\n\n<a href="javascript:window.pwned=true">bad</a>\n\n<iframe srcdoc="x"></iframe>\n\n<input id="source" type="text">\n\n<style>body{display:none}</style>');
  await expect(page.locator('#preview a')).toHaveText('bad');
  await expect(page.locator('#preview script, #preview iframe, #preview style, #preview [onerror], #preview #source')).toHaveCount(0);
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  await expect(page.locator('#preview a')).not.toHaveAttribute('href');
  await expect(page.locator('#preview img')).not.toHaveAttribute('src');
});

test('print shows the document even from source-only mode', async ({ page }) => {
  await page.locator('#source').fill('# 印刷テスト\n\n本文のみ');
  await page.getByRole('button', { name: 'ソース', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#preview h1')).toBeVisible();
  await expect(page.locator('.app-header')).not.toBeVisible();
  await expect(page.locator('.source-pane')).not.toBeVisible();
  await expect(page.locator('.format-bar')).not.toBeVisible();
  await expect(page.locator('#file-tabs')).not.toBeVisible();
  expect(await page.locator('.paper-wrap').evaluate(e => getComputedStyle(e).overflow)).toBe('visible');
});

test('works without a server and without remote requests', async ({ page }) => {
  const external = [];
  page.on('request', req => { if (/^https?:/.test(req.url())) external.push(req.url()); });
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await expect(page.locator('#preview h1')).toHaveText('書くことに、集中しよう。');
  await page.locator('#source').fill('# オフライン');
  await expect(page.locator('#preview h1')).toHaveText('オフライン');
  expect(external).toEqual([]);
});

test('mobile layout fits the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#source')).toBeVisible();
  await expect(page.locator('#preview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('format tools work in source and preview', async ({ page }) => {
  await page.locator('#source').fill('hello');
  await page.locator('#source').selectText();
  await page.getByRole('button', { name: '太字', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue('**hello**');
  await page.locator('#visual-edit').check();
  await page.locator('#preview strong').evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.getByRole('button', { name: '斜体', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue(/\*\*\*hello\*\*\*/);
});

test('initial desktop view has no runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.reload();
  await expect(page.locator('#preview h1')).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('works from a GitHub Pages style repository subpath', async ({ page }) => {
  await page.route('**/markdown-desk/**', route => route.continue({ url: route.request().url().replace('/markdown-desk/', '/') }));
  await page.goto('/markdown-desk/index.html');
  await expect(page.locator('#preview h1')).toHaveText('書くことに、集中しよう。');
  await page.locator('#source').fill('# Subpath');
  await expect(page.locator('#preview h1')).toHaveText('Subpath');
});

test('Japanese composition commits and can be undone', async ({ page }) => {
  await page.locator('#source').fill('before');
  await page.locator('#source').evaluate(element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.value = '# 日本語入力';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
  });
  await expect(page.locator('#preview h1')).toHaveText('日本語入力');
  await page.locator('#undo-button').click();
  await expect(page.locator('#source')).toHaveValue('before');
});

test('storage errors leave editing and file saving available', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); }; });
  await page.reload();
  await page.locator('#source').fill('# Still editable');
  await expect(page.locator('#preview h1')).toHaveText('Still editable');
  await expect(page.locator('#save-status')).toContainText('下書きを保存できません');
  const download = page.waitForEvent('download');
  await page.locator('#save-button').click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
});

test('multiple files keep independent edits, history, modes and saved state', async ({ page }) => {
  await page.locator('#file-input').setInputFiles([
    { name: 'a.md', mimeType: 'text/markdown', buffer: Buffer.from('# A') },
    { name: 'b.md', mimeType: 'text/markdown', buffer: Buffer.from('# B') },
  ]);
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.locator('#filename')).toHaveValue('b.md');
  await page.locator('#source').fill('# B edited');
  await page.getByRole('tab', { name: 'a.md', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue('# A');
  await expect(page.locator('#preview')).toHaveAttribute('contenteditable', 'false');
  await page.getByRole('button', { name: 'プレビュー', exact: true }).click();
  await page.locator('#visual-edit').check();
  await page.locator('#preview h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' visual');
  await expect(page.locator('#source')).toHaveValue('# A visual');
  await page.getByRole('tab', { name: '● b.md', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue('# B edited');
  await expect(page.locator('#visual-edit')).not.toBeChecked();
  await page.locator('#undo-button').click();
  await expect(page.locator('#source')).toHaveValue('# B');
  await page.locator('#redo-button').click();
  await expect(page.locator('#source')).toHaveValue('# B edited');
  const pending = page.waitForEvent('download');
  await page.locator('#save-button').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('b.md');
  expect(await readFile(await download.path(), 'utf8')).toBe('# B edited');
  await expect(page.getByRole('tab', { name: 'b.md', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: '● a.md', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '● a.md', exact: true }).click();
  await expect(page.locator('#visual-edit')).toBeChecked();
  await expect(page.locator('#workspace')).toHaveAttribute('data-mode', 'preview');
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.locator('#source')).toHaveValue('# A visual');
  await expect(page.locator('#visual-edit')).toBeChecked();
  await page.getByRole('tab', { name: 'b.md', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue('# B edited');
});

test('new tabs preserve pending edits and the final closed tab becomes a blank document', async ({ page }) => {
  await page.locator('#source').fill('preserved');
  await page.locator('#new-button').click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('button', { name: '無題.mdを閉じる', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue('preserved');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'はじめてのノート.mdを閉じる', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.locator('#source')).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.locator('#source')).toHaveValue('');
});

test('migrates the previous single-file draft', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.removeItem('markdown-desk:tabs:v2');
    localStorage.setItem('markdown-desk:draft:v1', JSON.stringify({ text: '# Legacy edit', name: 'legacy.md', savedText: '# Legacy', savedName: 'legacy.md' }));
  });
  // A fresh page avoids the outgoing pagehide handler replacing the migration fixture.
  const restored = await page.context().newPage();
  await restored.goto('/');
  await expect(restored.locator('#source')).toHaveValue('# Legacy edit');
  await expect(restored.getByRole('tab', { name: '● legacy.md', exact: true })).toBeVisible();
  await expect(restored.locator('#visual-edit')).not.toBeChecked();
});
