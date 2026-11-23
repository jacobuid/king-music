export function songShareUrl(song, pageUrl) {
  const url=new URL(pageUrl);url.search='';url.hash='';url.searchParams.set('song',song.id);return url.href
}
export async function shareSong(song, pageUrl=location.href) {
  const url=songShareUrl(song,pageUrl)
  if(typeof navigator.share==='function'){
    await navigator.share({title:song.title,text:[song.title,song.artist].filter(Boolean).join(' - '),url});return 'Shared.'
  }
  if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);return 'Song link copied.'}
  throw new Error(`Copy this song link: ${url}`)
}
