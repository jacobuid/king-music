import React, { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './ui'
export function PlaylistPicker({song,playlists,onSave,onClose}) {
  const dialog=useRef(null),titleId=useId()
  const [selected,setSelected]=useState([]),[added,setAdded]=useState([]),[saving,setSaving]=useState(false),[error,setError]=useState('')
  useEffect(()=>{if(song){setSelected([]);setAdded([]);setError('');if(!dialog.current.open)dialog.current.showModal()}else if(dialog.current.open)dialog.current.close()},[song?.id])
  async function submit(event){
    event.preventDefault();setSaving(true);setError('');const failed=[],successful=[]
    for(const id of selected){try{await onSave(id,song.id);successful.push(id)}catch(error){failed.push({id,message:error.message})}}
    setAdded(current=>[...current,...successful]);setSelected(failed.map(item=>item.id));setSaving(false)
    if(failed.length)setError(failed.map(item=>`${playlists.find(list=>list.id===item.id)?.name||'Playlist'}: ${item.message}`).join(' '));else onClose()
  }
  return <dialog ref={dialog} className="km-playlist-picker" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();if(!saving)onClose()}} onClose={onClose}>
    <header><h2 id={titleId}>Add to playlists</h2><button type="button" className="km-icon-button" aria-label="Close playlist picker" disabled={saving} onClick={onClose}><Icon name="close"/></button></header><p>{song?.title}{song?.description&&<small>{song.description}</small>}</p>
    <form onSubmit={submit}>{playlists.length?<fieldset disabled={saving}><legend className="km-visually-hidden">Choose playlists</legend>{playlists.map(list=><label key={list.id}><input type="checkbox" checked={selected.includes(list.id)||added.includes(list.id)} disabled={added.includes(list.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,list.id]:current.filter(id=>id!==list.id))}/><Icon name="playlists"/><span>{list.name}</span>{added.includes(list.id)&&<small>Added</small>}</label>)}</fieldset>:<p className="km-muted">Create a playlist in Playlists first, then add songs here.</p>}{error&&<p className="km-alert" role="alert">{error}</p>}
    <footer><button type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="km-btn--primary" disabled={saving||!selected.length} type="submit">{saving?'Adding…':`Add to ${selected.length||''} ${selected.length===1?'playlist':'playlists'}`}</button></footer></form>
  </dialog>
}
