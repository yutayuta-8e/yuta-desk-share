import { useEffect, useState } from 'react'
import type { Bounds, WallpaperInfo } from '@shared/types'

/**
 * Test harness only (YD_BG=<file in docs/mockups, or an absolute path to any image>): draws that image under the widget exactly where
 * it would sit if it were the wallpaper, and derives the light mode and accent from it. Lets the
 * look be checked on bright and dark wallpapers without touching the real Windows wallpaper.
 */
export const TEST_BG = new URLSearchParams(location.search).get('bg')
const src = !TEST_BG ? '' : /^([a-zA-Z]:[\\/]|\/)/.test(TEST_BG) ? 'yd://testbg/current' : `yd://mock/${TEST_BG}`

let probe: Promise<{ w: number; h: number; luma: number; accent: string }> | null = null
export function probeTestBg() {
  if (!probe) probe = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 48; c.height = 48
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, 48, 48)
      const p = ctx.getImageData(0, 0, 48, 48).data
      let l = 0, best = -1, accent = '#ffffff'
      for (let k = 0; k < p.length; k += 4) {
        const r = p[k], g = p[k + 1], b = p[k + 2]
        l += 0.299 * r + 0.587 * g + 0.114 * b
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
        const score = (mx - mn) * (mx / 255)
        if (score > best) { best = score; accent = `rgb(${r}, ${g}, ${b})` }
      }
      resolve({ w: img.naturalWidth, h: img.naturalHeight, luma: l / (p.length / 4), accent })
    }
    img.onerror = () => resolve({ w: 1, h: 1, luma: 40, accent: '#ffffff' })
    img.src = src
  })
  return probe
}

export function TestUnderlay({ wp, bounds, zoom }: { wp: WallpaperInfo | null; bounds: Bounds | null; zoom: number }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => { void probeTestBg().then(setSize) }, [])
  if (!TEST_BG || !wp || !bounds || !size) return null
  const scale = Math.max(wp.screenW / size.w, wp.screenH / size.h)
  const w = size.w * scale, h = size.h * scale
  const style = {
    position: 'fixed' as const, zIndex: -1, pointerEvents: 'none' as const, maxWidth: 'none',
    left: ((wp.screenW - w) / 2 - bounds.x) / zoom, top: ((wp.screenH - h) / 2 - bounds.y) / zoom, width: w / zoom, height: h / zoom
  }
  return <img src={src} style={style} alt="" draggable={false} />
}
