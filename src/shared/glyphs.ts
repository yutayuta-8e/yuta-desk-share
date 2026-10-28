/**
 * Launcher marks the owner can give each app instead of its extracted icon (2026-10-26: "どれか
 * ホバーしなくても分かるように、番号でもリンゴやお花でも"). Drawn as lines of light in the renderer
 * (renderer/src/light/glyphPaths.ts); ids and Japanese labels live here so the menu can list them.
 */
export const GLYPHS: { id: string; label: string }[] = [
  { id: 'apple', label: 'りんご' },
  { id: 'flower', label: 'お花' },
  { id: 'star', label: '星' },
  { id: 'heart', label: 'ハート' },
  { id: 'moon', label: '月' },
  { id: 'sun', label: '太陽' },
  { id: 'note', label: '音符' },
  { id: 'film', label: 'フィルム' },
  { id: 'camera', label: 'カメラ' },
  { id: 'mail', label: '手紙' },
  { id: 'chat', label: 'ふきだし' },
  { id: 'book', label: '本' },
  { id: 'leaf', label: '葉っぱ' },
  { id: 'drop', label: 'しずく' },
  { id: 'cat', label: 'ねこ' },
  { id: 'house', label: 'おうち' },
  { id: 'folder', label: 'フォルダ' },
  { id: 'code', label: 'コード' },
  // added 2026-10-28 for screenshots, where the apps' logos are hidden (original drawings, not logos)
  { id: 'globe', label: '地球' },
  { id: 'wand', label: 'まほうのつえ' },
  { id: 'terminal', label: 'ターミナル' },
  { id: 'robot', label: 'ロボット' },
  { id: 'key', label: 'かぎ' },
  { id: 'headset', label: 'ヘッドセット' },
  { id: 'clapper', label: 'カチンコ' },
  { id: 'box', label: 'はこ' }
]

/** Numbers use the clock's own digits. */
export const GLYPH_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
