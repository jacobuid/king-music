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
function SongRow({song,index,currentId,busy,onPlay,onQueue,onChoosePlaylists,onShare,onDownload,onAlbum,onRemoveFromPlaylist}) {
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
  return <article className="km-library-song" data-current={active?'true':undefined}>
    <div className="km-library-track"><button type="button" className="km-library-play" aria-label={`Play ${song.title}`} disabled={busy} onClick={()=>onPlay(song)}><Icon name="play"/></button><Artwork item={song} index={index}/><div className="km-library-track-info"><strong>{song.title}</strong><small>{song.artist||'Unknown artist'}</small><small className="km-library-mobile-meta"><span>{song.album||'Single'}</span><span>{duration}</span></small></div></div>
    <span className="km-library-album">{song.album||'Single'}</span><span className="km-library-duration">{duration}</span>
    <button type="button" className="km-library-add" aria-label={`Add ${song.title} to playlists`} onClick={()=>onChoosePlaylists(song)}><Icon name="plus"/></button>
    <div ref={menu} className="km-library-more"><button ref={trigger} type="button" className="km-library-more-trigger" aria-label={`More options for ${song.title}`} aria-expanded={open} aria-controls={`song-options-${song.id}`} onClick={()=>{setError('');setNotice('');setOpen(value=>!value)}}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="20" cy="12" r="2"/></svg></button>{open&&<div id={`song-options-${song.id}`} className="km-library-song-options"><button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{setNotice(await onShare(song))}catch(error){if(error.name!=='AbortError')setError(error.message)}finally{setSaving(false)}}}><Icon name="share"/>Share song</button><button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{await onDownload(song);setNotice('Download started.')}catch(error){setError(error.message)}finally{setSaving(false)}}}><Icon name="download"/>Download locally</button><button type="button" onClick={()=>{onQueue(song);setOpen(false)}}><Icon name="plus"/>Add to queue</button><button type="button" disabled={!song.album} onClick={()=>{onAlbum(song);setOpen(false)}}><Icon name="disc"/>Go to album</button><button type="button" onClick={()=>{onChoosePlaylists(song);setOpen(false)}}><Icon name="playlists"/>Add to playlists</button>{onRemoveFromPlaylist&&<button type="button" disabled={saving} onClick={async()=>{setSaving(true);setError('');try{await onRemoveFromPlaylist(song);setOpen(false)}catch(error){setError(error.message)}finally{setSaving(false)}}}><Icon name="minus"/>Remove from this playlist</button>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}</div>}</div>
  </article>
}
export function SongList({songs,currentId,busy,onPlay,onQueue,playlists=[],onSave,onShare=shareSong,onDownload,onAlbum,onRemoveFromPlaylist}) {
  const [playlistSong,setPlaylistSong]=useState(null),[removingSong,setRemovingSong]=useState(null)
  return <><div className="km-library-song-list"><div className="km-library-song-heading" aria-hidden="true"><span>TRACK</span><span>ALBUM</span><span>DURATION</span><span/><span/></div>{songs.map((song,index)=><SongRow key={song.id} {...{song,index,currentId,busy,onPlay,onQueue,onShare,onDownload,onAlbum}} onRemoveFromPlaylist={onRemoveFromPlaylist?song=>setRemovingSong(song):undefined} onChoosePlaylists={setPlaylistSong}/>)}</div><PlaylistPicker song={playlistSong} playlists={playlists} onSave={onSave} onClose={()=>setPlaylistSong(null)}/><ConfirmDialog open={!!removingSong} title="Remove song from playlist?" message={`Are you sure you want to remove ${removingSong?.title||'this song'} from this playlist?`} confirmLabel="Remove from playlist" onConfirm={()=>onRemoveFromPlaylist(removingSong)} onClose={()=>setRemovingSong(null)}/></>
}