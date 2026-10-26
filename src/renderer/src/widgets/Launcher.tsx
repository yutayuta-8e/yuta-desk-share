import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Glass } from '../Glass'
import { useConfig } from '../hooks'
import { yd } from '../api'
import type { LauncherItem } from '@shared/types'
import { DIGITS } from '../digits'
import { isEditing } from '../light/editMode'
import { GLYPH_PATHS } from '../light/glyphPaths'

/**
 * Icon as light: a faint silhouette with a bright rim. Icons that sit on a coloured plate (a
 * rounded square) lose the plate, so only the mark inside remains; no plate, no surface.
 */
function toClear(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const s = 64
      const c = document.createElement('canvas'); c.width = s; c.height = s
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, s, s)
      const d = ctx.getImageData(0, 0, s, s)
      const p = d.data
      // Is there a plate? Sample a ring just inside the edge (rounded corners are transparent).
      const inset = Math.round(s * 0.14)
      const ring: number[] = []
      for (let i = inset; i < s - inset; i++) for (const [x, y] of [[i, inset], [i, s - 1 - inset], [inset, i], [s - 1 - inset, i]]) ring.push((y * s + x) * 4)
      let br = 0, bg = 0, bb = 0, ba = 0
      for (const k of ring) { br += p[k]; bg += p[k + 1]; bb += p[k + 2]; ba += p[k + 3] }
      br /= ring.length; bg /= ring.length; bb /= ring.length; ba /= ring.length
      let spread = 0
      for (const k of ring) spread += Math.hypot(p[k] - br, p[k + 1] - bg, p[k + 2] - bb)
      spread /= ring.length
      const plate = ba > 220 && spread < 40
      const m = new Float32Array(s * s)
      const lum = new Float32Array(s * s)
      for (let i = 0; i < s * s; i++) {
        const k = i * 4
        const a = p[k + 3] / 255
        lum[i] = a * (0.2126 * p[k] + 0.7152 * p[k + 1] + 0.0722 * p[k + 2]) / 255
        let v = a
        if (plate) v = a * Math.min(1, Math.max(0, (Math.hypot(p[k] - br, p[k + 1] - bg, p[k + 2] - bb) / 441 - 0.1) / 0.2))
        m[i] = v
      }
      const at = (arr: Float32Array, x: number, y: number) => arr[Math.min(s - 1, Math.max(0, y)) * s + Math.min(s - 1, Math.max(0, x))]
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const i = y * s + x
        // rim: the mask minus its 2 px erosion
        let lo = 1
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) lo = Math.min(lo, at(m, x + dx, y + dy))
        const rim = m[i] - lo
        // inner detail: luminance edges inside the shape
        const gx = at(lum, x + 1, y) - at(lum, x - 1, y), gy = at(lum, x, y + 1) - at(lum, x, y - 1)
        const detail = Math.min(1, Math.hypot(gx, gy) * 3) * m[i]
        const v = Math.max(rim, detail * 0.8, m[i] * 0.3)
        const k = i * 4
        p[k] = 255; p[k + 1] = 255; p[k + 2] = 255; p[k + 3] = Math.round(255 * Math.min(1, v))
      }
      ctx.putImageData(d, 0, 0)
      resolve(c.toDataURL())
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

function App({ item, index, clear, poked, dragging, dropHere, onPress }: {
  item: LauncherItem; index: number; clear: boolean; poked: boolean; dragging: boolean; dropHere: boolean
  onPress: (e: ReactMouseEvent, index: number) => void
}) {
  const [icon, setIcon] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void yd.getIcon(item.path, item.icon).then(async (r) => {
      if (!alive) return
      if (!r.dataUrl) return setIcon(null)
      setIcon(clear ? await toClear(r.dataUrl) : r.dataUrl)
    })
    return () => { alive = false }
  }, [item.path, item.icon, clear])
  return (
    <div className={`app ${poked ? 'poked' : ''} ${dragging ? 'dragging' : ''} ${dropHere ? 'drop-here' : ''}`} data-nodrag data-slot={index}
      onMouseDown={(e) => onPress(e, index)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); yd.launcherItemMenu(index) }} title={item.path}>
      <div className="tile">{item.glyph ? <GlyphIcon id={item.glyph} />
        : icon ? <img src={icon} alt="" draggable={false} /> : <span style={{ fontSize: 18 }}>{item.name.slice(0, 1)}</span>}</div>
      <div className="lbl ellipsis">{item.name}</div>
    </div>
  )
}

/** A mark of light chosen by the owner instead of the app's own icon (numbers use the clock's digits). */
function GlyphIcon({ id }: { id: string }) {
  if (id.startsWith('n:')) {
    const g = DIGITS[id.slice(2)]
    if (!g) return null
    return (
      <svg className="glyph" viewBox="0 0 48 48" width={42} height={42} aria-hidden="true">
        <g transform="translate(4.5 4.5) scale(0.3)" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={6.2}><path d={g.d} /></g>
      </svg>
    )
  }
  const d = GLYPH_PATHS[id]
  if (!d) return null
  return (
    <svg className="glyph" viewBox="0 0 48 48" width={42} height={42} aria-hidden="true">
      <path d={d} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} />
    </svg>
  )
}

