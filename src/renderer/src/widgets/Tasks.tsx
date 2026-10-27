import { useCallback, useEffect, useRef, useState } from 'react'
import { Glass } from '../Glass'
import { Glow, LightLine } from '../light/Light'
import { useConfig, useFeed } from '../hooks'
import { useEditMode } from '../light/editMode'
import { yd } from '../api'
import type { TaskItem } from '@shared/types'

const get = () => yd.getTasks()
const on = yd.onTasks

function dueLabel(t: TaskItem): string {
  if (t.overdueDays === null) return ''
  if (t.overdueDays === 0) return '今日'
  if (t.overdueDays > 0) return `${t.overdueDays}日過ぎ`
  if (t.overdueDays === -1) return '明日'
  return `${-t.overdueDays}日後`
}

/** One task: a point of light that becomes a ring when armed; a second press marks it done. */
/** A row in edit mode: ✎ opens the input window, × twice sends the task to the Vault's trash. */
function EditRow({ t, title, due, over }: { t: TaskItem; title: string; due: string; over: boolean }) {
  const [arm, setArm] = useState(false)
  const [msg, setMsg] = useState('')
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const del = async () => {
    if (!arm) { setArm(true); timer.current = window.setTimeout(() => setArm(false), 2500); return }
    if (timer.current) window.clearTimeout(timer.current)
    setArm(false)
    const r = await yd.taskDelete(t.title)
    if (!r.ok) setMsg(r.message)
  }
  return (
    <div className={`v2-task editing ${t.waiting ? 'waiting' : ''}`} title={msg || t.note || t.title}>
      <Glow className="t">{title}</Glow>
      {!arm && due && <span className={`due ${over ? 'over' : ''}`}>{due}</span>}
      <button className="act" data-edit-action onClick={() => yd.taskFormOpen('edit', { title: t.title, due: t.due })} aria-label="編集" title="編集">✎</button>
      <button className={`act del ${arm ? 'arm' : ''}`} data-edit-action onClick={del} aria-label={arm ? 'もう一度押すとゴミ箱へ' : 'ゴミ箱へ'} title={arm ? 'もう一度押すとゴミ箱へ' : 'ゴミ箱へ'}>{arm ? 'もう一度でゴミ箱へ' : '×'}</button>
    </div>
  )
}

/** The trash (ゴミ箱/タスク.md), newest first; each can be put back. */
function TrashList({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<{ content: string; due: string | null; deleted: string; days_left: number }[] | null>(null)
  const load = useCallback(() => { void yd.taskTrash().then(setItems) }, [])
  useEffect(load, [load])
  const restore = async (c: string) => { await yd.taskRestore(c); load() }
  return (
    <>
      <div className="task-actions">
        <button className="act-text" data-edit-action onClick={onBack}>‹ タスクに戻る</button>
      </div>
      {items && items.length === 0 && <div className="v2-note">ゴミ箱は空です</div>}
      {items?.map((i) => (
        <div key={i.content + i.deleted} className="v2-task trash">
          <Glow className="t">{i.content.replace(/^返事待ち:\s*/, '')}</Glow>
          <span className="due">あと{i.days_left}日</span>
          <button className="act" data-edit-action onClick={() => void restore(i.content)} aria-label="戻す" title="タスクに戻す">↺</button>
        </div>
      ))}
    </>
  )
}

/** How urgent a task is, 0 (no due) .. 1 (overdue): used by the "light length" style. */
function urgency(t: TaskItem): number {
  if (t.overdueDays === null) return 0
  if (t.overdueDays > 0) return 1
  if (t.overdueDays === 0) return 0.8
  if (t.overdueDays === -1) return 0.55
  return 0.3
}

/** Star size in px for the constellation style: clear steps, so urgency reads at a glance. */
function starSize(t: TaskItem): number {
  if (t.overdueDays === null) return 3.5
  if (t.overdueDays > 0) return 13
  if (t.overdueDays === 0) return 9.5
  if (t.overdueDays === -1) return 7
  return 5
}

/** Task row styles (2026-10-26, five variations on the original for the owner to choose):
 *  0 original dot / 1 ring / 2 drop of light / 3 constellation (star size = urgency) / 4 date first / 5 light length */
const DEBUG_STYLE = Number(new URLSearchParams(location.search).get('taskstyle'))

function Row({ t, onDone, style, editing }: { t: TaskItem; onDone: (r: DOMRect) => void; style: number; editing: boolean }) {
  const [arm, setArm] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)
  const dotRef = useRef<HTMLButtonElement>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const click = useCallback(async () => {
    if (busy) return
    if (!arm) { setArm(true); timer.current = window.setTimeout(() => setArm(false), 2000); return }
    if (timer.current) window.clearTimeout(timer.current)
    setArm(false); setBusy(true)
    const rect = dotRef.current?.getBoundingClientRect()
    const r = await yd.taskDone(t.title)
    setBusy(false)
    if (r.ok && rect) onDone(rect)
  }, [arm, busy, t.title, onDone])
  const title = t.waiting ? t.title.replace(/^返事待ち:\s*/, '') : t.title
  const due = dueLabel(t)
  const over = t.overdueDays !== null && t.overdueDays > 0
  const dot = (
    <button ref={dotRef} className={`dot ${arm ? 'arm' : ''} ${over ? 'over' : ''}`} onClick={click} data-nodrag
      style={{ '--len': `${6 + urgency(t) * 18}px`, '--star': `${starSize(t)}px` } as React.CSSProperties}
      aria-label={arm ? 'もう一度押すと済にする' : '済にする'} title={arm ? 'もう一度押すと済にする' : '済にする'} />
  )
  if (editing) return <EditRow t={t} title={title} due={due} over={over} />
  if (style === 4) {
    // date first: the due day leads, then the title
    return (
      <div className={`v2-task ${t.waiting ? 'waiting' : ''}`} title={t.note || t.title}>
        {dot}
        <span className={`due lead ${over ? 'over' : ''} ${t.overdueDays === 0 ? 'today' : ''}`}>{arm ? 'もう一度' : due || '—'}</span>
        <Glow className="t">{title}</Glow>
      </div>
    )
  }
  return (
    <div className={`v2-task ${t.waiting ? 'waiting' : ''}`} title={t.note || t.title}>
      {dot}
      <Glow className="t">{title}</Glow>
      {arm ? <span className="hint">もう一度で済</span> : due && <span className={`due ${over ? 'over' : ''}`}>{due}</span>}
    </div>
  )
}

