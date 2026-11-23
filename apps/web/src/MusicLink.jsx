import React from 'react'
import {pageHash} from './page-routing.mjs'
export function MusicLink({item,kind='artist',children}) {
 const value=item?.[kind]
 if(!value)return <>{children|| (kind==='album'?'Single':'Unknown artist')}</>
 const filter=kind==='album'?{album:value,artist:item.artist||''}:{artist:value}
 return <a className="km-metadata-link" href={pageHash({section:kind,filter})} onClick={event=>event.stopPropagation()}>{children||value}</a>
}
