export function detectImportInput(input) {
  const value = input.trim()
  if (!/^(?:https?:\/\/|(?:www\.|music\.)?youtube\.com\/|youtu\.be\/)/i.test(value)) return { kind: 'search', query: value }
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    if (url.protocol !== 'https:' || !['youtube.com','www.youtube.com','music.youtube.com','youtu.be'].includes(url.hostname)) return { kind: 'invalid' }
    const list = url.searchParams.get('list')
    if (list && /^[A-Za-z0-9_-]{10,150}$/.test(list)) return { kind: 'playlist', url: url.href }
    const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : /^\/(shorts|embed)\//.test(url.pathname) ? url.pathname.split('/')[2] : url.searchParams.get('v')
    if (/^[A-Za-z0-9_-]{11}$/.test(id || '')) return { kind: 'song', videoId: id, url: `https://www.youtube.com/watch?v=${id}` }
  } catch {}
  return { kind: 'invalid' }
}
