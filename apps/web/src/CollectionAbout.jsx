import React,{useRef,useState} from 'react'
import {Icon} from './ui'
export function AboutText({text,sourceUrl,compact=false}){
 const [expanded,setExpanded]=useState(false),dialog=useRef(null)
 const length=compact?180:480,short=text.length>length
 return <><p className={compact?'km-album-description':'km-artist-description'}>{short&&!expanded?text.slice(0,length).trimEnd()+'…':text}</p>{(short||compact)&&<button type="button" className="km-text-button" onClick={()=>compact?dialog.current.showModal():setExpanded(value=>!value)}>{compact&&!short?'About this album':expanded?'Show less':'Read more'}</button>}{sourceUrl&&<small className="km-collection-source">Source: YouTube Music</small>}{compact&&<dialog ref={dialog} className="km-playlist-picker km-collection-about-dialog" aria-label="About this album"><header><h2>About this album</h2><button type="button" className="km-icon-button" aria-label="Close album information" onClick={()=>dialog.current.close()}><Icon name="close"/></button></header><p>{text}</p>{sourceUrl&&<small className="km-collection-source">Source: YouTube Music</small>}</dialog>}</>
}
export function collectionLength(songs){
 if(!songs.length||songs.some(song=>!(Number(song.durationSeconds)>0)))return ''
 const minutes=Math.max(1,Math.round(songs.reduce((sum,song)=>sum+Number(song.durationSeconds),0)/60))
 return `${minutes} ${minutes===1?'minute':'minutes'}`
}