/** Which slot (global item index) is under a point in this window, or the end of the list. */
function slotAt(x: number, y: number, count: number): number {
  const el = document.elementFromPoint(x, y)?.closest('[data-slot]') as HTMLElement | null
  return el ? Number(el.dataset.slot) : count
}

export function Launcher() {
  const cfg = useConfig()
  const [page, setPage] = useState(0)
  const pagesRef = useRef<HTMLDivElement>(null)
  const rows = cfg?.launcher.rows ?? 3
  const cols = cfg?.launcher.cols ?? 3
  const items = cfg?.launcher.items ?? []
  const per = rows * cols
  const pages = useMemo(() => {
    const out: LauncherItem[][] = []
    for (let i = 0; i < Math.max(1, Math.ceil(items.length / per)); i++) out.push(items.slice(i * per, (i + 1) * per))
    return out
  }, [items, per])

  // One swipe (touchpad or wheel) turns one page.
  useEffect(() => {
    const el = pagesRef.current
    if (!el) return
    let acc = 0
    let lock = 0
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!d) return
      e.preventDefault()
      const now = performance.now()
      if (now < lock) return
      acc += d
      if (Math.abs(acc) < 40) return
      const dir = acc > 0 ? 1 : -1
      acc = 0
      lock = now + 350
      const next = Math.min(pages.length - 1, Math.max(0, page + dir))
      if (next !== page) { setPage(next); el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' }) }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [page, pages.length])

  // The pet's mischief: one icon on the visible page wobbles.
  const [poked, setPoked] = useState(-1)
  useEffect(() => yd.onPoke(() => {
    const n = pages[page]?.length ?? 0
    if (!n) return
    setPoked(page * per + Math.floor(Math.random() * n))
    window.setTimeout(() => setPoked(-1), 1000)
  }), [pages, page, per])

  // Press and drag an icon to reorder; a press without movement launches it.
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; to: number } | null>(null)
  const press = useRef<{ index: number; x: number; y: number; moved: boolean } | null>(null)
  const onPress = useCallback((e: ReactMouseEvent, index: number) => {
    if (e.button !== 0) return
    press.current = { index, x: e.clientX, y: e.clientY, moved: false }
  }, [])
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const p = press.current
      if (!p) return
      if (isEditing()) { press.current = null; setDrag(null); return }
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 6) return
      p.moved = true
      setDrag({ from: p.index, x: e.clientX, y: e.clientY, to: slotAt(e.clientX, e.clientY, items.length) })
    }
    const up = (e: MouseEvent) => {
      const p = press.current
      press.current = null
      if (!p) return
      if (!p.moved) { const it = items[p.index]; if (it) void yd.launch(it.path, it.args); return }
      const to = slotAt(e.clientX, e.clientY, items.length)
      setDrag(null)
      if (to !== p.index) yd.launcherMove(p.index, to)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [items])

  // Files and shortcuts dropped on the launcher (relayed by the input catcher) are added where they land.
  const [dropAt, setDropAt] = useState(-1)
  useEffect(() => {
    const offOver = yd.onLauncherDragOver((p) => setDropAt(p ? slotAt(p.x, p.y, items.length) : -1))
    const offDrop = yd.onLauncherDrop((d) => { setDropAt(-1); if (d.paths.length) yd.launcherAdd(d.paths, slotAt(d.x, d.y, items.length)) })
    return () => { offOver(); offDrop() }
  }, [items.length])
  // direct drops too (when no catcher sits on top)
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDropAt(slotAt(e.clientX, e.clientY, items.length)) }
    const leave = () => setDropAt(-1)
    const drop = (e: DragEvent) => {
      e.preventDefault(); setDropAt(-1)
      const paths = [...(e.dataTransfer?.files ?? [])].map((f) => yd.pathForFile(f)).filter(Boolean)
      if (paths.length) yd.launcherAdd(paths, slotAt(e.clientX, e.clientY, items.length))
    }
    window.addEventListener('dragover', over); window.addEventListener('dragleave', leave); window.addEventListener('drop', drop)
    return () => { window.removeEventListener('dragover', over); window.removeEventListener('dragleave', leave); window.removeEventListener('drop', drop) }
  }, [items.length])

  return (
    <Glass id="launcher" className={`launcher v2-launcher ${dropAt >= 0 ? 'dropping' : ''}`}>
      <div className="pages" ref={pagesRef} data-nodrag>
        {pages.map((pg, i) => (
          <div className="page" key={i} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
            {pg.map((it, j) => {
              const index = i * per + j
              return <App key={it.path + it.name} item={it} index={index} clear={cfg?.launcher.iconStyle !== 'color'}
                poked={poked === index} dragging={drag?.from === index}
                dropHere={(!!drag && drag.to === index && drag.from !== index) || dropAt === index} onPress={onPress} />
            })}
            {i === 0 && pg.length === 0 && (
              <div className="empty" style={{ gridColumn: '1 / -1', gridRow: '1 / -1' }}>
                アプリやフォルダをここにドラッグすると登録できます
              </div>
            )}
          </div>
        ))}
      </div>
      {pages.length > 1 && <div className="dots">{pages.map((_, i) => <i key={i} className={i === page ? 'on' : ''} />)}</div>}
      {drag && <div className="drag-ghost" style={{ left: drag.x, top: drag.y }} />}
    </Glass>
  )
}
