// Larger artwork from the browser (2026-10-30): Brave hands Windows only a 150 px picture, so the small
// extension in extension/brave-artwork passes on the addresses the playing page itself names. They
// arrive here on this PC only, and are shown only while the title matches what Windows says is playing.
import { createServer, type Server } from 'node:http'
import { net } from 'electron'
import { bootLog } from '../boot'

export const PAGE_ART_PORT = 47823
const KEEP = 30 // titles remembered (other tabs may be open with other tracks)
const found = new Map<string, string>()
let server: Server | null = null

const norm = (t: string) => t.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()

/** The large picture of this title, if the extension has found one. */
export function pageArtFor(title: string): string | null {
  return found.get(norm(title)) ?? null
}

/** YouTube's page names a middling picture; the same video has larger ones at known addresses. */
function candidates(art: string[]): string[] {
  const out: string[] = []
  for (const a of art) {
    const yt = /^https:\/\/i\d*\.ytimg\.com\/vi(?:_webp)?\/([\w-]+)\//.exec(a)
    if (yt) out.push(`https://i.ytimg.com/vi/${yt[1]}/maxresdefault.jpg`, `https://i.ytimg.com/vi/${yt[1]}/sddefault.jpg`)
    out.push(a)
  }
  return [...new Set(out)].filter((u) => u.startsWith('https://'))
}

async function firstThatLoads(urls: string[]): Promise<string | null> {
  for (const u of urls.slice(0, 8)) {
    try { if ((await net.fetch(u, { method: 'HEAD' })).ok) return u } catch { /* try the next */ }
  }
  return null
}

async function take(title: string, art: string[], changed: () => void): Promise<void> {
  const url = await firstThatLoads(candidates(art))
  if (!url) return
  const key = norm(title)
  if (found.get(key) === url) return
  found.delete(key)
  found.set(key, url)
  if (found.size > KEEP) found.delete(found.keys().next().value!)
  changed()
}

/** Listens on this PC only, and only to the extension: a web page cannot pass the origin check. */
export function startPageArt(changed: () => void): void {
  if (server) return
  server = createServer((req, res) => {
    const origin = String(req.headers.origin ?? '')
    if (!origin.startsWith('chrome-extension://') || req.url !== '/artwork') { res.writeHead(403).end(); return }
    res.setHeader('access-control-allow-origin', origin)
    res.setHeader('access-control-allow-headers', 'content-type')
    res.setHeader('access-control-allow-private-network', 'true')
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return }
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (c: string) => { body += c; if (body.length > 16384) req.destroy() })
    req.on('end', () => {
      res.writeHead(204).end()
      try {
        const m = JSON.parse(body) as { title?: unknown; art?: unknown }
        if (typeof m.title !== 'string' || !m.title || !Array.isArray(m.art)) return
        void take(m.title, m.art.filter((a): a is string => typeof a === 'string'), changed)
      } catch { /* not ours */ }
    })
  })
  server.on('error', (e) => { bootLog(`page art: ${String(e)}`); server = null })
  server.listen(PAGE_ART_PORT, '127.0.0.1')
}

export function stopPageArt(): void {
  server?.close()
  server = null
}
