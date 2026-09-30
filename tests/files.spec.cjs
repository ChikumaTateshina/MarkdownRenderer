const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');

const upload = (page, name, content) => page.locator('#file-input').setInputFiles({ name, mimeType: 'application/octet-stream', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
async function downloaded(page) {
  const pending = page.waitForEvent('download');
  await page.locator('#save-button').click();
  const file = await pending;
  return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}
test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('themes follow OS, persist explicit selection and keep print white', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('#theme')).toHaveValue('light');
  await page.locator('#theme').selectOption('contrast');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.screenshot({ path: 'test-results/contrast.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('#theme')).not.toBeVisible();
});

test('Python highlights during editing and preserves filename, BOM and CRLF on save', async ({ page }) => {
  const original = Buffer.from('\uFEFFdef hello(name):\r\n    return "Hello, " + name\r\n');
  await upload(page, 'hello.py', original);
  await expect(page.locator('#source')).toHaveValue('def hello(name):\n    return "Hello, " + name\n');
  await expect(page.locator('#source-highlight .token.keyword').first()).toHaveText('def');
  await expect(page.locator('#visual-edit')).toBeDisabled();
  const first = await downloaded(page);
  expect(first.name).toBe('hello.py');
  expect(first.bytes.equals(original)).toBe(true);
  await page.locator('#source').fill('print("日本語")\n');
  await expect(page.locator('#source-highlight .token.string')).toHaveText('"日本語"');
  const edited = await downloaded(page);
  expect(edited.bytes.equals(Buffer.from('\uFEFFprint("日本語")\r\n'))).toBe(true);
  await page.reload();
  expect((await downloaded(page)).bytes.equals(edited.bytes)).toBe(true);
});

test('plain text and unknown extensions are editable without Markdown rendering', async ({ page }) => {
  await upload(page, 'notes.txt', '# Literal heading\n<script>window.pwned=true</script>');
  await expect(page.locator('#source')).toHaveValue(/# Literal heading/);
  await page.getByRole('button', { name: 'プレビュー', exact: true }).click();
  await expect(page.locator('#preview h1, #preview script')).toHaveCount(0);
  await expect(page.locator('#preview')).toContainText('<script>');
  expect(await page.evaluate(() => window.pwned)).toBeUndefined();
  expect((await downloaded(page)).name).toBe('notes.txt');
  await upload(page, 'custom.xyz', 'hello');
  await expect(page.locator('#filename')).toHaveValue('custom.xyz');
  await page.locator('#source').fill('changed');
  expect((await downloaded(page)).bytes.toString()).toBe('changed');
  await page.locator('#language-mode').selectOption('markdown');
  await page.getByRole('button', { name: '並べて表示', exact: true }).click();
  await page.locator('#source').fill('# Custom');
  await expect(page.locator('#preview h1')).toHaveText('Custom');
  await expect(page.locator('#visual-edit')).toBeEnabled();
});

test('binary pages, offset validation and download preserve every byte', async ({ page }) => {
  const bytes = Buffer.from(Array.from({ length: 513 }, (_, i) => i % 256));
  await upload(page, 'sample.bin', bytes);
  await expect(page.locator('#binary-pane')).toBeVisible();
  await expect(page.locator('#source')).not.toBeVisible();
  await expect(page.locator('#hex-content')).toContainText('00000000  00 01 02 03');
  await expect(page.locator('#hex-page')).toContainText('1–256 / 513 bytes');
  await page.locator('#hex-next').click();
  await expect(page.locator('#hex-content')).toContainText('00000100');
  await page.locator('#hex-offset').fill('0x200');
  await page.locator('#hex-go').click();
  await expect(page.locator('#hex-content')).toContainText('00000200  00');
  await expect(page.locator('#hex-next')).toBeDisabled();
  await page.locator('#hex-offset').fill('9999999');
  await page.locator('#hex-go').click();
  await expect(page.locator('#toast')).toContainText('ファイル内のオフセット');
  await expect(page.locator('#hex-content')).toContainText('00000200  00');
  const result = await downloaded(page);
  expect(result.name).toBe('sample.bin');
  expect(result.bytes.equals(bytes)).toBe(true);
  await page.locator('#theme').selectOption('dark');
  await page.locator('#hex-prev').click();
  await page.screenshot({ path: 'test-results/binary-dark.png', fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#hex-content')).toBeVisible();
  await expect(page.locator('#preview')).not.toBeVisible();
  await expect(page.locator('.hex-toolbar')).not.toBeVisible();
});

test('binary detection handles invalid UTF-8 and empty files', async ({ page }) => {
  await upload(page, 'invalid.txt', Buffer.from([0xff, 0xfe, 0, 128]));
  await expect(page.locator('#binary-pane')).toBeVisible();
  await expect(page.locator('#hex-content')).toContainText('FF FE 00 80');
  await upload(page, 'empty.bin', Buffer.alloc(0));
  await expect(page.locator('#hex-page')).toContainText('0–0 / 0 bytes');
  await expect(page.locator('#hex-prev')).toBeDisabled();
  await expect(page.locator('#hex-next')).toBeDisabled();
  expect((await downloaded(page)).bytes.length).toBe(0);
});

test('text hex view shows current edits and text drafts survive binary tabs', async ({ page }) => {
  await upload(page, 'text.txt', 'AB');
  await page.locator('#source').fill('ABC');
  await page.locator('#hex-toggle').click();
  await expect(page.locator('#hex-content')).toContainText('41 42 43');
  await page.locator('#hex-toggle').click();
  await expect(page.locator('#source')).toHaveValue('ABC');
  await upload(page, 'temp.bin', Buffer.from([0, 255]));
  await expect(page.locator('#save-status')).toContainText('下書き保存されません');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'temp.bin', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '● text.txt', exact: true }).click();
  await expect(page.locator('#source')).toHaveValue('ABC');
});

test('highlighted editing handles IME, scrolling, long documents and mobile', async ({ page }) => {
  await upload(page, 'main.js', 'const message = "Hello";\n'.repeat(80));
  await expect(page.locator('#source-highlight .token.keyword').first()).toHaveText('const');
  await page.locator('#source').evaluate(element => { element.scrollTop = 400; element.dispatchEvent(new Event('scroll')); });
  expect(await page.locator('#source-highlight').evaluate(e => e.scrollTop)).toBe(400);
  await page.locator('#source').evaluate(element => {
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    element.value = '// 日本語入力中';
    element.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
  });
  await expect(page.locator('#source-highlight')).toContainText('日本語入力中');
  await page.locator('#source').dispatchEvent('compositionend');
  await upload(page, 'large.js', 'const value = 42;\n'.repeat(6000));
  await expect(page.locator('#filename')).toHaveValue('large.js');
  await expect(page.locator('.source-editor')).not.toHaveClass(/highlighted/);
  await expect(page.locator('#file-info')).toContainText('ハイライトを省略');
  await page.locator('#source').fill('const value = 42;\nconsole.log(value);');
  await page.getByRole('button', { name: '並べて表示', exact: true }).click();
  await page.locator('#theme').selectOption('dark');
  await expect(page.locator('#preview .token.keyword')).toHaveText('const');
  await page.screenshot({ path: 'test-results/code-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/code-mobile.png', fullPage: true });
  await page.locator('#highlight-toggle').uncheck();
  await expect(page.locator('.source-editor')).not.toHaveClass(/highlighted/);
  await expect(page.locator('#preview .token')).toHaveCount(0);
});
