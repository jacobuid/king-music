import { ConfirmDialog } from './ConfirmDialog'
import { shareSong } from './song-actions.mjs'
import { PlaylistPicker } from './PlaylistPicker'
import React, { useEffect, useRef, useState } from 'react'
import { Artwork, Icon } from './ui'
export function songDuration(value) {
  const seconds=Math.floor(Number(value))
  if(!Number.isFinite(seconds)||seconds<=0)return 'Unavailable'
  const minutes=Math.floor(seconds/60),remaining=seconds%60
  return `${minutes} ${minutes===1?'min':'mins'} ${remaining} ${remaining===1?'sec':'secs'}`
}
function SongRow({song,index,currentId,busy,onPlay,onQueue,onChoosePlaylists,onShare,onDownload,onAlbum,onRemoveFromPlaylist,playlistView,reorderControls}) {
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
  const duration=songDuration(song.durationSeconds)
  return <article className="km-library-song" data-song-id={song.id} data-current={active?'true':undefined}>
    <div className="km-library-track"><button type="button" className="km-library-play" aria-label={`Play ${song.title}`} disabled={busy} onClick={()=>onPlay(song)}><Icon name="play"/></button><Artwork item={song} index={index}/><div className="km-library-track-info"><strong>{song.title}</strong>{playlistView?<small className="km-playlist-song-meta">{song.album||'Single'} <span aria-hidden="true">|</span> {song.artist||'Unknown artist'}</small>:<><small>{song.artist||'Unknown artist'}</small><small className="km-library-mobile-meta"><span>{song.album||'Single'}</span><span>{duration}</span></small></>}</div></div>
    {!playlistView&&<><span className="km-library-album">{song.album||'Single'}</span><span className="km-library-duration">{duration}</span></>}{reorderControls}
    <button type="button" className="km-library-add" aria-label={`Add ${song.title} to playlists`} onClick={()=>onChoosePlaylists(song)}><Icon name="plus"/></button>
    <div ref={menu} className="km-library-more"><button ref={trigger} type="button" className="km-library-more-trigger" aria-label={`More options for ${song.title}`} aria-expanded={open} aria-controls={`song-options-${song.id}`} onClick={()=>{setError('');setNotice('');setOpen(value=>!value)}}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="12" r="2"/></svg></button>{open&&<div id={`song-options-${song.id}`} className="km-library-song-options"><button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{setNotice(await onShare(song))}catch(error){if(error.name!=='AbortError')setError(error.message)}finally{setSaving(false)}}}><Icon name="share"/>Share song</button><button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{await onDownload(song);setNotice('Download started.')}catch(error){setError(error.message)}finally{setSaving(false)}}}><Icon name="download"/>Download locally</button><button type="button" onClick={()=>{onQueue(song);setOpen(false)}}><Icon name="plus"/>Add to queue</button><button type="button" disabled={!song.album} onClick={()=>{onAlbum(song);setOpen(false)}}><Icon name="disc"/>Go to album</button><button type="button" onClick={()=>{onChoosePlaylists(song);setOpen(false)}}><Icon name="playlists"/>Add to playlists</button>{onRemoveFromPlaylist&&<button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{await onRemoveFromPlaylist(song);setOpen(false)}catch(error){setError(error.message)}finally{setSaving(false)}}}><Icon name="minus"/>Remove from this playlist</button>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</div>}</div>
  </article>
}
export function SongList({songs,currentId,busy,onPlay,onQueue,playlists=[],onSave,onShare=shareSong,onDownload,onAlbum,onRemoveFromPlaylist,playlistView=false,onReorder}) {
  const [playlistSong,setPlaylistSong]=useState(null),[removingSong,setRemovingSong]=useState(null)
  const [moving,setMoving]=useState(false),[orderError,setOrderError]=useState(''),[dropTarget,setDropTarget]=useState(null)
  const drag=useRef(null)
  async function move(from,to){if(!onReorder||moving||busy||from===to||to<0||to>=songs.length)return;const ids=songs.map(song=>song.id),[id]=ids.splice(from,1);ids.splice(to,0,id);setMoving(true);setOrderError('');try{await onReorder(ids)}catch(error){setOrderError(error.message)}finally{setMoving(false)}}
  function dragStart(event,song){if(event.button!==0||moving||busy)return;drag.current={id:song.id,x:event.clientX,y:event.clientY,target:song.id,moved:false};event.currentTarget.setPointerCapture(event.pointerId)}
  function dragMove(event){const current=drag.current;if(!current)return;if(Math.hypot(event.clientX-current.x,event.clientY-current.y)<6&&!current.moved)return;current.moved=true;const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-song-id]');if(target){current.target=target.dataset.songId;setDropTarget(current.target)}}
  function dragEnd(){const current=drag.current;drag.current=null;setDropTarget(null);if(current?.moved)move(songs.findIndex(song=>song.id===current.id),songs.findIndex(song=>song.id===current.target))}
  const controls=(song,index)=>onReorder?<div className="km-playlist-reorder" data-drop-target={dropTarget===song.id?'true':undefined}><button type="button" className="km-icon-button km-playlist-drag" aria-label={`Drag to reorder ${song.title}`} disabled={busy||moving} onPointerDown={event=>dragStart(event,song)} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={()=>{drag.current=null;setDropTarget(null)}} onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();move(index,index+(event.key==='ArrowUp'?-1:1))}}}><Icon name="menu"/></button><button type="button" className="km-icon-button" aria-label={`Move ${song.title} up`} disabled={busy||moving||index===0} onClick={()=>move(index,index-1)}><Icon name="chevron-up"/></button><button type="button" className="km-icon-button" aria-label={`Move ${song.title} down`} disabled={busy||moving||index===songs.length-1} onClick={()=>move(index,index+1)}><Icon name="chevron-down"/></button></div>:null
  return <>{orderError&&<p className="km-alert" role="alert">{orderError}</p>}<div className={`km-library-song-list ${playlistView?`km-playlist-song-list ${onReorder?'':'km-playlist-readonly'}`:''}`}>{!playlistView&&<div className="km-library-song-heading" aria-hidden="true"><span>TRACK</span><span>ALBUM</span><span>DURATION</span><span/><span/></div>}{songs.map((song,index)=><SongRow key={song.id} {...{song,index,currentId,onPlay,onQueue,onShare,onDownload,onAlbum,playlistView}} busy={busy||moving} reorderControls={controls(song,index)} onRemoveFromPlaylist={onRemoveFromPlaylist?song=>setRemovingSong(song):undefined} onChoosePlaylists={setPlaylistSong}/>)}</div><PlaylistPicker song={playlistSong} playlists={playlists} onSave={onSave} onClose={()=>setPlaylistSong(null)}/><ConfirmDialog open={!!removingSong} title="Remove song from playlist?" message={`Are you sure you want to remove ${removingSong?.title||'this song'} from this playlist?`} confirmLabel="Remove from playlist" onConfirm={()=>onRemoveFromPlaylist(removingSong)} onClose={()=>setRemovingSong(null)}/></>
}