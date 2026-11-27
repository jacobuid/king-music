import { MusicLink } from './MusicLink'
import { ConfirmDialog } from './ConfirmDialog'
import { shareSong } from './song-actions.mjs'
import { PlaylistPicker } from './PlaylistPicker'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Artwork, Icon } from './ui'
export function songDuration(value) {
  const seconds=Math.floor(Number(value))
  if(!Number.isFinite(seconds)||seconds<=0)return 'Unavailable'
  const minutes=Math.floor(seconds/60),remaining=seconds%60
  return `${minutes} ${minutes===1?'min':'mins'} ${remaining} ${remaining===1?'sec':'secs'}`
}
function SongRow({song,index,currentId,busy,onPlay,onQueue,onChoosePlaylists,onShare,onDownload,onAlbum,onArtist,onRemoveFromPlaylist,playlistView,albumView,reorderControls,rowStyle,dragged,onImportSong,importStates}) {
  const [open,setOpen]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const menu=useRef(null),trigger=useRef(null)
  useEffect(()=>{
    if(!open)return
    const outside=event=>{if(!menu.current?.contains(event.target))setOpen(false)}
    const escape=event=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false);trigger.current?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[open])
  const active=currentId===song.id
  const seconds=Math.floor(Number(song.durationSeconds))
  const duration=albumView?(Number.isFinite(seconds)&&seconds>0?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'?'):songDuration(song.durationSeconds)
  if(song.discovery){const state=importStates?.[song.youtubeVideoId],working=['queued','processing'].includes(state?.status);return <article className="km-library-song" data-song-id={song.id}><div className="km-library-track"><button type="button" className="km-library-play km-discovery-download" disabled={working||busy} aria-label={(working?'Importing ':state?.status==='failed'?'Retry download ':'Download ')+song.title} onClick={()=>onImportSong(song)}>{working?<svg className="km-download-ring" viewBox="0 0 32 32" role="progressbar" aria-label={'Importing '+song.title}><circle cx="16" cy="16" r="12"/></svg>:<Icon name="download"/>}</button><Artwork item={song}/><div className="km-library-track-info"><strong>{song.title}</strong><small>{song.artist||'Unknown artist'}</small><small className="km-library-mobile-meta">{song.album||'Single'}</small>{state?.status==='failed'&&<p className="km-discovery-error" role="alert">{state.error||'Download failed. Tap to retry.'}</p>}</div></div><span className="km-library-album">{song.album||'Single'}</span><span/></article>}
  return <article className="km-library-song" data-song-id={song.id} style={rowStyle} data-dragged={dragged?'true':undefined} data-current={active?'true':undefined}>
    {playlistView&&reorderControls}<div className="km-library-track"><button type="button" className="km-library-play" aria-label={`Play ${song.title}`} disabled={busy} onClick={()=>onPlay(song)}><span className="km-album-track-number">{song.trackNumber||song.albumPosition||index+1}</span><Icon name="play"/></button>{!albumView&&<Artwork item={song} index={index}/>}<div className="km-library-track-info"><strong>{song.title}</strong>{albumView?<small className="km-album-song-plays">{Number(song.playCount||0).toLocaleString()} {Number(song.playCount||0)===1?'play':'plays'}</small>:playlistView?<small className="km-playlist-song-meta"><MusicLink item={song} kind="album"/> <span aria-hidden="true">|</span> <MusicLink item={song}/></small>:<><small><MusicLink item={song}/></small><small className="km-library-mobile-meta"><span><MusicLink item={song} kind="album"/></span></small></>}</div></div>
    {!playlistView&&<>{!albumView&&<span className="km-library-album"><MusicLink item={song} kind="album"/></span>}{albumView&&<span className="km-library-duration">{duration}</span>}</>}
    <div ref={menu} className="km-library-more"><button ref={trigger} type="button" className="km-library-more-trigger" aria-label={`More options for ${song.title}`} aria-expanded={open} aria-controls={`song-options-${song.id}`} onClick={()=>{setError('');setNotice('');setOpen(value=>!value)}}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="12" r="2"/></svg></button>{open&&<div id={`song-options-${song.id}`} className="km-library-song-options"><button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{setNotice(await onShare(song))}catch(error){if(error.name!=='AbortError')setError(error.message)}finally{setSaving(false)}}}><Icon name="share"/>Share song</button><button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{await onDownload(song);setNotice('Download started.')}catch(error){setError(error.message)}finally{setSaving(false)}}}><Icon name="download"/>Download locally</button><button type="button" onClick={()=>{onQueue(song);setOpen(false)}}><Icon name="plus"/>Add to queue</button><button type="button" disabled={!song.album} onClick={()=>{onAlbum(song);setOpen(false)}}><Icon name="disc"/>Go to album</button>{onArtist&&<button type="button" disabled={!song.artist} onClick={()=>{onArtist(song);setOpen(false)}}><Icon name="profile"/>Go to artist</button>}<button type="button" onClick={()=>{onChoosePlaylists(song);setOpen(false)}}><Icon name="playlists"/>Add to playlists</button>{onRemoveFromPlaylist&&<button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{await onRemoveFromPlaylist(song);setOpen(false)}catch(error){setError(error.message)}finally{setSaving(false)}}}><Icon name="minus"/>Remove from this playlist</button>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</div>}</div>
  </article>
}
export function SongList({songs,currentId,busy,onPlay,onQueue,playlists=[],onSave,onShare=shareSong,onDownload,onAlbum,onArtist,onRemoveFromPlaylist,playlistView=false,albumView=false,onReorder,onImportSong,importStates}) {
  const [playlistSong,setPlaylistSong]=useState(null),[removingSong,setRemovingSong]=useState(null)
  const [moving,setMoving]=useState(false),[orderError,setOrderError]=useState(''),[dragVisual,setDragVisual]=useState(null),[optimisticIds,setOptimisticIds]=useState(null)
  const drag=useRef(null),list=useRef(null),animationFrom=useRef(null),animations=useRef([])
  const byId=new Map(songs.map(song=>[song.id,song]))
  const displaySongs=optimisticIds?optimisticIds.map(id=>byId.get(id)).filter(Boolean):songs
  const orderKey=displaySongs.map(song=>song.id).join('|')
  function measure(){return new Map(Array.from(list.current?.querySelectorAll('[data-song-id]')||[],row=>[row.dataset.songId,row.getBoundingClientRect()]))}
  useLayoutEffect(()=>{
    const before=animationFrom.current
    if(!before)return
    animationFrom.current=null
    animations.current.forEach(animation=>animation.cancel());animations.current=[]
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return
    for(const row of list.current?.querySelectorAll('[data-song-id]')||[]){
      const old=before.get(row.dataset.songId),now=row.getBoundingClientRect()
      if(!old||!now.width||!now.height)continue
      const x=old.left-now.left,y=old.top-now.top,sx=old.width/now.width,sy=old.height/now.height
      if(Math.abs(x)+Math.abs(y)+Math.abs(sx-1)+Math.abs(sy-1)<.5)continue
      animations.current.push(row.animate([{transform:`translate3d(${x}px,${y}px,0) scale(${sx},${sy})`},{transform:'none'}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'}))
    }
  },[orderKey,dragVisual])
  useEffect(()=>()=>animations.current.forEach(animation=>animation.cancel()),[])
  async function move(from,to){
    if(!onReorder||moving||busy||from===to||from<0||to<0||to>=displaySongs.length)return
    const ids=displaySongs.map(song=>song.id),[id]=ids.splice(from,1);ids.splice(to,0,id)
    if(!animationFrom.current)animationFrom.current=measure()
    setOptimisticIds(ids);setMoving(true);setOrderError('')
    try{await onReorder(ids)}catch(error){animationFrom.current=measure();setOrderError(error.message)}finally{setOptimisticIds(null);setMoving(false)}
  }
  function dragStart(event,song){
    if(event.button!==0||moving||busy)return
    const rows=Array.from(list.current.querySelectorAll('[data-song-id]')),rects=rows.map(row=>row.getBoundingClientRect()),index=displaySongs.findIndex(item=>item.id===song.id)
    drag.current={id:song.id,y:event.clientY,scrollY:window.scrollY,index,target:index,rects,ids:displaySongs.map(song=>song.id),moved:false}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function dragMove(event){
    const current=drag.current;if(!current)return
    const delta=event.clientY-current.y+window.scrollY-current.scrollY
    if(Math.abs(delta)<6&&!current.moved)return
    current.moved=true
    const center=current.rects[current.index].top+current.rects[current.index].height/2+delta
    let target=0,distance=Infinity
    current.rects.forEach((rect,index)=>{const value=Math.abs(center-(rect.top+rect.height/2));if(value<distance){target=index;distance=value}})
    current.target=target
    const ids=[...current.ids],removed=ids.splice(current.index,1)[0];ids.splice(target,0,removed)
    const offsets={},heights=new Map(current.ids.map((id,index)=>[id,current.rects[index].height])),gap=current.rects.length>1?current.rects[1].top-current.rects[0].bottom:2
    let top=current.rects[0].top
    for(const id of ids){offsets[id]=top-current.rects[current.ids.indexOf(id)].top;top+=heights.get(id)+gap}
    offsets[current.id]=delta
    setDragVisual({id:current.id,offsets})
  }
  function cancelDrag(){animationFrom.current=drag.current?.moved?measure():null;drag.current=null;setDragVisual(null)}
  function dragEnd(){const current=drag.current;if(!current)return;animationFrom.current=current.moved?measure():null;drag.current=null;setDragVisual(null);if(current.moved)move(current.index,current.target)}
  const controls=(song,index)=>onReorder?<div className="km-playlist-reorder" ><button type="button" className="km-icon-button" aria-label={`Move ${song.title} up`} disabled={busy||moving||index===0} onClick={()=>move(index,index-1)}><Icon name="chevron-up"/></button><button type="button" className="km-icon-button km-playlist-drag" aria-label={`Drag to reorder ${song.title}`} disabled={busy||moving} onPointerDown={event=>dragStart(event,song)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={cancelDrag} onLostPointerCapture={()=>{if(drag.current)cancelDrag()}} onKeyDown={event=>{if(event.key==='Escape'&&drag.current){event.preventDefault();cancelDrag();return}if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();move(index,index+(event.key==='ArrowUp'?-1:1))}}}><Icon name="menu"/></button><button type="button" className="km-icon-button" aria-label={`Move ${song.title} down`} disabled={busy||moving||index===displaySongs.length-1} onClick={()=>move(index,index+1)}><Icon name="chevron-down"/></button></div>:null
  return <>{orderError&&<p className="km-alert" role="alert">{orderError}</p>}<div ref={list} className={`km-library-song-list ${dragVisual?'is-dragging':''} ${albumView?'km-album-song-list':''} ${playlistView?`km-playlist-song-list ${onReorder?'':'km-playlist-readonly'}`:''}`}>{!playlistView&&!albumView&&<div className="km-library-song-heading" aria-hidden="true"><span>TRACK</span><span>ALBUM</span><span/></div>}{displaySongs.map((song,index)=><SongRow key={song.id} {...{song,index,currentId,onPlay,onQueue,onShare,onDownload,onAlbum,onArtist,playlistView,albumView,onImportSong,importStates}} busy={busy||moving} dragged={dragVisual?.id===song.id} rowStyle={dragVisual?{transform:`translate3d(0,${dragVisual.offsets[song.id]||0}px,0)${dragVisual.id===song.id?' scale(1.015)':''}`} :undefined} reorderControls={controls(song,index)} onRemoveFromPlaylist={onRemoveFromPlaylist?song=>setRemovingSong(song):undefined} onChoosePlaylists={setPlaylistSong}/>)}</div><PlaylistPicker song={playlistSong} playlists={playlists} onSave={onSave} onClose={()=>setPlaylistSong(null)}/><ConfirmDialog open={!!removingSong} title="Remove song from playlist?" message={`Are you sure you want to remove ${removingSong?.title||'this song'} from this playlist?`} confirmLabel="Remove from playlist" onConfirm={()=>onRemoveFromPlaylist(removingSong)} onClose={()=>setRemovingSong(null)}/></>
}