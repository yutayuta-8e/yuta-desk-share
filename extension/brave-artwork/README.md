# yuta-desk artwork

Brave が Windows に渡すサムネは 150px ほどしかない。この拡張は、再生中のページが持っている大きい絵の URL を、同じ PC の yuta-desk に渡す。

## 入れ方

1. Brave で `brave://extensions` を開く。
2. 右上の「デベロッパーモード」を入れる。
3. 「パッケージ化されていない拡張機能を読み込む」を押し、このフォルダを選ぶ。

## 読むものと送るもの

- 読むのは、下のサイトのページの `navigator.mediaSession.metadata`（曲名と絵の URL）だけ。
- 送り先は同じ PC の `http://127.0.0.1:47823/artwork` だけで、外には送らない。
- 動くサイト: YouTube、YouTube Music、SoundCloud、Spotify、Apple Music、ニコニコ動画、Bandcamp（`manifest.json` の `matches`）。

yuta-desk は、受け取った URL の絵を読めるか確かめて、再生中の曲名と同じときだけ表示する。YouTube は同じ動画のいちばん大きい絵（`maxresdefault`、無ければ `sddefault`）を試す。
