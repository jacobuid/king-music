import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './ui'
export function CardMenu({label,id,items,disabled=false}) {
  const [open,setOpen]=useState(false),[position,setPosition]=useState({left:0,top:0})
  const trigger=useRef(null),menu=useRef(null)
  function locate(height){const rect=trigger.current.getBoundingClientRect(),width=Math.min(190,innerWidth-24);return {left:Math.max(12,Math.min(rect.right-width,innerWidth-width-12)),top:Math.max(12,Math.min(rect.bottom+6,innerHeight-height-12))}}
  useLayoutEffect(()=>{if(open)setPosition(locate(menu.current.getBoundingClientRect().height))},[open])
  useEffect(()=>{
    if(!open)return
    const outside=event=>{if(!trigger.current?.contains(event.target)&&!menu.current?.contains(event.target))setOpen(false)}
    const escape=event=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus()}}
    const close=()=>setOpen(false)
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);window.addEventListener('resize',close);window.addEventListener('scroll',close,true)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);window.removeEventListener('resize',close);window.removeEventListener('scroll',close,true)}
  },[open])
  return <div className="km-playlist-actions"><button ref={trigger} type="button" className="km-playlist-actions-trigger" aria-label={label} aria-expanded={open} aria-controls={id} disabled={disabled} onClick={()=>{setPosition(locate(items.length*44+24));setOpen(value=>!value)}}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4" r="2.4"/><circle cx="12" cy="12" r="2.4"/><circle cx="12" cy="20" r="2.4"/></svg></button>{open&&createPortal(<div ref={menu} id={id} className="km-library-song-options km-playlist-options" style={{position:'fixed',left:position.left,top:position.top,right:'auto',zIndex:85,maxWidth:'calc(100vw - 24px)'}}>{items.map(item=><button key={item.label} type="button" aria-label={item.ariaLabel} disabled={item.disabled} onClick={()=>{trigger.current?.focus();setOpen(false);item.onSelect()}}><Icon name={item.icon}/>{item.label}</button>)}</div>,document.body)}</div>
}
