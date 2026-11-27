import {matchesSong,rankSongs} from './song-relevance.mjs'
﻿import React,{useEffect,useRef,useState} from 'react'
import {SongList} from './SongList'
export function SongsPage({profile,songs,query,onQueryChange,request,onImported,currentId,busy,songListProps,searchInput}){
 const adult=profile.role==='adult',api=useRef(request),refresh=useRef(onImported),live=useRef(true),statesRef=useRef({}),cache=useRef(new Map())
 api.current=request;refresh.current=onImported
 const [remote,setRemote]=useState([]),[searching,setSearching]=useState(false),[error,setError]=useState(''),[states,setStates]=useState({}),[wake,setWake]=useState(0),[retry,setRetry]=useState(0)
 statesRef.current=states
 useEffect(()=>{live.current=true;return()=>{live.current=false}},[])
 const term=query.trim(),key=term.toLowerCase()
 useEffect(()=>{
  let active=true;const controller=new AbortController();setRemote([]);setError('');setSearching(false)
  if(!adult||term.length<3)return
  if(cache.current.has(key)){setRemote(cache.current.get(key));return}
  const timer=setTimeout(async()=>{setSearching(true);try{const data=await api.current('/api/discovery/search?q='+encodeURIComponent(term),{signal:controller.signal});if(active){const found=[...new Map((data.results||[]).filter(song=>/^[A-Za-z0-9_-]{11}$/.test(song.videoId)).slice(0,50).map(song=>[song.videoId,song])).values()];cache.current.set(key,found);setRemote(found)}}catch(error){if(active&&error.name!=='AbortError')setError(error.message)}finally{if(active)setSearching(false)}},1600)
  return()=>{active=false;clearTimeout(timer);controller.abort()}
 },[adult,term,retry])
 const signature=remote.map(song=>song.videoId).sort().join(',')
 useEffect(()=>{
  if(!adult||!signature)return
  let active=true,timer;const controller=new AbortController()
  async function poll(){try{const data=await api.current('/api/discovery/imports?videoIds='+encodeURIComponent(signature),{signal:controller.signal});if(!active)return
   const jobs=data.jobs||[],updates=Object.fromEntries(jobs.map(job=>[job.videoId,{status:job.status,error:job.error,progress:job.progress,stage:job.stage}]))
   setStates(current=>({...current,...updates}))
   if(jobs.some(job=>job.status==='ready'))await refresh.current()
   if(active&&jobs.some(job=>['queued','processing'].includes(job.status)))timer=setTimeout(poll,2500)
  }catch(error){if(active&&error.name!=='AbortError')setError(error.message)}}
  poll();return()=>{active=false;clearTimeout(timer);controller.abort()}
 },[adult,signature,wake])
 async function download(song){
  if(!adult||['queued','processing'].includes(statesRef.current[song.youtubeVideoId]?.status))return
  const id=song.youtubeVideoId;setStates(current=>({...current,[id]:{status:'queued',progress:0,stage:'queued'}}))
  try{const data=await api.current('/api/discovery/song',{method:'POST',body:JSON.stringify({videoId:id,title:song.title,artist:song.artist,album:song.album,thumbnail:song.thumbnailUrl})});if(!live.current)return;if(data.limited)throw Error('The daily import limit has been reached. Try again later.');if(data.reused)await refresh.current();if(live.current)setWake(value=>value+1)}catch(error){if(live.current)setStates(current=>({...current,[id]:{status:'failed',error:error.message}}))}
 }
 const local=songs.filter(song=>matchesSong(song,term)),localIds=new Set(local.map(song=>song.id)),byVideo=new Map(songs.filter(song=>song.youtubeVideoId).map(song=>[song.youtubeVideoId,song]))
 const extra=adult?remote.flatMap(song=>{const existing=byVideo.get(song.videoId);if(existing)return localIds.has(existing.id)?[]:[existing];return [{id:'discovery-'+song.videoId,title:song.title,artist:song.artist,album:song.album,thumbnailUrl:song.thumbnail,youtubeVideoId:song.videoId,discovery:true}]}):[]
 const visible=rankSongs([...local,...extra],term)
 return <section className="km-block" aria-label="Songs page"><p className="km-eyebrow">EVERY SONG, ONE PLACE</p><h1>Songs</h1><div className="km-library-toolbar"><label className="km-search"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg><input ref={searchInput} aria-label="Search music" placeholder="Search songs, artists, albums" value={query} onChange={event=>onQueryChange(event.target.value)} maxLength={100}/></label></div><SongList {...songListProps} songs={visible} currentId={currentId} busy={busy} importStates={states} onImportSong={adult?download:undefined}/>{adult&&searching&&<p className="km-muted" role="status">Finding more songs...</p>}{adult&&error&&<p className="km-alert" role="alert">{error} <button type="button" onClick={()=>{cache.current.delete(key);setRetry(value=>value+1);setWake(value=>value+1)}}>Try again</button></p>}{!visible.length&&!searching&&!error&&<div className="km-empty"><h3>{term?'No matching songs':'Your soundtrack starts here'}</h3></div>}</section>
}
