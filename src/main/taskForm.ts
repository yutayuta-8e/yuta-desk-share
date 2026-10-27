// The small input window for adding or editing a task. Widgets live inside the desktop and may not
// get keyboard focus, so typing happens in an ordinary top-level window beside the tasks widget.
import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { getWindow, boundsOf, holdEditMode } from './windows'

let form: BrowserWindow | null = null
const W = 380, H = 236

export function openTaskForm(mode: 'add' | 'edit', task?: { title: string; due: string | null }): void {
  closeTaskForm()
  const tasks = getWindow('tasks')
  const area = screen.getPrimaryDisplay().workArea
  const b = tasks && !tasks.isDestroyed() ? boundsOf(tasks) : { x: area.x + 40, y: area.y + 400, width: 420, height: 300 }
  // beside the widget (right side), kept on screen
  let x = Math.round(b.x + b.width + 12), y = Math.round(b.y + 20)
  if (x + W > area.x + area.width) x = Math.round(b.x - W - 12)
  y = Math.min(Math.max(area.y, y), area.y + area.height - H)
  form = new BrowserWindow({
    x, y, width: W, height: H, frame: false, transparent: true, resizable: false, maximizable: false, minimizable: false,
    skipTaskbar: true, alwaysOnTop: true, show: false, title: 'yuta-desk タスク',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  const q = new URLSearchParams({ widget: 'taskform', mode })
  if (task) { q.set('title', task.title); if (task.due) q.set('due', task.due) }
  if (process.env.ELECTRON_RENDERER_URL) void form.loadURL(`${process.env.ELECTRON_RENDERER_URL}?${q}`)
  else void form.loadFile(join(__dirname, '../renderer/index.html'), { search: q.toString() })
  form.once('ready-to-show', () => { form?.show(); form?.focus() })
  holdEditMode(true)
  const me = form
  // an older window closing late must not forget the new one
  me.on('closed', () => { if (form === me) { form = null; holdEditMode(false) } })
}

export function closeTaskForm(): void {
  if (form && !form.isDestroyed()) form.close()
  form = null
}
