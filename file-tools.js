/* File classification and highlighting. No document contents leave the browser. */
(() => {
  const languages = {
    markdown: 'Markdown', plaintext: 'テキスト', python: 'Python', javascript: 'JavaScript', typescript: 'TypeScript',
    markup: 'HTML / XML', css: 'CSS', json: 'JSON', yaml: 'YAML', bash: 'Shell', powershell: 'PowerShell',
    c: 'C', cpp: 'C++', csharp: 'C#', java: 'Java', go: 'Go', rust: 'Rust', sql: 'SQL', ruby: 'Ruby', ini: 'INI', diff: 'Diff',
  };
  const extensions = {
    md: 'markdown', markdown: 'markdown', mdown: 'markdown', py: 'python', pyw: 'python',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
    html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup', css: 'css', json: 'json', jsonc: 'javascript',
    yml: 'yaml', yaml: 'yaml', sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', psm1: 'powershell',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp', java: 'java',
    go: 'go', rs: 'rust', sql: 'sql', rb: 'ruby', ini: 'ini', toml: 'ini', diff: 'diff', patch: 'diff',
  };
  const binaryExtensions = new Set('bin exe dll so dylib png jpg jpeg gif webp ico pdf zip gz 7z rar tar mp3 mp4 wav ogg woff woff2 ttf otf sqlite db wasm class pyc'.split(' '));
  const extension = name => name.toLowerCase().split('.').pop();
  const language = name => extensions[extension(name)] || 'plaintext';
  const escape = text => text.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]);
  const highlightLimit = 100000;
  function highlight(text, lang) {
    if (text.length > highlightLimit || !Prism.languages[lang]) return escape(text);
    try { return Prism.highlight(text, Prism.languages[lang], lang); } catch { return escape(text); }
  }
  function classify(bytes, name) {
    if (binaryExtensions.has(extension(name))) return { kind: 'binary' };
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) return { kind: 'binary' };
      return { kind: 'text', text, bom: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf };
    } catch { return { kind: 'binary' }; }
  }
  function hexPage(bytes, offset) {
    const lines = ['OFFSET    00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F  ASCII'];
    for (let i = offset; i < Math.min(bytes.length, offset + 256); i += 16) {
      const row = bytes.subarray(i, i + 16);
      const hex = Array.from(row, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ').padEnd(47);
      const ascii = Array.from(row, b => b >= 32 && b <= 126 ? String.fromCharCode(b) : '.').join('');
      lines.push(`${i.toString(16).padStart(8, '0').toUpperCase()}  ${hex}  ${ascii}`);
    }
    return lines.join('\n');
  }
  window.DeskFiles = { languages, language, highlight, highlightLimit, classify, hexPage, escape };

  const picker = document.getElementById('theme');
  const media = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    document.documentElement.dataset.theme = picker.value === 'system' ? (media.matches ? 'dark' : 'light') : picker.value;
  }
  try { const value = localStorage.getItem('markdown-desk:theme'); if (['system', 'light', 'dark', 'contrast'].includes(value)) picker.value = value; } catch {}
  picker.addEventListener('change', () => {
    applyTheme();
    try { localStorage.setItem('markdown-desk:theme', picker.value); } catch {}
  });
  media.addEventListener('change', applyTheme);
  applyTheme();
})();
