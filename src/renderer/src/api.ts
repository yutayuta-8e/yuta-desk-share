import type { YdApi } from '../../preload/index'

declare global {
  interface Window { yd: YdApi }
}

/** The preload bridge. Without it (the dev-only pet sheet in a plain window) every call is a no-op. */
export const yd: YdApi = window.yd ?? (new Proxy({}, {
  get: (_t, k) => (k === 'widgetId' ? 'petsheet' : () => () => {})
}) as YdApi)
