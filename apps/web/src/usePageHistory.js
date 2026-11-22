import { useEffect, useRef } from 'react'
const SECTIONS=new Set(['home','library','playlists','albums','admin','profiles'])
export function historyPage(value={}) {
  const section=SECTIONS.has(value.section)?value.section:'home'
  const page={section,query:typeof value.query==='string'?value.query.slice(0,500):'',filter:null,profileForm:value.profileForm===true,editingProfileId:typeof value.editingProfileId==='string'?value.editingProfileId:null}
  const filter=value.filter
  if(filter&&typeof filter==='object'){
    if(typeof filter.playlistId==='string')page.filter={playlistId:filter.playlistId,name:typeof filter.name==='string'?filter.name:'Playlist',ids:Array.isArray(filter.ids)?filter.ids.filter(id=>typeof id==='string').slice(0,10000):[]}
    else if(typeof filter.album==='string')page.filter={album:filter.album,artist:typeof filter.artist==='string'?filter.artist:''}
  }
  return page
}
export function pageRouteKey(page) {
  return JSON.stringify([page.section,page.filter?.playlistId||null,page.filter?.album||null,page.filter?.artist||null,page.profileForm,page.editingProfileId])
}
function pageUrl(page) {
  const url=new URL(window.location.href)
  const params=new URLSearchParams()
  if(page.filter?.playlistId)params.set('playlist',page.filter.playlistId)
  else if(page.filter?.album){params.set('album',page.filter.album);params.set('artist',page.filter.artist)}
  const route=page.profileForm?'profile':page.section
  url.hash=route+(params.size?'?'+params.toString():'')
  return url.href
}
export function usePageHistory({scope,page,onRestore}) {
  const snapshot=historyPage(page),serialized=JSON.stringify(snapshot)
  const latest=useRef({scope,onRestore,snapshot,serialized})
  latest.current={scope,onRestore,snapshot,serialized}
  const initialized=useRef(null),lastRoute=useRef(null),restoring=useRef(false)
  useEffect(()=>{
    if(!scope){initialized.current=null;return}
    const key=pageRouteKey(snapshot)
    const record={...(window.history.state||{}),kingMusicPage:{scope,page:snapshot}}
    if(initialized.current!==scope){initialized.current=scope;lastRoute.current=key;restoring.current=false;window.history.replaceState(record,'',pageUrl(snapshot));return}
    if(restoring.current||lastRoute.current===key){restoring.current=false;window.history.replaceState(record,'',pageUrl(snapshot))}
    else window.history.pushState(record,'',pageUrl(snapshot))
    lastRoute.current=key
  },[scope,serialized])
  useEffect(()=>{
    const restore=event=>{
      const current=latest.current
      if(!current.scope)return
      const saved=event.state?.kingMusicPage
      const target=historyPage(saved?.scope===current.scope?saved.page:{section:'home'})
      if(saved?.scope!==current.scope)window.history.replaceState({...(window.history.state||{}),kingMusicPage:{scope:current.scope,page:target}},'',pageUrl(target))
      restoring.current=JSON.stringify(target)!==current.serialized
      lastRoute.current=pageRouteKey(target)
      current.onRestore(target)
    }
    window.addEventListener('popstate',restore)
    return()=>window.removeEventListener('popstate',restore)
  },[])
}
