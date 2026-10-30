// Passes what content.js found to yuta-desk on this PC. When yuta-desk is not running, nothing happens.
chrome.runtime.onMessage.addListener((msg) => {
  fetch('http://127.0.0.1:47823/artwork', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: msg.title, art: msg.art })
  }).catch(() => {})
})
