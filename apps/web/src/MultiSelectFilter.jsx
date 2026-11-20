import React, { useEffect, useRef, useState } from 'react'
import { Icon } from './ui'

export function MultiSelectFilter({ label, options, value, onChange, disabled }) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState('')
  const root=useRef(null),trigger=useRef(null),search=useRef(null)
  useEffect(()=>{
    if(!open)return
    search.current?.focus()
    const outside=e=>{if(!root.current?.contains(e.target))setOpen(false)}
    const escape=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus()}}
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape)
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}
  },[open])
  const visible=options.filter(option=>option.toLowerCase().includes(query.toLowerCase()))
  const id=`song-filter-${label.toLowerCase()}`
  return <div ref={root} className="km-multiselect" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false)}}>
    <button type="button" ref={trigger} disabled={disabled} aria-expanded={open} aria-controls={id} className={value.length?'is-filtered':''} onClick={()=>{setOpen(v=>!v);setQuery('')}}><Icon name={label==='Artist'?'profile':'albums'}/>{label}{value.length>0&&<span className="km-filter-count">{value.length}</span>}<span aria-hidden="true">⌄</span></button>
    {open&&<div id={id} className="km-multiselect-panel"><label className="km-search"><Icon name="search"/><input ref={search} aria-label={`Search ${label.toLowerCase()} names`} placeholder={`Search ${label.toLowerCase()} names`} value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="km-filter-options">{visible.map(option=><label key={option}><input type="checkbox" checked={value.includes(option)} onChange={e=>onChange(e.target.checked?[...value,option]:value.filter(v=>v!==option))}/><span>{option||`Unknown ${label.toLowerCase()}`}</span></label>)}{!visible.length&&<p className="km-muted">No matching names.</p>}</div><div className="km-filter-footer"><span>{value.length?`${value.length} selected`:`All ${label.toLowerCase()}s`}</span><button disabled={!value.length} onClick={()=>onChange([])}>Clear</button></div></div>}
  </div>
}
