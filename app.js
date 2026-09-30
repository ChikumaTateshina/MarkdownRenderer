/* Browser-only application. All libraries are shipped in vendor/. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const source = $('source');
  const preview = $('preview');
  const filename = $('filename');
  const storageKey = 'markdown-desk:tabs:v2';
  const legacyStorageKey = 'markdown-desk:draft:v1';
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
  let documents = [];
  let activeId;
  let nextId = 0;
  const currentDocument = () => documents.find(doc => doc.id === activeId);
  const currentLanguage = () => currentDocument()?.language === 'auto' ? DeskFiles.language(filename.value) : (currentDocument()?.language || DeskFiles.language(filename.value));
  const isBinaryView = () => currentDocument()?.kind === 'binary' || currentDocument()?.hexView;
  const isMarkdown = () => !isBinaryView() && currentLanguage() === 'markdown';
  for (const [value, name] of Object.entries(DeskFiles.languages)) {
    $('language-mode').add(new Option(name, value));
  }
  const dirty = () => source.value !== savedText || filename.value !== savedName;
  const documentDirty = doc => doc.text !== doc.savedText || doc.name !== doc.savedName;

  function createDocument(text, name, saved = {}) {
    return {
      id: ++nextId, text, name,
      kind: 'text', bytes: null, language: 'auto', hexView: false, hexOffset: 0, bom: false, eol: '\n',
      savedText: typeof saved.savedText === 'string' ? saved.savedText : text,
      savedName: typeof saved.savedName === 'string' ? saved.savedName : name,
      history: [text], historyIndex: 0, mode: 'split', visual: false,
      selectionStart: 0, selectionEnd: 0, sourceScroll: 0, previewScroll: 0,
    };
  }

  function captureDocument() {
    const doc = documents.find(doc => doc.id === activeId);
    if (!doc) return;
    Object.assign(doc, {
      text: source.value, name: filename.value, savedText, savedName,
      history, historyIndex, mode: $('workspace').dataset.mode, visual,
      selectionStart: source.selectionStart, selectionEnd: source.selectionEnd,
      sourceScroll: source.scrollTop, previewScroll: preview.parentElement.scrollTop,
    });
  }

  function renderTabs() {
    captureDocument();
    $('file-tabs').replaceChildren(...documents.map(doc => {
      const group = document.createElement('div');
      group.className = 'file-tab' + (doc.id === activeId ? ' active' : '');
      group.setAttribute('role', 'presentation');
      const tab = document.createElement('button');
      tab.id = `file-tab-${doc.id}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(doc.id === activeId));
      tab.tabIndex = doc.id === activeId ? 0 : -1;
      tab.textContent = `${documentDirty(doc) ? '● ' : ''}${doc.name || '無題.md'}`;
      tab.title = doc.name || '無題.md';
      tab.addEventListener('click', () => switchDocument(doc.id));
      tab.addEventListener('keydown', event => {
        const index = documents.findIndex(item => item.id === doc.id);
        let target;
        if (event.key === 'ArrowRight') target = (index + 1) % documents.length;
        if (event.key === 'ArrowLeft') target = (index - 1 + documents.length) % documents.length;
        if (event.key === 'Home') target = 0;
        if (event.key === 'End') target = documents.length - 1;
        if (target !== undefined) { event.preventDefault(); switchDocument(documents[target].id); }
      });
      const close = document.createElement('button');
      close.className = 'close-tab';
      close.textContent = '×';
      close.setAttribute('aria-label', `${doc.name || '無題.md'}を閉じる`);
      close.addEventListener('click', () => closeDocument(doc.id));
      group.append(tab, close);
      return group;
    }));
  }

  function switchDocument(id) {
    captureDocument();
    activateDocument(id);
  }

  function activateDocument(id) {
    const doc = documents.find(doc => doc.id === id);
    if (!doc) return;
    clearTimeout(renderTimer);
    clearTimeout(persistTimer);
    activeId = id;
    source.value = doc.text;
    $('language-mode').value = doc.language;
    filename.value = doc.name;
    savedText = doc.savedText;
    savedName = doc.savedName;
    history = doc.history;
    historyIndex = doc.historyIndex;
    visual = doc.visual;
    // Apply the saved mode without overwriting the outgoing document.
    setMode(doc.mode);
    setVisual(doc.visual);
    source.setSelectionRange(doc.selectionStart, doc.selectionEnd);
    source.scrollTop = doc.sourceScroll;
    preview.parentElement.scrollTop = doc.previewScroll;
    updateStats();
    persist();
    const tab = $(`file-tab-${id}`);
    tab.focus({ preventScroll: true });
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function closeDocument(id) {
    captureDocument();
    const index = documents.findIndex(doc => doc.id === id);
    const doc = documents[index];
    if (!doc) return;
    if (documentDirty(doc) && !confirm(`「${doc.name || '無題.md'}」にはファイルに保存していない変更があります。このタブを閉じますか？`)) return;
    documents.splice(index, 1);
    if (!documents.length) documents.push(createDocument('', '無題.md'));
    if (id === activeId) activateDocument(documents[Math.min(index, documents.length - 1)].id);
    else { renderTabs(); persist(); }
  }

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
    const doc = currentDocument();
    if (!doc) return;
    const binary = isBinaryView();
    const markdown = isMarkdown();
    $('workspace').dataset.binary = String(Boolean(binary));
    $('binary-pane').hidden = !binary;
    $('hex-toggle').setAttribute('aria-pressed', String(Boolean(binary)));
    $('hex-toggle').disabled = doc.kind === 'binary';
    $('language-mode').disabled = doc.kind === 'binary';
    $('visual-edit').disabled = !markdown;
    document.querySelectorAll('[data-format]').forEach(button => { button.disabled = !markdown; });
    document.querySelectorAll('button[data-mode]').forEach(button => { button.disabled = Boolean(binary); });
    source.disabled = doc.kind === 'binary';
    if (!markdown) {
      visual = false;
      $('visual-edit').checked = false;
      preview.contentEditable = 'false';
    }
    preview.classList.toggle('code-preview', !markdown);
    paintSource();
    if (binary) { renderHex(); return; }
    if (!markdown) {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.innerHTML = $('highlight-toggle').checked ? DeskFiles.highlight(source.value, currentLanguage()) : DeskFiles.escape(source.value);
      pre.append(code);
      preview.replaceChildren(pre);
      return;
    }
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
    if ($('highlight-toggle').checked && !visual) {
      preview.querySelectorAll('pre code').forEach(code => {
        const lang = (code.className.match(/language-([\w+-]+)/) || [,''])[1];
        const alias = { js: 'javascript', ts: 'typescript', py: 'python', html: 'markup', xml: 'markup', sh: 'bash', yml: 'yaml' };
        code.innerHTML = DeskFiles.highlight(code.textContent, alias[lang] || lang);
      });
    }
  }

  function paintSource(plain = false) {
    const lang = currentLanguage();
    const enabled = $('highlight-toggle').checked && source.value.length <= DeskFiles.highlightLimit && Boolean(Prism.languages[lang]) && !isBinaryView();
    source.parentElement.classList.toggle('highlighted', enabled);
    const layer = $('source-highlight');
    if (enabled) layer.innerHTML = (plain ? DeskFiles.escape(source.value) : DeskFiles.highlight(source.value, lang)) + '\n';
    else layer.textContent = '';
    layer.scrollTop = source.scrollTop;
    layer.scrollLeft = source.scrollLeft;
  }

  function fileBytes() {
    const doc = currentDocument();
    if (doc.kind === 'binary') return doc.bytes;
    return new TextEncoder().encode((doc.bom ? '\uFEFF' : '') + source.value.replace(/\n/g, doc.eol));
  }

  function renderHex() {
    const doc = currentDocument();
    const bytes = fileBytes();
    doc.hexOffset = Math.max(0, Math.min(Math.floor(doc.hexOffset / 256) * 256, Math.max(0, Math.ceil(bytes.length / 256) - 1) * 256));
    $('hex-content').textContent = DeskFiles.hexPage(bytes, doc.hexOffset);
    $('hex-offset').value = '0x' + doc.hexOffset.toString(16).toUpperCase();
    $('hex-page').textContent = `${bytes.length ? doc.hexOffset + 1 : 0}–${Math.min(bytes.length, doc.hexOffset + 256)} / ${bytes.length.toLocaleString('ja-JP')} bytes`;
    $('hex-prev').disabled = doc.hexOffset === 0;
    $('hex-next').disabled = doc.hexOffset + 256 >= bytes.length;
  }

  function updateStats() {
    $('document-stats').textContent = `${Array.from(source.value).length.toLocaleString('ja-JP')} 文字 · ${source.value.split('\n').length.toLocaleString('ja-JP')} 行`;
    if (currentDocument()?.kind === 'binary') $('document-stats').textContent = `${currentDocument().bytes.length.toLocaleString('ja-JP')} bytes · 閲覧専用`;
    $('file-info').textContent = currentDocument()?.kind === 'binary' ? 'バイナリ · 再読み込みで閉じます' : `${DeskFiles.languages[currentLanguage()] || 'テキスト'} · UTF-8${currentDocument()?.bom ? ' BOM' : ''}${source.value.length > DeskFiles.highlightLimit ? ' · 大きな文書のハイライトを省略' : ''}`;
    $('undo-button').disabled = isBinaryView() || historyIndex <= 0;
    $('redo-button').disabled = isBinaryView() || historyIndex >= history.length - 1;
    document.title = `${dirty() ? '• ' : ''}${filename.value || '無題.md'} — Markdown Desk`;
    renderTabs();
  }

  function persist() {
    clearTimeout(persistTimer);
    try {
      captureDocument();
      const textDocuments = documents.filter(doc => doc.kind !== 'binary');
      localStorage.setItem(storageKey, JSON.stringify({
        activeIndex: Math.max(0, textDocuments.findIndex(doc => doc.id === activeId)),
        documents: textDocuments.map(({ text, name, savedText, savedName, mode, visual, language, hexView, bom, eol }) => ({ text, name, savedText, savedName, mode, visual, language, hexView, bom, eol })),
      }));
      localStorage.removeItem(legacyStorageKey);
      storageAvailable = true;
      $('save-status').textContent = dirty() ? '下書きを端末に保存済み · ファイル未保存' : '下書きを端末に保存済み';
      if (currentDocument()?.kind === 'binary') $('save-status').textContent = 'バイナリの内容は下書き保存されません';
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
    paintSource(origin !== 'preview');
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
    if (composing || !visual || !isMarkdown()) return;
    const clone = preview.cloneNode(true);
    clone.querySelectorAll('input[type=checkbox]').forEach((input, index) => {
      if (preview.querySelectorAll('input[type=checkbox]')[index].checked) input.setAttribute('checked', '');
      else input.removeAttribute('checked');
    });
    source.value = converter.turndown(clone);
    changed('preview');
  }

  function moveHistory(offset) {
    if (isBinaryView()) return;
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
    enabled = enabled && isMarkdown();
    visual = enabled;
    if (enabled && $('workspace').dataset.mode === 'source') setMode('split');
    $('visual-edit').checked = enabled;
    preview.contentEditable = String(enabled);
    preview.setAttribute('aria-label', enabled ? 'プレビューを直接編集' : '文書プレビュー');
    $('preview-hint').textContent = enabled ? '本文をクリックして編集できます' : '印刷時は本文だけを出力します';
    render();
    if (enabled) { lastEditor = 'preview'; preview.focus(); }
  }

  function addDocument(text, name, options = {}) {
    captureDocument();
    const doc = createDocument(text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'), name);
    Object.assign(doc, options);
    if (DeskFiles.language(name) !== 'markdown') doc.mode = 'source';
    documents.push(doc);
    activateDocument(doc.id);
  }

  async function openFile(file) {
    if (!file) return;
    if (file.size > 32 * 1024 * 1024) { toast('32 MB 以下のファイルを選択してください'); return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = DeskFiles.classify(bytes, file.name);
      if (result.kind === 'binary') addDocument('', file.name, { kind: 'binary', bytes });
      else {
        if (file.size > 2 * 1024 * 1024) { toast('テキスト編集は2 MB以下に対応しています'); return; }
        addDocument(result.text, file.name, { bom: result.bom, eol: result.text.includes('\r\n') ? '\r\n' : result.text.includes('\r') ? '\r' : '\n' });
      }
      toast(`${file.name} を開きました`);
    } catch { toast('ファイルを読み込めませんでした'); }
  }

  let openQueue = Promise.resolve();
  function openFiles(files) {
    const batch = Array.from(files);
    openQueue = openQueue.then(async () => { for (const file of batch) await openFile(file); });
  }

  function save() {
    let name = filename.value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') || '無題.md';
    filename.value = name;
    const url = URL.createObjectURL(new Blob([fileBytes()], { type: 'application/octet-stream' }));
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
    toast('ファイルのダウンロードを開始しました');
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
    if (!isMarkdown()) return;
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
  source.addEventListener('scroll', () => {
    $('source-highlight').scrollTop = source.scrollTop;
    $('source-highlight').scrollLeft = source.scrollLeft;
  });
  preview.addEventListener('focus', () => { lastEditor = 'preview'; });
  source.addEventListener('input', () => { if (!composing) changed('source'); else paintSource(true); });
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
  filename.addEventListener('input', () => { render(); updateStats(); persist(); });
  $('language-mode').addEventListener('change', event => {
    currentDocument().language = event.target.value;
    render(); updateStats(); persist();
  });
  $('highlight-toggle').addEventListener('change', render);
  $('hex-toggle').addEventListener('click', () => {
    currentDocument().hexView = !currentDocument().hexView;
    render(); updateStats(); persist();
  });
  $('hex-prev').addEventListener('click', () => { currentDocument().hexOffset -= 256; renderHex(); });
  $('hex-next').addEventListener('click', () => { currentDocument().hexOffset += 256; renderHex(); });
  function jumpHex() {
    const value = $('hex-offset').value.trim();
    const offset = /^(0x[0-9a-f]+|\d+)$/i.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= fileBytes().length) { toast('ファイル内のオフセットを10進数または0x付き16進数で入力してください'); return; }
    currentDocument().hexOffset = offset;
    renderHex();
  }
  $('hex-go').addEventListener('click', jumpHex);
  $('hex-offset').addEventListener('keydown', event => { if (event.key === 'Enter') jumpHex(); });
  $('visual-edit').addEventListener('change', event => setVisual(event.target.checked));
  document.querySelectorAll('button[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  document.querySelectorAll('[data-format]').forEach(button => {
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => applyFormat(button.dataset.format));
  });
  $('undo-button').addEventListener('click', () => moveHistory(-1));
  $('redo-button').addEventListener('click', () => moveHistory(1));
  $('new-button').addEventListener('click', () => { addDocument('', '無題.md'); source.focus(); });
  $('open-button').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', event => { openFiles(event.target.files); event.target.value = ''; });
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
    if ((key === 'z' || key === 'y') && document.activeElement !== filename && document.activeElement !== $('hex-offset')) {
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
    if (event.dataTransfer.files.length) openFiles(event.dataTransfer.files);
  });
  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', event => {
    persist();
    if (documents.some(documentDirty) && !storageAvailable) { event.preventDefault(); event.returnValue = ''; }
  });

  let session;
  let legacy;
  try {
    session = JSON.parse(localStorage.getItem(storageKey));
    legacy = JSON.parse(localStorage.getItem(legacyStorageKey));
  } catch { /* Storage may be disabled. */ }
  if (Array.isArray(session?.documents)) {
    documents = session.documents.filter(doc => doc && typeof doc.text === 'string' && typeof doc.name === 'string').map(doc => {
      const restored = createDocument(doc.text, doc.name, doc);
      restored.language = doc.language === 'auto' || Object.hasOwn(DeskFiles.languages, doc.language) ? doc.language : 'auto';
      restored.hexView = doc.hexView === true;
      restored.bom = doc.bom === true;
      restored.eol = ['\n', '\r\n', '\r'].includes(doc.eol) ? doc.eol : '\n';
      restored.mode = ['source', 'split', 'preview'].includes(doc.mode) ? doc.mode : 'split';
      restored.visual = doc.visual === true && restored.mode !== 'source';
      return restored;
    });
  }
  if (!documents.length) {
    documents.push(typeof legacy?.text === 'string'
      ? createDocument(legacy.text, typeof legacy.name === 'string' ? legacy.name : '無題.md', legacy)
      : createDocument(example, filename.value));
  }
  const index = Number.isInteger(session?.activeIndex) ? Math.max(0, Math.min(session.activeIndex, documents.length - 1)) : 0;
  activateDocument(documents[index].id);
})();
