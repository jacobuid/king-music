import React, { useState } from 'react'
import { Artwork } from './ui'
import { CardMenu } from './CardMenu'
import { albumId } from './album-actions.mjs'
export function AlbumCard({album,index=0,onOpen,onQueue,onPlaylist,onDownload}) {
  const [progress,setProgress]=useState(null),[error,setError]=useState('')
  async function download(){setError('');setProgress({done:0,total:0});try{await onDownload(album,setProgress)}catch(error){setError(error.message)}finally{setProgress(null)}}
  const items=[{label:'Add to queue',icon:'plus',onSelect:()=>onQueue(album)},{label:'Add to playlist',icon:'playlists',onSelect:()=>onPlaylist(album)},{label:'Download album',icon:'download',onSelect:download}]
  return <article className="km-album-card"><CardMenu label={`More options for album ${album.album}`} id={`album-options-${albumId(album)}`} items={items} disabled={!!progress}/><button type="button" className="km-music-card" aria-label={`Open album ${album.album}`} onClick={()=>onOpen(album)}><Artwork item={album} index={index}/><strong>{album.album}</strong><small>{album.artist||'Unknown artist'}</small></button>{progress&&<small role="status">Preparing download{progress.total?` ${progress.done} of ${progress.total}`:'...'}</small>}{error&&<p className="km-album-download-error" role="alert">{error}</p>}</article>
}
