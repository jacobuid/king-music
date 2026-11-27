import React,{useId} from 'react'
export function PlaylistScopeControl({value,onChange}){
 const name=useId()
 return <fieldset className="km-playlist-scope"><legend className="km-visually-hidden">Playlist view</legend>{[['mine','My playlists'],['all','All playlists']].map(([scope,label])=><label key={scope}><input type="radio" name={name} value={scope} checked={value===scope} onChange={()=>onChange(scope)}/><span>{label}</span></label>)}</fieldset>
}
