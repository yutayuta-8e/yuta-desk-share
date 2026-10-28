// Letters and digits in Handlee; kana and kanji stay in Zen Kurenaido (the owner chose 9 Handlee, 2026-10-28).
// The CSS puts the family 'YD Latin' first: it has only Latin glyphs, so everything else falls through
// to Zen Kurenaido. The file is registered twice under that name, split by unicode-range, so the browser
// sizes each character by its side. 86% puts Handlee's x-height on Zen Kurenaido's own Latin (measured
// for the demo); the owner asked for the letters 5% and the digits 10% larger than that.
import handlee from '@fontsource/handlee/files/handlee-latin-400-normal.woff2?url'

const FIT = 86
const SIDES = [
  { range: 'U+0000-002F, U+003A-10FFFF', size: FIT * 1.05 }, // letters and the rest of the Latin set
  { range: 'U+0030-0039', size: FIT * 1.1 } // 0-9
]

let added = false

/** Registers 'YD Latin' in this window; main.tsx calls it once at start-up. */
export function addLatinFont(): void {
  if (added) return
  added = true
  for (const s of SIDES) {
    // sizeAdjust is not in this TypeScript's FontFaceDescriptors yet; Chromium supports it
    const descriptors: Record<string, string> = { unicodeRange: s.range, sizeAdjust: `${s.size.toFixed(1)}%` }
    const face = new FontFace('YD Latin', `url(${handlee})`, descriptors as FontFaceDescriptors)
    document.fonts.add(face)
    void face.load().catch(() => { /* stays in Zen Kurenaido */ })
  }
}
