import { useEffect, useRef, useState } from 'react'
import { yd } from '../api'

const WAIT = '返事待ち: '
const params = new URLSearchParams(location.search)

/**
 * The small window for adding or editing a task: name, due date (or none), and "返事待ち".
 * Enter saves, Esc closes. The task is written through `yuta task` (main/services/tasks.ts).
 */
export function TaskForm() {
  const mode = params.get('mode') === 'edit' ? 'edit' : 'add'
  const original = params.get('title') ?? ''
  const [name, setName] = useState(original.startsWith('返事待ち') ? original.replace(/^返事待ち:\s*/, '') : original)
  const [waiting, setWaiting] = useState(original.startsWith('返事待ち'))
  const [due, setDue] = useState(params.get('due') ?? '')
  const [noDue, setNoDue] = useState(mode === 'edit' && !params.get('due'))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { document.body.style.background = 'transparent'; input.current?.focus() }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') yd.taskFormClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = name.trim()
    if (!text) { setErr('タスク名を入れてください'); return }
    const draft = { content: (waiting ? WAIT : '') + text, due: noDue || !due ? null : due }
    setBusy(true); setErr('')
    const r = mode === 'edit' ? await yd.taskEdit(original, draft) : await yd.taskAdd(draft)
    setBusy(false)
    if (r.ok) yd.taskFormClose()
    else setErr(r.message.replace(/^yuta:\s*/, ''))
  }

  return (
    <form className="taskform gcard" onSubmit={save}>
      <h1>{mode === 'edit' ? 'タスクを編集' : 'タスクを追加'}</h1>
      <label>タスク名<input ref={input} id="task-name" type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
      <div className="row">
        <label>期限<input id="task-due" type="date" value={due} disabled={noDue} onChange={(e) => setDue(e.target.value)} /></label>
        <label className="check"><input id="task-nodue" type="checkbox" checked={noDue} onChange={(e) => setNoDue(e.target.checked)} />期限なし</label>
        <label className="check"><input id="task-waiting" type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} />返事待ち</label>
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      <div className="buttons">
        <button type="button" onClick={() => yd.taskFormClose()}>やめる</button>
        <button type="submit" className="primary" disabled={busy}>{mode === 'edit' ? '保存する' : '追加する'}</button>
      </div>
    </form>
  )
}
