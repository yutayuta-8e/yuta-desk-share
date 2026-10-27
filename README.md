# yuta-desk

Windows 11 のデスクトップに常駐するウィジェット群とデスクトップペット。壁紙の上に「光の線」だけで時計・カレンダー・タスク・バッテリー・AI の使用状況・ランチャーを描く。Electron + TypeScript + React。

- 仕様と決めたことの記録: [docs/SPEC.md](docs/SPEC.md)
- デザインの方針: [docs/design/brief-v2.md](docs/design/brief-v2.md)
- Google カレンダー接続: [docs/GOOGLE-OAUTH.md](docs/GOOGLE-OAUTH.md)
- 状態: 2026-10-26 時点で第2弾まで実装。作者の PC 1 台で使っている個人用のアプリ。

## 前提（作者以外の PC で動かす場合）

- Windows 11 専用（デスクトップ層への貼り付けに Win32 API を使う）。画面は 1 枚、125% 表示で確認している。
- タスク: Markdown のタスクファイル（設定 `tasks.vaultTaskFile`）を読む。済にする操作は作者の CLI `yuta`（`~/.local/bin/yuta.exe`）を呼ぶので、無い環境では読むだけになる。
- AI の使用状況: Claude Code の 5 時間枠と 1 週間枠。Claude Code 自身が出す数字だけを使う。ターミナルの claude が動いているときはステータスライン（`scripts/claude-statusline.js`）から、ほかは 15 分に 1 回まで `claude -p /usage` を動かして読む（モデルは呼ばないのでトークンを使わない）。PC を 10 分さわっていないときと画面ロック中は動かさない。yuta-desk はログイン情報を読まず、提供元にも直接問い合わせない。`/usage` の出力の形は Claude Code 側で「試験的」とされていて、変わると表示されなくなることがある。
- Google カレンダー: 自分の OAuth クライアントを作って接続する（手順は docs/GOOGLE-OAUTH.md）。
- SoundCloud の入口: 自分の「いいね」を流すには、設定ファイル `%APPDATA%\yuta-desk\config.json` の `media.soundcloudUrl` に `https://api.soundcloud.com/users/<ユーザー番号>/favorites` を書く（ページの住所 `/likes` では流れない）。書かないと入口は出ない。
- 壁紙は Windows の設定のものをそのまま読む。

## 動かす

```
npm install
npm run build
npm start
```

トレイアイコン（タスクバー右下）から終了・再読み込み・自動起動の切り替え・設定ファイルを開ける。各ウィジェットは右クリックでサイズや表示/非表示を変えられる。移動は長押しで編集モードに入ってからドラッグし、位置は記憶される。

開発中の自動リロードは `npm run dev`（electron-vite）。ただし dev サーバは main の変更でアプリを再起動するため、起動の重複に注意する（単一インスタンス制約で新しい方が終了する）。

## 設定

`%APPDATA%\yuta-desk\config.json`。ランチャーの登録は `launcher.items` に `{ "name", "path" }` を並べる。グリッドは `launcher.rows` / `launcher.cols`（右クリックからも変更可）。

## 仕組みのメモ

- ウィジェットは透明なフレームレス窓を `Progman`（デスクトップ）の子にして置く。Win+D や最大化で隠れず、常に最前面にも出ない。
  - 子にするときは `WS_CHILD` を付ける。付けないとマウスのクリックが届かない（ホバーだけ届く）。
  - 貼り付けた後は Electron の `setPosition` / `setBounds` を使わない。DPI 換算が二重にかかって窓が伸びる。移動・サイズは `SetWindowPos` を直接呼ぶ（`src/main/desktopLayer.ts`）。
- 精密タッチパッドのスクロール（DirectManipulation）はデスクトップ内の窓には一切届かない（OS のマウスフックにも出ない）。そのため、カーソルがウィジェットの上にある間だけ透明な通常ウィンドウ（受け皿）を真上に重ね、そこで受けたクリック・ドラッグ・ホイールを `webContents.sendInputEvent` でウィジェットへ転送する（`src/main/catcher.ts`）。他のアプリがその位置を覆っているときは OS のヒットテストで判定して受け皿を出さない。
- OS のアクリル効果はこの層では効かないため、壁紙ファイルを読んで窓の中に同じ位置で描き、CSS でぼかして「ガラス」にする（`src/renderer/src/Glass.tsx`）。壁紙のスライドショーにも追従する。
- 自動起動は Startup フォルダのショートカット（`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\yuta-desk.lnk`）。Electron の `setLoginItemSettings`（Run レジストリ）はこの PC ではログイン時に実行されなかった（2026-10-25 確認）。トレイの「自動起動」でショートカットを作成・削除する。
- 2026-10-26 から全ウィジェットは「呼吸する光」（`src/renderer/src/light/`）で描く。文字は HTML、数字は一筆書きの SVG、ペットはキャンバスの線。旧 3D ガラス版のコードと three.js は 2026-10-26 に外した（git の履歴に残っている）。テスト用に `YD_BG=<docs/mockups 内の画像、または画像の絶対パス>` を付けると、その画像を壁紙の位置に敷いて明るさと色もそこから取る（Windows の壁紙は変えない）。`YD_DIGITS=1` で全数字。`YD_TIME="11:11,17:47"` で時計にその時刻を 4 秒ずつ順番に表示し、`YD_NOKERN=1` でカーニングを切り、`YD_KERN=8,0.85,0.7` で詰め具合を上書きする。`YD_PETDEMO=1` でペットを速く動かし、`YD_TASK_DRYRUN=1` でタスクの済を試しだけにし、`YD_TASKSTYLE=1`〜`5` でタスクの見た目を切り替え、`YD_HOUR=7.5` で時間帯を固定する。`YD_DEMO_TASKS=1`／`YD_DEMO_CALENDAR=1` で仮のタスクと予定を出し（スクショ用）、`YUTA_VAULT=<テスト用 Vault>` でタスクの読み書き先を差し替え、`YD_MEDIA_IGNORE_APPS=1`・`YD_MEDIA_MUTE=1`・`YD_SC_AUTOSTART=1` で再生ウィジェットを試す（いずれも確認用）。
- 検証用の実験スクリプトは `scripts/exp-*.js`（`npx electron scripts/exp-input.js`）。
- `docs/mockups` には現行デザイン（v2）の確認画像だけを置いている。開発途中の画像や参考画像は、個人の画面や他者の絵が写っているため共有前に外した。`docs/goals` と `docs/SPEC.md` の経緯の記録には、その外した画像の名前が出てくる。
