// Windows gets only a 150 px picture from the browser, but the page itself names larger ones. Looks at
// the page's media metadata every 2 s (there is no event for it) and passes on the title and the
// picture addresses when they change. Nothing else of the page is read.
let last = ''
const width = (a) => Math.max(0, ...String(a.sizes || '').split(/\s+/).map((s) => parseInt(s, 10) || 0))

const timer = setInterval(() => {
  const m = navigator.mediaSession && navigator.mediaSession.metadata
  if (!m || !m.title || !m.artwork || !m.artwork.length) return
  const art = [...m.artwork].sort((a, b) => width(b) - width(a)).map((a) => a.src)
  const key = JSON.stringify([m.title, art])
  if (key === last) return
  last = key
  try {
    chrome.runtime.sendMessage({ title: m.title, art })
  } catch {
    clearInterval(timer) // the extension was reloaded: this page's copy of the script is finished
  }
}, 2000)
