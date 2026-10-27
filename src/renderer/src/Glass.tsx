import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type MouseEvent } from 'react'
import { yd } from './api'
import { useBounds, useConfig, useTheme, useWallpaper } from './hooks'
import type { Bounds, WallpaperInfo, WidgetId } from '@shared/types'
import { TEST_BG, TestUnderlay } from './light/testBg'
import { useEditMode } from './light/editMode'

/** Wallpaper "Fill" geometry for this window: where the (cover-scaled) image sits relative to the window. */
export function wallpaperPlacement(wp: WallpaperInfo, bounds: Bounds, zoom: number) {
  const scale = Math.max(wp.screenW / wp.width, wp.screenH / wp.height)
  const w = wp.width * scale
  const h = wp.height * scale
  const left = (wp.screenW - w) / 2 - bounds.x
  const top = (wp.screenH - h) / 2 - bounds.y
  return { left: left / zoom, top: top / zoom, width: w / zoom, height: h / zoom }
}

/**
 * Renders the blurred wallpaper behind this window into a data URL so text can be filled with it
 * (background-clip: text). Used by card-less widgets whose glyphs themselves look like glass.
 */
function useGlassTextBackdrop(enabled: boolean, wp: WallpaperInfo | null, bounds: Bounds | null, blur: number, zoom: number): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const imgRef = useRef<{ src: string; img: HTMLImageElement } | null>(null)
  useEffect(() => {
    if (!enabled || !wp || !bounds || !wp.width) return
    let cancelled = false
    const draw = (img: HTMLImageElement) => {
      if (cancelled) return
      const W = Math.max(1, Math.round(bounds.width / zoom)), H = Math.max(1, Math.round(bounds.height / zoom))
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const ctx = c.getContext('2d')!
      const p = wallpaperPlacement(wp, bounds, zoom)
      ctx.filter = `blur(1.5px) saturate(1.4) brightness(1.08)`
      ctx.drawImage(img, p.left, p.top, p.width, p.height)
      setUrl(c.toDataURL('image/jpeg', 0.85))
    }
    if (imgRef.current && imgRef.current.src === wp.url && imgRef.current.img.complete) draw(imgRef.current.img)
    else {
      const img = new Image()
      img.onload = () => { imgRef.current = { src: wp.url, img }; draw(img) }
      img.src = wp.url
    }
    return () => { cancelled = true }
  }, [enabled, wp, bounds, blur, zoom])
  return enabled ? url : null
}

/**
 * Liquid-glass frame. The OS acrylic effect does not reach windows that live on the desktop
 * layer, so we draw the real wallpaper inside the window at its exact on-screen offset and blur it.
 * With `card: false` the frame disappears and only the content floats on the wallpaper.
 */
export function Glass({ id, className, children, glassText = false }: { id: WidgetId; className?: string; children: ReactNode; glassText?: boolean }) {
  const cfg = useConfig()
  const theme = useTheme()
  const wp = useWallpaper()
  const bounds = useBounds()
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const wcfg = cfg?.widgets[id]
  const zoom = wcfg?.scale ?? 1
  const card = wcfg?.card ?? true
  const blur = wcfg?.blur ?? 24
  const textBg = useGlassTextBackdrop(glassText && !!wcfg, wp, bounds, Math.max(8, blur), zoom)

  const style = useMemo(() => ({
    '--blur': `${blur}px`,
    '--opacity': String(wcfg?.opacity ?? 0.12),
    '--bright': theme.dark ? '0.9' : '1.1',
    '--glass-text-bg': textBg ? `url(${textBg})` : 'none',
    zoom
  }) as React.CSSProperties, [wcfg?.opacity, blur, theme.dark, textBg, zoom])

  const img = useMemo(() => {
    if (!card || !wp || !bounds || !wp.width || !wp.height) return null
    return { src: wp.url, style: wallpaperPlacement(wp, bounds, zoom) }
  }, [card, wp, bounds, zoom])

  // Widgets move only in edit mode (long press anywhere on a widget to enter it).
  const editing = useEditMode()
  // In edit mode a press anywhere drags the widget (main ends edit mode when the release did not
  // move it, i.e. a click), except on controls marked data-edit-action (the tasks widget's 追加 etc.).
  const onEditDown = useCallback((e: MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('[data-edit-action]')) return
    e.preventDefault(); e.stopPropagation()
    setDragging(true)
    yd.dragStart(id)
  }, [id])
  const onEditClick = useCallback((e: MouseEvent) => {
    // using an edit action counts as activity: edit mode starts its 15 s again
    if ((e.target as HTMLElement).closest('[data-edit-action]')) { yd.setEditMode(true); return }
    e.preventDefault(); e.stopPropagation()
  }, [])

  useEffect(() => {
    if (!dragging) return
    const up = () => { setDragging(false); yd.dragEnd() }
    window.addEventListener('mouseup', up)
    window.addEventListener('blur', up)
    return () => { window.removeEventListener('mouseup', up); window.removeEventListener('blur', up) }
  }, [dragging])

  // Ctrl + wheel resizes the widget.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      yd.setScale(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [zoom])

  const onContextMenu = useCallback((e: MouseEvent) => { e.preventDefault(); yd.contextMenu(id) }, [id])

  return (
    <div ref={ref} className={`glass ${card ? '' : 'nocard'} ${dragging ? 'dragging' : ''} ${editing ? 'editing' : ''} ${className ?? ''}`} style={style}
      onContextMenu={onContextMenu}
      onMouseDownCapture={editing ? onEditDown : undefined} onClickCapture={editing ? onEditClick : undefined}>
      {TEST_BG && <TestUnderlay wp={wp} bounds={bounds} zoom={zoom} />}
      {card && <div className="backdrop">{img && <img src={img.src} style={img.style} draggable={false} alt="" />}</div>}
      {card && <div className="tint" />}
      <div className="content">{children}</div>
      {card && <div className="rim" />}
      {editing && <div className="edit-overlay" aria-hidden="true" />}
    </div>
  )
}
