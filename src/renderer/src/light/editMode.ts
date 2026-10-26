import { useEffect, useState } from 'react'
import { yd } from '../api'

/**
 * Edit mode, like holding a widget on a phone: a long press (550 ms without moving) on any widget
 * turns it on for all widgets; only then can they be dragged (see Glass.tsx and main/windows.ts).
 * The press that started it does not also click or launch whatever was under it.
 */
const LONG_PRESS_MS = 550
let editing = false
let swallow = false

export function isEditing(): boolean { return editing }

let installed = false
function installLongPress(): void {
  if (installed || ['catcher', 'pet'].includes(String(yd.widgetId))) return
  installed = true
  let timer: number | null = null
  let start = { x: 0, y: 0 }
  const cancel = () => { if (timer) { window.clearTimeout(timer); timer = null } }
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || editing) return
    start = { x: e.clientX, y: e.clientY }
    cancel()
    timer = window.setTimeout(() => {
      timer = null
      swallow = true
      yd.setEditMode(true)
    }, LONG_PRESS_MS)
  }, true)
  window.addEventListener('mousemove', (e) => {
    if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel()
  }, true)
  // the release (and click) that ends a long press must not reach the widget
  const eat = (e: Event) => { if (swallow) { e.stopPropagation(); e.preventDefault(); if (e.type === 'click') swallow = false } }
  window.addEventListener('mouseup', (e) => { cancel(); eat(e); if (swallow) window.setTimeout(() => { swallow = false }, 50) }, true)
  window.addEventListener('click', eat, true)
}

export function useEditMode(): boolean {
  const [on, set] = useState(editing)
  useEffect(() => {
    installLongPress()
    void yd.getEditMode().then((v) => { editing = v; set(v) })
    return yd.onEditMode((v) => { editing = v; set(v) })
  }, [])
  return on
}
