import { useEffect } from 'react'
import { yd } from '../api'

/** Invisible surface that relays every mouse/wheel event to the widget under it (see main/catcher.ts). */
export function Catcher() {
  useEffect(() => {
    const mods = (e: MouseEvent | WheelEvent) => {
      const m: string[] = []
      if (e.ctrlKey) m.push('control')
      if (e.shiftKey) m.push('shift')
      if (e.altKey) m.push('alt')
      return m
    }
    const btn = (e: MouseEvent): 'left' | 'right' | 'middle' => (e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left')
    const onMove = (e: MouseEvent) => yd.catcherEvent({ type: 'mouseMove', x: e.clientX, y: e.clientY, button: btn(e), clickCount: 0, modifiers: mods(e) })
    const onDown = (e: MouseEvent) => { e.preventDefault(); yd.catcherEvent({ type: 'mouseDown', x: e.clientX, y: e.clientY, button: btn(e), clickCount: e.detail || 1, modifiers: mods(e) }) }
    const onUp = (e: MouseEvent) => { e.preventDefault(); yd.catcherEvent({ type: 'mouseUp', x: e.clientX, y: e.clientY, button: btn(e), clickCount: e.detail || 1, modifiers: mods(e) }) }
    const onWheel = (e: WheelEvent) => { e.preventDefault(); yd.catcherEvent({ type: 'mouseWheel', x: e.clientX, y: e.clientY, deltaX: -e.deltaX, deltaY: -e.deltaY, modifiers: mods(e) }) }
    const onCtx = (e: MouseEvent) => e.preventDefault()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('contextmenu', onCtx)
    // files dragged from Explorer: relay position (for the drop marker) and the dropped paths
    let lastOver = 0
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      const now = performance.now()
      if (now - lastOver > 60) { lastOver = now; yd.catcherDragOver({ x: e.clientX, y: e.clientY }) }
    }
    const onDragLeave = () => yd.catcherDragOver(null)
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      const paths = [...(e.dataTransfer?.files ?? [])].map((f) => yd.pathForFile(f)).filter(Boolean)
      yd.catcherDrop(paths, e.clientX, e.clientY)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('contextmenu', onCtx)
    }
  }, [])
  // A hair of alpha keeps the whole surface hit-testable.
  return <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.004)' }} />
}
