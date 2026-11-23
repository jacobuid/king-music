import { useEffect, useRef } from 'react'
import {historyPage,pageHash,readPageHash} from './page-routing.mjs'
export {historyPage} from './page-routing.mjs'
export function pageRouteKey(page) {
  return JSON.stringify([page.section,page.filter?.playlistId||null,page.filter?.album||null,page.filter?.artist||null,page.profileForm,page.editingProfileId])
}
function pageUrl(page){const url=new URL(window.location.href);url.hash=pageHash(page);return url.href}
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
      const target=historyPage(saved?.scope===current.scope?saved.page:saved?{section:'home'}:readPageHash(window.location.hash))
      if(saved?.scope!==current.scope)window.history.replaceState({...(window.history.state||{}),kingMusicPage:{scope:current.scope,page:target}},'',pageUrl(target))
      restoring.current=JSON.stringify(target)!==current.serialized
      lastRoute.current=pageRouteKey(target)
      current.onRestore(target)
    }
    window.addEventListener('popstate',restore)
    return()=>window.removeEventListener('popstate',restore)
  },[])
}
