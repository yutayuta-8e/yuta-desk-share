import type React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/m-plus-rounded-1c/400.css'
import '@fontsource/zen-kurenaido/400.css'
import './glass.css'
import './light/light.css'
import { yd } from './api'
import { useLightTheme } from './light/Light'
import { Clock } from './widgets/Clock'
import { Calendar } from './widgets/Calendar'
import { Tasks } from './widgets/Tasks'
import { Battery } from './widgets/Battery'
import { Usage } from './widgets/Usage'
import { Launcher } from './widgets/Launcher'
import { Pet } from './widgets/Pet'
import { Catcher } from './widgets/Catcher'
import { PetSheet } from './widgets/PetSheet'
import { Media } from './widgets/Media'
import { TaskForm } from './widgets/TaskForm'
import { CalCard } from './widgets/CalCard'
import { Player } from './widgets/Player'
import { Money } from './widgets/Money'
import { MoneyCard } from './widgets/MoneyCard'
import { addLatinFont } from './light/latinFont'

// player: the full-screen view opened from the media widget (an ordinary window, see main/playerWindow.ts)
const widgets: Record<string, () => React.JSX.Element> = { clock: Clock, calendar: Calendar, tasks: Tasks, battery: Battery, usage: Usage, launcher: Launcher, pet: Pet, media: Media, money: Money, catcher: Catcher, player: Player }
addLatinFont()
const root = createRoot(document.getElementById('root')!)
if (new URLSearchParams(location.search).get('widget') === 'taskform') {
  // the small input window for adding / editing a task (an ordinary window, not a desktop widget)
  document.title = 'yuta-desk タスク'
  // a see-through card: it follows the wallpaper's colour like the widgets
  const FormRoot = () => { useLightTheme(); return <TaskForm /> }
  root.render(<FormRoot />)
} else if (new URLSearchParams(location.search).get('widget') === 'calcard') {
  // the card beside the calendar: an event's details, adding / editing one, or the subscriptions (main/calCard.ts)
  document.title = 'yuta-desk 予定'
  root.render(<CalCard />)
} else if (new URLSearchParams(location.search).get('widget') === 'moneycard') {
  // the household accounts' card beside the money widget (main/moneyCard.ts)
  document.title = 'yuta-desk 家計簿'
  root.render(<MoneyCard />)
} else if (new URLSearchParams(location.search).get('widget') === 'petsheet') {
  // dev-only preview of the pet looks (scripts/pet-sheet.js); runs without the app's bridge
  document.title = 'yuta-desk petsheet'
  root.render(<PetSheet />)
} else {
  const Widget = widgets[yd.widgetId as string] ?? Clock
  const Root = () => { useLightTheme(); return <Widget /> }
  document.title = `yuta-desk ${yd.widgetId}`
  root.render(<Root />)
}
