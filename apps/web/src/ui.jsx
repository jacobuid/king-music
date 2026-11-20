import React, { useEffect, useRef, useState } from 'react'
const asset = name => `${import.meta.env.BASE_URL}${name}`
export function Icon({ name, ...props }) {
  const paths = {
    check: 'm5 12 4 4 10-10',
    settings: 'm9 3-1 3-3 1-2 3 2 2v3l3 2 1 4h6l1-4 3-2v-3l2-2-2-3-3-1-1-3Zm7 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
    music: 'M9 18V5l12-2v13M9 8l12-2M9 18c0 2-6 4-6 1s6-4 6-1Zm12-2c0 2-6 4-6 1s6-4 6-1Z',
    albums: 'm12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5',
    playlists: 'M3 5h12M3 10h12M3 15h7m7-3v8m-4-4h8',
    search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
    link: 'm10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1',
    upload: 'M12 16V7m-4 4 4-4 4 4M7 20H5a4 4 0 0 1-1-8 8 8 0 0 1 15-3 5 5 0 0 1 0 11h-2',
    profile: 'M20 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
    admin: 'm12 3 9 4v5c0 5-9 10-9 10S3 17 3 12V7Zm-4 9 3 3 5-6',
    menu: 'M4 6h16M4 12h16M4 18h16',
    play: 'm8 4 12 8-12 8Z', pause: 'M8 5v14M16 5v14', next: 'm5 4 11 8-11 8ZM20 4v16',
    plus: 'M12 5v14M5 12h14', volume: 'm11 5-6 4H2v6h3l6 4ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14', close: 'm6 6 12 12M6 18 18 6',
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.music}/></svg>
}
export function Brand(){return <img className="km-brand" src={asset('logo.png')} alt="King Music"/>}
export function Artwork({ item, index=0, className='' }) {
  return item?.thumbnailUrl ? <img className={`km-artwork ${className}`} src={item.thumbnailUrl} alt=""/> : <span className={`km-artwork km-artwork--generated km-artwork--${index%4} ${className}`} aria-hidden="true"><Icon name="music"/><span className="km-art-lines"/></span>
}
export function Shell({ profile, section, onNavigate, onSwitch, children }) {
  const [expanded,setExpanded]=useState(false)
  const items=[['home','Home'],['library','Music'],['playlists','Playlists'],['albums','Albums']]
  const iconFor=id=>({library:'music',albums:'albums',home:'home',playlists:'playlists',admin:'admin'}[id])
  const links=items.map(([id,label])=><button key={id} title={label} aria-label={label} aria-current={section===id?'page':undefined} onClick={()=>onNavigate(id)}><Icon name={iconFor(id)}/><span className="km-nav-label">{label}</span></button>)
  return <div className={`km-app km-shell ${expanded?'km-shell--expanded':''}`}>
    <aside className="km-sidebar"><Brand/><button className="km-sidebar-toggle km-icon-button" aria-label={expanded?'Collapse sidebar':'Expand sidebar'} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}><Icon name="menu"/></button><p className="km-sidebar-caption">YOUR SOUND. YOUR SPACE.</p><nav aria-label="Main navigation">{links}</nav></aside>
    <div className="km-content"><header className="km-mobile-header"><Brand/><button className="km-icon-button" aria-label="Search music" onClick={()=>onNavigate('library',true)}><Icon name="search"/></button></header><main className="km-main">{children}</main></div>
    <nav className="km-bottom-nav" aria-label="Mobile navigation">{links}</nav>
  </div>
}
const time=value=>`${Math.floor((value||0)/60)}:${String(Math.floor((value||0)%60)).padStart(2,'0')}`
export function Player({ current, onNext, hasNext, busy, onStop }) {
  const audio=useRef(null)
  const [playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(1),[error,setError]=useState('')
  useEffect(()=>{setPosition(0);setDuration(0);setPlaying(false);setError('')},[current?.url])
  async function toggle(){if(!audio.current)return;try{if(audio.current.paused)await audio.current.play();else audio.current.pause()}catch{setError('Tap play to start listening.')}}
  return <section className={`km-player ${current?'':'km-player--idle'}`} aria-label="Music player">
    <div className="km-player-track"><Artwork item={current}/><div><strong>{current?.title||'Your next favorite is waiting'}</strong><small>{current?.artist||'Choose a song, album, or playlist'}</small></div></div>
    <div className="km-player-center"><div className="km-player-controls"><button className="km-play-button" aria-label={playing?'Pause':'Play'} disabled={!current} onClick={toggle}><Icon name={playing?'pause':'play'}/></button><button className="km-icon-button" aria-label="Next song" disabled={busy||!hasNext} onClick={onNext}><Icon name="next"/></button></div><div className="km-timeline"><span>{time(position)}</span><input aria-label="Playback position" type="range" min="0" max={duration||0} step="0.1" value={position} disabled={!current||!duration} style={{'--progress':`${duration?position/duration*100:0}%`}} onChange={e=>{const value=Number(e.target.value);audio.current.currentTime=value;setPosition(value)}}/><span>{time(duration)}</span></div></div>
    <div className="km-player-end"><Icon name="volume"/><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} style={{'--progress':`${volume*100}%`}} onChange={e=>{const v=Number(e.target.value);setVolume(v);if(audio.current)audio.current.volume=v}}/>{current&&<button className="km-icon-button" aria-label="Stop playback" onClick={onStop}><Icon name="close"/></button>}</div>
    {current&&<audio ref={audio} key={current.url} src={current.url} autoPlay onLoadedMetadata={e=>{setDuration(Number.isFinite(e.target.duration)?e.target.duration:0);e.target.volume=volume}} onTimeUpdate={e=>setPosition(e.target.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);onNext()}} onError={()=>{setPlaying(false);setError('This song could not be played. Try choosing it again.')}}/>}{error&&<p className="km-player-error" role="status">{error}</p>}
  </section>
}
