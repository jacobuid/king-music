import React,{useEffect,useRef,useState} from 'react'
import {Artwork,Icon} from './ui'
import {ImportProgressRing} from './ImportProgressRing'
import {matchesSong,rankSongs} from './song-relevance.mjs'
export function PlaylistAddSongs({playlist,songs,playlistSongs,profile,request,onImported,onAdd,onClose}){
 const dialog=useRef(null),lock=useRef(false),api=useRef(request),refresh=useRef(onImported),alive=useRef(true)
 api.current=request;refresh.current=onImported
 const adult=profile.role==='adult'
 const [query,setQuery]=useState(''),[adding,setAdding]=useState(null),[added,setAdded]=useState([]),[error,setError]=useState(''),[remote,setRemote]=useState([]),[restricted,setRestricted]=useState([]),[searching,setSearching]=useState(false),[requests,setRequests]=useState([]),[jobs,setJobs]=useState({}),[poll,setPoll]=useState(0),[searchRetry,setSearchRetry]=useState(0)
 const included=new Set([...playlistSongs.map(song=>song.id),...added])
 const local=songs.filter(song=>matchesSong(song,query)),byVideo=new Map(songs.filter(song=>song.youtubeVideoId).map(song=>[song.youtubeVideoId,song]))
 const extras=remote.map(song=>byVideo.get(song.videoId)||restricted.find(item=>item.youtubeVideoId===song.videoId)||({id:'discovery-'+song.videoId,title:song.title,artist:song.artist,album:song.album,thumbnailUrl:song.thumbnail,youtubeVideoId:song.videoId,discovery:true,requestOnly:!adult}))
 const hidden=restricted.filter(song=>!songs.some(item=>item.id===song.id))
 const matches=rankSongs([...new Map([...local,...hidden,...extras].map(song=>[song.id,song])).values()],query),visible=matches.slice(0,50)
 useEffect(()=>{alive.current=true;const modal=dialog.current;modal.showModal();modal.querySelector('input')?.focus();return()=>{alive.current=false;modal.close()}},[])
 useEffect(()=>{
  let active=true;const controller=new AbortController();setRemote([]);setRestricted([]);setError('');setSearching(false)
  if(query.trim().length<3)return
  const timer=setTimeout(async()=>{setSearching(true);try{const data=await api.current((adult?'/api/discovery/search':'/api/song-requests/search')+'?q='+encodeURIComponent(query.trim()),{signal:controller.signal});if(active){setRemote((data.results||[]).filter(song=>/^[A-Za-z0-9_-]{11}$/.test(song.videoId)));setRestricted(data.library||[]);if(data.searchError)setError(data.searchError)}}catch(error){if(active&&error.name!=='AbortError')setError(error.message)}finally{if(active)setSearching(false)}},1600)
  return()=>{active=false;clearTimeout(timer);controller.abort()}
 },[adult,query,searchRetry])
 useEffect(()=>{if(adult)return;let active=true;api.current('/api/song-requests').then(data=>{if(active)setRequests(data.requests||[])}).catch(error=>{if(active)setError(error.message)});return()=>{active=false}},[adult])
 const pending=Object.keys(jobs).filter(id=>['queued','processing'].includes(jobs[id].status)).sort().join(',')
 useEffect(()=>{
  if(!adult||!pending)return
  let active=true,timer;const controller=new AbortController()
  async function update(){try{const data=await api.current('/api/discovery/imports?videoIds='+encodeURIComponent(pending),{signal:controller.signal});if(!active)return;setJobs(current=>({...current,...Object.fromEntries((data.jobs||[]).map(job=>[job.videoId,job]))}));if((data.jobs||[]).some(job=>job.status==='ready'))await refresh.current();if(active)timer=setTimeout(update,2500)}catch(error){if(active&&error.name!=='AbortError')setError(error.message)}}
  update();return()=>{active=false;clearTimeout(timer);controller.abort()}
 },[adult,pending,poll])
 async function add(song){
  if(lock.current||included.has(song.id))return;lock.current=true;setAdding(song.id);setError('')
  try{
   if(song.requestOnly){
    const data=await api.current('/api/song-requests',{method:'POST',body:JSON.stringify({mediaId:song.discovery?undefined:song.id,videoId:song.youtubeVideoId,title:song.title,artist:song.artist,album:song.album,thumbnail:song.thumbnailUrl,playlistId:playlist.id})})
    if(data.available){await refresh.current();setAdded(current=>[...current,song.id])}else setRequests(current=>[...current.filter(row=>row.id!==data.id),{id:data.id,mediaId:song.discovery?null:song.id,videoId:song.youtubeVideoId,status:data.status,attached:true}])
   }else if(song.discovery){
    const data=await api.current('/api/discovery/song',{method:'POST',body:JSON.stringify({videoId:song.youtubeVideoId,title:song.title,artist:song.artist,album:song.album,thumbnail:song.thumbnailUrl,playlistId:playlist.id})})
    if(data.limited)throw Error('The daily import limit has been reached. Try again later.')
    if(data.reused)await refresh.current()
    setJobs(current=>({...current,[song.youtubeVideoId]:{status:'queued',progress:0,stage:'queued'}}));setPoll(current=>current+1)
   }else{await onAdd(song);setAdded(current=>[...current,song.id])}
  }catch(error){if(alive.current)setError(error.message)}finally{lock.current=false;if(alive.current)setAdding(null)}
 }
 return <dialog ref={dialog} className="km-add-songs-dialog" aria-labelledby="add-playlist-songs-title" onCancel={event=>{event.preventDefault();if(!adding)onClose()}}><header><div className="km-section-heading"><div><h2 id="add-playlist-songs-title">Add songs</h2><p className="km-muted">{playlist.name}</p></div><button type="button" className="km-icon-button" aria-label="Close add songs" disabled={!!adding} onClick={onClose}><Icon name="close"/></button></div><label className="km-search"><Icon name="search"/><input autoFocus aria-label="Search library to add songs" placeholder="Search songs, artists, or albums" value={query} onChange={event=>setQuery(event.target.value)} maxLength={100}/></label>{error&&<p className="km-alert" role="alert">{error} <button type="button" onClick={()=>setSearchRetry(value=>value+1)}>Try again</button></p>}<p className="km-muted" role="status">{added.length?`${added.length} ${added.length===1?'song':'songs'} added`:adult?'Search your library and more songs. Imports are added here automatically.':'Requested songs are added here automatically after an adult approves and the import completes.'}</p></header><div className="km-add-songs-results">{visible.map(song=>{
 const exists=included.has(song.id),job=jobs[song.youtubeVideoId],working=job&&['queued','processing','ready'].includes(job.status)
 const requested=requests.find(row=>row.status!=='declined'&&(row.mediaId===song.id||row.videoId&&row.videoId===song.youtubeVideoId)),sent=requested?.attached||requested?.playlistIds?.includes(playlist.id)
 const label=exists?'Already in playlist':song.requestOnly?(sent?'Requested':'Request'):song.discovery?(working?'Importing':job?.status==='failed'?'Retry download':'Download'):'Add'
 return <article key={song.id}><Artwork item={song}/><div><strong>{song.title}</strong><small>{song.album||'Single'} | {song.artist||'Unknown artist'}</small>{sent&&<small>Requested for this playlist</small>}{job?.status==='failed'&&<small className="km-discovery-error">Import failed. Tap to retry.</small>}</div><button type="button" className={song.requestOnly?'km-request-button km-btn--primary':exists?'':'km-btn--primary'} title={song.requestOnly?(sent?'Waiting for an adult':'Ask an adult to add this song'):undefined} disabled={exists||!!adding||!!sent||!!working} aria-label={`${label} ${song.title}`} onClick={()=>add(song)}>{working?<ImportProgressRing value={job.progress||0} stage={job.stage} title={song.title}/>:<><Icon name={exists||sent?'check':song.requestOnly?'help':song.discovery?'download':'plus'}/>{song.requestOnly?(sent?'Requested':'Request'):(exists?'Added':adding===song.id?'Adding...':song.discovery?'Import':'Add')}</>}</button></article>
 })}{searching&&<p className="km-muted" role="status">Finding more songs...</p>}{!visible.length&&!searching&&<div className="km-empty"><h3>{query?'No matching songs':'Your library is empty'}</h3><p>Search by song, artist, or album to find more music.</p></div>}{matches.length>50&&<p className="km-muted">Showing 50 of {matches.length} songs. Refine your search to find more.</p>}</div><footer><button type="button" disabled={!!adding} onClick={onClose}>Done</button></footer></dialog>
}