export function Tasks() {
  const list = useFeed(get, on)
  const items = list?.items ?? []
  const todo = items.filter((t) => !t.waiting)
  const waiting = items.filter((t) => t.waiting)
  const scroller = useRef<HTMLDivElement>(null)
  const cfg = useConfig()
  const editing = useEditMode()
  const [trashView, setTrashView] = useState(false)
  useEffect(() => { if (!editing) setTrashView(false) }, [editing])
  const style = DEBUG_STYLE > 0 ? DEBUG_STYLE : (cfg?.tasks.style ?? 0)
  // A done task bursts into little points of light (the pet hops at the same time, see Pet.tsx).
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; parts: { dx: number; dy: number; d: number }[] }[]>([])
  const burst = useCallback((r: DOMRect) => {
    const id = Date.now() + Math.random()
    const parts = Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2 + Math.random() * 0.4
      const dist = 30 + Math.random() * 46
      return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist - 6, d: Math.random() * 120 }
    })
    setBursts((b) => [...b, { id, x: r.left + r.width / 2, y: r.top + r.height / 2, parts }])
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 1400)
  }, [])
  // Wheel events relayed by the input catcher scroll the list directly (works for touchpads too).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => { if (e.ctrlKey) return; e.preventDefault(); el.scrollTop += e.deltaY }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])
  return (
    <Glass id="tasks" className={`v2-tasks s${style}`}>
      <div ref={scroller} className="list" data-nodrag>
        {editing && !trashView && (
          <div className="task-actions">
            <button className="act-text" data-edit-action onClick={() => yd.taskFormOpen('add')}>＋ 追加</button>
            <button className="act-text" data-edit-action onClick={() => setTrashView(true)}>ゴミ箱</button>
          </div>
        )}
        {editing && trashView && <TrashList onBack={() => setTrashView(false)} />}
        {list?.error && <div className="v2-note">{list.error}</div>}
        {list && !list.error && items.length === 0 && <Glow>期限の近いタスクはありません</Glow>}
        {!trashView && todo.map((t) => <Row key={t.id} t={t} onDone={burst} style={style} editing={editing} />)}
        {!trashView && waiting.length > 0 && <div className="sep"><LightLine width={48} /><span>返事待ち</span></div>}
        {!trashView && waiting.map((t) => <Row key={t.id} t={t} onDone={burst} style={style} editing={editing} />)}
      </div>
      {bursts.map((b) => (
        <span key={b.id} className="v2-burst" style={{ left: b.x, top: b.y }} aria-hidden="true">
          <b className="ring" />
          {b.parts.map((p, i) => <i key={i} style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, animationDelay: `${p.d}ms` } as React.CSSProperties} />)}
        </span>
      ))}
    </Glass>
  )
}
