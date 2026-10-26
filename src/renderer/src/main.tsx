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

const widgets: Record<string, () => React.JSX.Element> = { clock: Clock, calendar: Calendar, tasks: Tasks, battery: Battery, usage: Usage, launcher: Launcher, pet: Pet, catcher: Catcher }
const Widget = widgets[yd.widgetId as string] ?? Clock
function Root() { useLightTheme(); return <Widget /> }
document.title = `yuta-desk ${yd.widgetId}`
createRoot(document.getElementById('root')!).render(<Root />)
