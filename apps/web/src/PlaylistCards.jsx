import { CoverUploadModal } from './CoverUploadModal'
import { playlistTiles } from './playlist-artwork.mjs'
import { CardMenu } from './CardMenu'
import React, { useEffect, useRef, useState } from 'react'
import { Artwork, Icon } from './ui'
import { canEditPlaylist } from './playlist-visibility.mjs'
function PlaylistActions({list,editable,busy,onQueue,onRename,onDelete,onUpload,onAutomatic}) {
  const items=[{label:'Add to queue',ariaLabel:`Add ${list.name} to queue`,icon:'plus',disabled:busy,onSelect:()=>onQueue(list)}]
  if(editable&&onUpload)items.push({label:'Upload cover art',icon:'upload',disabled:busy,onSelect:onUpload})
  if(editable&&list.thumbnailUrl&&onAutomatic)items.push({label:'Use album artwork',icon:'disc',disabled:busy,onSelect:onAutomatic})
  if(editable)items.push({label:'Rename',ariaLabel:`Rename ${list.name}`,icon:'edit',disabled:busy,onSelect:onRename},{label:'Delete',ariaLabel:`Delete ${list.name}`,icon:'trash',disabled:busy,onSelect:onDelete})
  return <CardMenu label={`More options for playlist ${list.name}`} id={`playlist-options-${list.id}`} items={items}/>
}
export function PlaylistArtwork({list,index,songs}) {
  const [failed,setFailed]=useState(null)
  if(list.thumbnailUrl&&failed!==list.thumbnailUrl)return <img className="km-artwork km-playlist-cover-image" src={list.thumbnailUrl} alt="" onError={()=>setFailed(list.thumbnailUrl)}/>
  return <span className="km-artwork km-playlist-artwork" aria-label="Playlist album-art collage">{playlistTiles(list.coverSongs,songs).map((song,tile)=><Artwork key={tile} item={song} index={index+tile}/>)}</span>
}
export function PlaylistCards({playlists,profile,songs=[],showOwners=false,onOpen,onQueue,onRename,onDelete,onCoverSave,onAutomaticCover}) {
  const [editing,setEditing]=useState(null),[name,setName]=useState(''),[deleting,setDeleting]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uploading,setUploading]=useState(null)
  const dialog=useRef(null)
  useEffect(()=>{if(deleting&&!dialog.current.open)dialog.current.showModal();else if(!deleting&&dialog.current.open)dialog.current.close()},[deleting])
  async function rename(event){event.preventDefault();setBusy(true);setError('');try{await onRename(editing,name.trim());setEditing(null)}catch(error){setError(error.message)}finally{setBusy(false)}}
  async function remove(){setBusy(true);setError('');try{await onDelete(deleting.id);setDeleting(null)}catch(error){setError(error.message)}finally{setBusy(false)}}
  return <>{error&&!deleting&&<p className="km-alert" role="alert">{error}</p>}<div className="km-grid">{playlists.map((list,index)=><article className="km-playlist-card" key={list.id}><PlaylistActions list={list} editable={canEditPlaylist(list,profile)} busy={busy} onQueue={onQueue} onRename={()=>{setError('');setName(list.name);setEditing(list.id)}} onDelete={()=>{setError('');setDeleting(list)}} onUpload={onCoverSave?()=>setUploading(list):undefined} onAutomatic={onAutomaticCover?async()=>{setBusy(true);setError('');try{await onAutomaticCover(list)}catch(error){setError(error.message)}finally{setBusy(false)}}:undefined}/><button className="km-music-card" onClick={()=>onOpen(list)}><PlaylistArtwork list={list} index={index+1} songs={songs}/><strong>{list.name}</strong><small>{showOwners?`By ${list.creatorName||(list.creatorId===profile.id?profile.name:'another profile')}${list.creatorId===profile.id?' (you)':''}`:list.creatorId===profile.id?'Created by you':`By ${list.creatorName||'another profile'}`}</small></button>{canEditPlaylist(list,profile)&&<>{editing===list.id?<form className="km-playlist-rename" onSubmit={rename}><label>Playlist name<input aria-label={`New name for ${list.name}`} value={name} onChange={event=>setName(event.target.value)} required maxLength={80} disabled={busy}/></label><div><button type="submit" disabled={busy||!name.trim()}>Save</button><button type="button" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button></div></form>:null}</>}</article>)}</div>
    <dialog ref={dialog} className="km-playlist-picker" aria-labelledby="delete-playlist-title" onCancel={event=>{event.preventDefault();if(!busy)setDeleting(null)}} onClose={()=>setDeleting(null)}><header><h2 id="delete-playlist-title">Delete playlist?</h2></header><p>Are you sure you want to delete {deleting?.name}?</p><p>The songs will stay in your music library.</p>{error&&<p className="km-alert" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</button><button type="button" className="km-btn--primary" disabled={busy} onClick={remove}>{busy?'Deleting…':'Delete playlist'}</button></footer></dialog>
    <CoverUploadModal playlist={uploading} onSave={onCoverSave} onClose={()=>setUploading(null)}/>
  </>
}
