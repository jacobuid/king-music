import React,{useEffect,useRef,useState} from 'react'
import {Icon} from './ui'
export function PlayerMenu({items,songId,disabled}){
 const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null)
 useEffect(()=>setOpen(false),[songId])
 useEffect(()=>{if(!open)return;const outside=event=>{if(!root.current?.contains(event.target))setOpen(false)},escape=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape,true);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape,true)}},[open])
 return <div className="km-player-menu" ref={root}><button ref={trigger} type="button" className="km-icon-button" aria-label="Now Playing options" aria-expanded={open} aria-controls="now-playing-options" disabled={disabled} onClick={()=>setOpen(value=>!value)}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="20" r="2"/></svg></button>{open&&<div id="now-playing-options" className="km-player-menu-options" aria-label="Song actions">{items.map(item=><button key={item.label} type="button" disabled={item.disabled} title={item.title} onClick={()=>{setOpen(false);trigger.current?.focus();item.onSelect()}}><Icon name={item.icon}/><span>{item.label}</span></button>)}</div>}</div>
}
