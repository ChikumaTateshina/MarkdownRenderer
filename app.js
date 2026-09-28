/* Browser-only application. All libraries are shipped in vendor/. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const source = $('source');
  const preview = $('preview');
  const filename = $('filename');
  const storageKey = 'markdown-desk:draft:v1';
  const example = `# 書くことに、集中しよう。

アイデアのメモから、共有するドキュメントまで。  
**Markdown Desk** は、書いて、確かめて、印刷するための小さな道具です。

## あなたの書き方で

- 左のソースを編集すると、すぐにプレビューに反映
- 「プレビューを編集」をオンにして、本文を直接編集
- 書き終えたら、Markdownで保存。印刷やPDFにも

> 余計な準備はいりません。ファイルを開いて、書き始めましょう。

## 今日のチェックリスト

- [x] 新しいノートを開く
- [ ] 思いついたことを書き留める
- [ ] 完成した文書を保存する

## シンプルな記法、豊かな表現

| 書きたいもの | Markdownの記法 |
| --- | --- |
| 見出し | \`# 見出し\` |
| 太字 | \`**大切なこと**\` |
| 箇条書き | \`- リストの項目\` |

### コードも、そのままに

\`\`\`javascript
const message = "Hello, Markdown!";
console.log(message);
\`\`\`

---

このサンプルは自由に編集できます。「新規」から白紙で始めることもできます。
`;

  const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', strongDelimiter: '**' });
  // Filter URLs before sanitized markup is inserted, so disallowed images never load.
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'src' && (node.nodeName !== 'IMG' || !/^https?:\/\//i.test(data.attrValue))) data.keepAttr = false;
    if (data.attrName === 'href' && !/^(https?:|mailto:|#)/i.test(data.attrValue)) data.keepAttr = false;
  });
  converter.use(turndownPluginGfm.gfm);
  converter.addRule('strike', { filter: ['del', 's', 'strike'], replacement: content => `~~${content}~~` });
  converter.addRule('task', {
    filter: node => node.nodeName === 'INPUT' && node.type === 'checkbox',
    replacement: (_, node) => (node.checked ? '[x]' : '[ ]') + (/^\s/.test(node.nextSibling?.textContent || '') ? '' : ' '),
  });
  converter.addRule('table-cell', {
    filter: ['th', 'td'],
    replacement: (content, node) => `${node.cellIndex === 0 ? '| ' : ' '}${content.replace(/\|/g, '\\|').replace(/\n/g, '<br>')} |`,
  });
  // Preserve language names and code containing backtick fences during visual edits.
  converter.addRule('fenced-code', {
    filter: node => node.nodeName === 'PRE',
    replacement: (_, node) => {
      const code = node.querySelector('code') || node;
      const language = (code.className.match(/language-([\w+-]+)/) || [,''])[1];
      const text = code.textContent.replace(/\n$/, '');
      const longest = Math.max(2, ...(text.match(/`+/g) || []).map(s => s.length));
      const fence = '`'.repeat(longest + 1);
      return `\n\n${fence}${language}\n${text}\n${fence}\n\n`;
    },
  });

  let visual = false;
  let savedText = example;
  let savedName = filename.value;
  let history = [];
  let historyIndex = -1;
  let persistTimer;
  let toastTimer;
  let renderTimer;
  let composing = false;
  let lastEditor = 'source';
  let storageAvailable = true;
  const dirty = () => source.value !== savedText || filename.value !== savedName;

  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3600);
  }

  function safeHTML(html) {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['p','br','div','span','h1','h2','h3','h4','h5','h6','strong','b','em','i','del','s','strike','u','a','ul','ol','li','blockquote','pre','code','hr','table','thead','tbody','tfoot','tr','th','td','img','input','sup','sub','kbd'],
      ALLOWED_ATTR: ['href','src','alt','title','class','type','checked','disabled','start','align','colspan','rowspan'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
  }

  function render() {
    clearTimeout(renderTimer);
    preview.innerHTML = safeHTML(marked.parse(source.value, { gfm: true, breaks: false }));
    preview.querySelectorAll('a').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!/^(https?:|mailto:|#)/i.test(href)) a.removeAttribute('href');
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    });
    preview.querySelectorAll('img').forEach(img => {
      if (!/^https?:\/\//i.test(img.getAttribute('src') || '')) {
        img.removeAttribute('src');
        img.alt = `${img.alt || '画像'}（HTTP(S)画像URLが必要です）`;
      }
      img.referrerPolicy = 'no-referrer';
    });
    preview.querySelectorAll('input').forEach(input => {
      if (input.type !== 'checkbox') input.remove();
      else input.disabled = !visual;
    });
  }

  function updateStats() {
    $('document-stats').textContent = `${Array.from(source.value).length.toLocaleString('ja-JP')} 文字 · ${source.value.split('\n').length.toLocaleString('ja-JP')} 行`;
    $('undo-button').disabled = historyIndex <= 0;
    $('redo-button').disabled = historyIndex >= history.length - 1;
    document.title = `${dirty() ? '• ' : ''}${filename.value || '無題.md'} — Markdown Desk`;
  }

  function persist() {
    clearTimeout(persistTimer);
    try {
      localStorage.setItem(storageKey, JSON.stringify({ text: source.value, name: filename.value, savedText, savedName }));
      storageAvailable = true;
      $('save-status').textContent = dirty() ? '下書きを端末に保存済み · ファイル未保存' : '下書きを端末に保存済み';
    } catch {
      storageAvailable = false;
      $('save-status').textContent = '下書きを保存できません · ファイルに保存してください';
    }
  }

  function record() {
    if (history[historyIndex] === source.value) return;
    history.splice(historyIndex + 1);
    history.push(source.value);
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
  }

  function changed(origin) {
    record();
    updateStats();
    if (origin !== 'preview') {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(render, 100);
    }
    $('save-status').textContent = '下書きを保存中…';
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 250);
  }

  function visualChanged() {
    if (composing) return;
    const clone = preview.cloneNode(true);
    clone.querySelectorAll('input[type=checkbox]').forEach((input, index) => {
      if (preview.querySelectorAll('input[type=checkbox]')[index].checked) input.setAttribute('checked', '');
      else input.removeAttribute('checked');
    });
    source.value = converter.turndown(clone);
    changed('preview');
  }

  function moveHistory(offset) {
    const next = historyIndex + offset;
    if (next < 0 || next >= history.length) return;
    historyIndex = next;
    source.value = history[next];
    render();
    updateStats();
    persist();
  }

  function setMode(mode) {
    $('workspace').dataset.mode = mode;
    document.querySelectorAll('[data-mode]').forEach(button => {
      if (button.tagName === 'BUTTON') button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    if (mode === 'source' && visual) setVisual(false);
    lastEditor = mode === 'preview' ? 'preview' : 'source';
    render();
  }

  function setVisual(enabled) {
    visual = enabled;
    if (enabled && $('workspace').dataset.mode === 'source') setMode('split');
    $('visual-edit').checked = enabled;
    preview.contentEditable = String(enabled);
    preview.setAttribute('aria-label', enabled ? 'プレビューを直接編集' : '文書プレビュー');
    $('preview-hint').textContent = enabled ? '本文をクリックして編集できます' : '印刷時は本文だけを出力します';
    render();
    if (enabled) { lastEditor = 'preview'; preview.focus(); }
  }

  function replaceDocument(text, name) {
    clearTimeout(renderTimer);
    source.value = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    filename.value = name;
    savedText = source.value;
    savedName = name;
    history = [];
    historyIndex = -1;
    record();
    render();
    updateStats();
    persist();
    source.scrollTop = 0;
    preview.parentElement.scrollTop = 0;
  }

  function mayReplace() {
    return !dirty() || confirm('ファイルに保存していない変更があります。現在の下書きを置き換えますか？');
  }

  async function openFile(file) {
    if (!file) return;
    if (!/\.(md|markdown|txt)$/i.test(file.name)) { toast('.md / .markdown / .txt ファイルを選択してください'); return; }
    if (file.size > 2 * 1024 * 1024) { toast('2 MB 以下のファイルを選択してください'); return; }
    try {
      const bytes = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!mayReplace()) return;
      replaceDocument(text, file.name);
      toast(`${file.name} を開きました`);
    } catch { toast('読み込めませんでした。UTF-8で保存したファイルを選択してください'); }
  }

  function save() {
    let name = filename.value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || '無題.md';
    if (!/\.(md|markdown)$/i.test(name)) name += '.md';
    filename.value = name;
    const url = URL.createObjectURL(new Blob([source.value], { type: 'text/markdown;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    savedText = source.value;
    savedName = name;
    updateStats();
    persist();
    toast('Markdownのダウンロードを開始しました');
  }

  function insertSource(kind, url) {
    const start = source.selectionStart;
    const end = source.selectionEnd;
    const selection = source.value.slice(start, end);
    const wrappers = { bold: ['**','**','太字'], italic: ['*','*','斜体'], strike: ['~~','~~','取り消し線'], code: ['`','`','コード'], link: ['[',`](${url || 'https://example.com'})`,'リンク'] };
    if (wrappers[kind]) {
      const [before, after, placeholder] = wrappers[kind];
      const text = selection || placeholder;
      source.setRangeText(before + text + after, start, end, 'select');
      source.setSelectionRange(start + before.length, start + before.length + text.length);
    } else {
      const lineStart = source.value.lastIndexOf('\n', start - 1) + 1;
      const prefix = { h1: '# ', h2: '## ', list: '- ', quote: '> ' }[kind];
      const text = source.value.slice(lineStart, end);
      source.setRangeText(text.split('\n').map(line => prefix + line).join('\n'), lineStart, end, 'select');
    }
    source.focus();
    changed('source');
  }

  function applyFormat(kind) {
    let url;
    if (kind === 'link') {
      url = prompt('リンク先のURL（https:// または mailto:）', 'https://');
      if (!url) return;
      if (!/^(https?:\/\/\S+|mailto:\S+)$/i.test(url)) { toast('HTTP(S) または mailto のURLを入力してください'); return; }
    }
    if (!visual || lastEditor === 'source') {
      if ($('workspace').dataset.mode === 'preview') setMode('split');
      insertSource(kind, url);
      return;
    }
    preview.focus();
    const selection = window.getSelection();
    if (!selection.rangeCount || !preview.contains(selection.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(preview);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    const commands = { bold: ['bold'], italic: ['italic'], strike: ['strikeThrough'], list: ['insertUnorderedList'], h1: ['formatBlock', 'h1'], h2: ['formatBlock', 'h2'], quote: ['formatBlock', 'blockquote'], link: ['createLink', url] };
    if (kind === 'code') {
      const code = document.createElement('code');
      code.textContent = selection.toString() || 'コード';
      document.execCommand('insertHTML', false, code.outerHTML);
    } else {
      const [command, value] = commands[kind];
      document.execCommand(command, false, value);
    }
    visualChanged();
  }

  source.addEventListener('focus', () => { lastEditor = 'source'; });
  preview.addEventListener('focus', () => { lastEditor = 'preview'; });
  source.addEventListener('input', () => { if (!composing) changed('source'); });
  preview.addEventListener('input', () => { if (visual) visualChanged(); });
  for (const editor of [source, preview]) {
    editor.addEventListener('compositionstart', () => { composing = true; });
    editor.addEventListener('compositionend', () => {
      composing = false;
      if (editor === source) changed('source'); else visualChanged();
    });
  }
  preview.addEventListener('change', event => {
    if (visual && event.target.type === 'checkbox') visualChanged();
  });
  preview.addEventListener('click', event => {
    if (visual && event.target.closest('a')) event.preventDefault();
  });
  // Plain text paste keeps clipboard HTML from introducing scripts or unsupported formatting.
  preview.addEventListener('paste', event => {
    if (!visual) return;
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    visualChanged();
  });
  preview.addEventListener('drop', event => { event.preventDefault(); });
  source.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      source.setRangeText('  ', source.selectionStart, source.selectionEnd, 'end');
      changed('source');
    }
  });
  filename.addEventListener('input', () => { updateStats(); persist(); });
  $('visual-edit').addEventListener('change', event => setVisual(event.target.checked));
  document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  document.querySelectorAll('[data-format]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => applyFormat(button.dataset.format));
  });
  $('undo-button').addEventListener('click', () => moveHistory(-1));
  $('redo-button').addEventListener('click', () => moveHistory(1));
  $('new-button').addEventListener('click', () => { if (mayReplace()) { replaceDocument('', '無題.md'); source.focus(); } });
  $('open-button').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', event => { openFile(event.target.files[0]); event.target.value = ''; });
  $('save-button').addEventListener('click', save);
  $('print-button').addEventListener('click', () => { render(); window.print(); });
  window.addEventListener('beforeprint', render);
  $('help-button').addEventListener('click', () => $('help-dialog').showModal());
  $('close-help').addEventListener('click', () => $('help-dialog').close());
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.isComposing || $('help-dialog').open) return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); save(); }
    if (key === 'o') { event.preventDefault(); $('file-input').click(); }
    if ((key === 'z' || key === 'y') && document.activeElement !== filename) {
      event.preventDefault(); moveHistory(key === 'y' || event.shiftKey ? 1 : -1);
    }
    if (key === 'p') render();
  });
  let dragDepth = 0;
  document.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
  document.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
  document.addEventListener('dragleave', () => { if (--dragDepth <= 0) document.body.classList.remove('dragging'); });
  document.addEventListener('drop', event => {
    event.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    if (event.dataTransfer.files.length) openFile(event.dataTransfer.files[0]);
  });
  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', event => {
    persist();
    if (dirty() && !storageAvailable) { event.preventDefault(); event.returnValue = ''; }
  });

  let draft;
  try { draft = JSON.parse(localStorage.getItem(storageKey)); } catch { /* Storage may be disabled. */ }
  source.value = typeof draft?.text === 'string' ? draft.text : example;
  if (typeof draft?.name === 'string') filename.value = draft.name;
  if (typeof draft?.savedText === 'string') savedText = draft.savedText;
  if (typeof draft?.savedName === 'string') savedName = draft.savedName;
  record();
  render();
  updateStats();
  persist();
})();
