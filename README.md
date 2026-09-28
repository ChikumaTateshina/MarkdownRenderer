# Markdown Desk

Markdownファイルを開いて、編集して、印刷するための軽量なブラウザーアプリです。
HTML・CSS・JavaScriptだけで動作し、アカウント、バックエンド、ビルドは不要です。GitHub Pagesにそのまま公開できます。

[アプリを開く](https://chikumatateshina.github.io/MarkdownRenderer/) · [GitHubリポジトリ](https://github.com/ChikumaTateshina/MarkdownRenderer)

## できること

- UTF-8の `.md` / `.markdown` / `.txt` を開く（ドラッグ＆ドロップ対応、最大2 MB）
- ソース編集とリアルタイムプレビュー
- プレビュー本文の直接編集とMarkdownへの反映
- ソースのみ・並列表示・プレビューのみの切り替え
- 見出し、太字、斜体、取り消し線、箇条書き、引用、コード、リンクの書式ツール
- 表、タスクリスト、言語付きコードブロックの表示
- 元に戻す・やり直す（最大100状態）
- Markdownファイルとしてダウンロード
- ブラウザー内への下書き自動保存・再読み込み時の復元
- 本文だけを印刷、ブラウザーの印刷画面からPDF保存
- スマートフォンの画面幅に対応

## すぐに使う

このリポジトリをダウンロードし、`index.html` をブラウザーで開いてください。ライブラリーは `vendor/` に同梱しているため、インストールやCDN接続は不要です。

「開く」からファイルを選ぶか、画面にファイルをドロップします。左側でMarkdownを書き、右側で表示を確認できます。「プレビューを編集」をオンにすると表示結果を直接編集できます。

**「保存」はダウンロードです。元のファイルを直接上書きしません。** ファイル名は画面上部で変更できます。

### GitHub Pagesで公開

1. このフォルダーの内容をGitHubリポジトリの `main` ブランチへpushします。`vendor/` と `.github/workflows/pages.yml` も含めてください。
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に変更します。
3. **Actions → Deploy to GitHub Pages → Run workflow** を実行します。以後、`main` へのpushで自動更新されます。
4. Actionsのデプロイ結果、またはSettingsのPages画面に表示されるURLを開きます。

公開先の例は `https://<ユーザー名>.github.io/<リポジトリ名>/` です。パスはすべて相対指定のため、リポジトリ名に応じたコード変更は不要です。デフォルトブランチが `main` 以外の場合はワークフローの `branches` を変更してください。

公開するのはアプリの静的ファイルだけです。利用者が開く文書や下書きはGitHubにはアップロードされません。

公式手順：[GitHub Pagesの公開元を設定する](https://docs.github.com/ja/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

### 印刷

「印刷 / PDF」または `Ctrl / ⌘ + P` を使用します。編集用ボタンやソース欄は印刷されません。用紙サイズ、向き、倍率、ヘッダー・フッター、PDF出力先はブラウザーの印刷画面で設定してください。

### キーボード

| 操作 | ショートカット |
| --- | --- |
| 開く | Ctrl / ⌘ + O |
| 保存 | Ctrl / ⌘ + S |
| 印刷 | Ctrl / ⌘ + P |
| 元に戻す | Ctrl / ⌘ + Z |
| やり直す | Ctrl / ⌘ + Shift + Z または Ctrl + Y |
| ソースにスペース2個を挿入 | Tab |

## 仕様と制約

- 一度に1文書を扱います。下書きは同じブラウザー・同じオリジン内の `localStorage` に保存します。複数タブでの同時編集・同期には対応しません。
- ローカルファイルとして開く場合の保存領域はブラウザーによって異なります。プライベートモードや保存容量不足では自動保存できないことがあり、画面で通知します。大切な内容はファイルとして保存してください。
- ソース編集・表示モード切り替えだけではMarkdownを再変換しません。プレビュー本文を編集すると、HTMLからMarkdownを生成するため、空白、箇条書き、強調などの表記は整えられます。見た目を編集する方式のため、コメント、参照リンク定義、独自記法、複雑なHTMLなどの元の表記は保持できません。これらはソースで編集してください。
- 数式描画、Mermaid、コードのシンタックスハイライト、ローカル画像添付は非対応です。
- 画像にはHTTP(S)の絶対URLを使用してください。相対パスや `file:` の画像は表示しません。外部画像を含む文書は画像の取得先へ通信します。HTTPSで公開する場合はHTTPS画像を推奨します。
- 実行可能なHTML、イベント属性、危険なURLは除去します。貼り付けはプレーンテキストとして扱います。画像URLを除き、文書の処理に外部サービスを使用しません。
- 読み込み後は外部画像以外をオフラインで使用できます。GitHub Pages版の初回アクセス・再読み込みには接続が必要です。完全にオフラインで起動したい場合はリポジトリをダウンロードしてください。
- 最新のChrome / Edge / Firefox / Safariを想定しています。自動テストはChromiumで実施しています。直接編集の書式操作はブラウザーの `contenteditable` / `execCommand` を使用するため、細部はブラウザーに依存します。

## 開発

通常の利用・公開にはNode.jsは不要です。依存ライブラリー更新やテストにはNode.js 22以上を使用してください。

```sh
npm ci
npm start
```

`http://127.0.0.1:4173` を開きます。開発用サーバーはローカル接続だけを受け付けます。

```sh
# ブラウザーを初回だけ取得
npx playwright install chromium

# 編集・ファイル保存・印刷レイアウトなどを確認
npm test

# 依存ライブラリーを更新した後にブラウザー用ファイルを同期
npm run vendor
```

依存ライブラリーはバージョンを固定し、`package-lock.json` を含めています。変更時は `vendor/` と `THIRD_PARTY_NOTICES.md` もコミットしてください。CIでブラウザーテストを実行します。

| ファイル | 役割 |
| --- | --- |
| `index.html` | 操作画面 |
| `styles.css` | 画面・モバイル・印刷スタイル |
| `app.js` | 編集・変換・保存 |
| `vendor/` | 同梱ライブラリーと各ライセンス |
| `scripts/` | 開発用サーバー・ライブラリー同期 |
| `tests/` | Playwrightのブラウザーテスト |
| `.github/workflows/` | テストとGitHub Pages公開 |

## ライセンス

アプリは [MIT License](LICENSE) です。Markdown変換に [Marked](https://marked.js.org/)、安全なHTML表示に [DOMPurify](https://github.com/cure53/DOMPurify)、HTMLからMarkdownへの変換に [Turndown](https://github.com/mixmark-io/turndown) とGFMプラグインを使用しています。同梱ライブラリーの条件は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
