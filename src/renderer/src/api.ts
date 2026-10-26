import type { YdApi } from '../../preload/index'

declare global {
  interface Window { yd: YdApi }
}

export const yd = window.yd
