import {CollapsedPlayer} from './CollapsedPlayer'
import { MusicLink } from './MusicLink'
import { parseLrc } from './lyrics.mjs'
import React, { useEffect, useRef, useState } from 'react'
import { Artwork, Icon, Brand } from './ui'
const time=value=>`${Math.floor((value||0)/60)}:${String(Math.floor((value||0)%60)).padStart(2,'0')}`
function PlayerIcon({name}) {
  const paths={down:'m5 9 7 7 7-7',up:'m5 15 7-7 7 7',previous:'M5 4v16m14-16L8 12l11 8Z',repeat:'m17 2 4 4-4 4M3 11V8a2 2 0 0 1 2-2h16M7 22l-4-4 4-4m14-1v3a2 2 0 0 1-2 2H3',shuffle:'M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 4M3 19h3c2 0 4-3 6-7m3-5c1-1 2-2 3-2h3m-4-4 4 4-4 4',cast:'M3 4h18v16h-4M3 20h.01M3 15a5 5 0 0 1 5 5M3 10a10 10 0 0 1 10 10'}
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
}
export function Player({current,onNext,hasNext,onPrevious,hasPrevious,busy,onStop,playlists=[],onSave,queue=[],onPlayQueue,onRemove,onMove,onShuffle,onActivity,onPlayingChange,queueError,autoPlay=true,onPlaybackStart}) {
  const audio=useRef(null),drawer=useRef(null),trigger=useRef(null),drag=useRef(null),lastAudioTime=useRef(0),lyricsPanel=useRef(null)
  const [view,setView]=useState('playing')
  const [expanded,setExpanded]=useState(false),[playing,setPlaying]=useState(false),[position,setPosition]=useState(0),[duration,setDuration]=useState(0),[volume,setVolume]=useState(1),[error,setError]=useState(''),[repeat,setRepeat]=useState(false),[saving,setSaving]=useState(false),[saved,setSaved]=useState(''),[canCast,setCanCast]=useState(false)
  useEffect(()=>{const close=()=>setExpanded(false);window.addEventListener('popstate',close);return()=>window.removeEventListener('popstate',close)},[])
  useEffect(()=>{onPlayingChange?.(playing)},[playing])
  useEffect(()=>{if(!current){setExpanded(false);setPlaying(false)}},[!!current])
  useEffect(()=>{lastAudioTime.current=0;setPosition(0);setDuration(0);setPlaying(false);setError('');setSaved('')},[current?.queueId,current?.url])
  useEffect(()=>{setCanCast(typeof audio.current?.webkitShowPlaybackTargetPicker==='function'||typeof audio.current?.remote?.prompt==='function')},[current?.url])
  useEffect(()=>{
    const dialog=drawer.current
    if(!dialog)return
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if(expanded){
      if(!dialog.open)dialog.showModal()
      if(reduced)return
      const animation=dialog.animate([{transform:'translateY(100%)'},{transform:'translateY(0)'}],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'})
      return()=>animation.cancel()
    }
    if(!dialog.open)return
    if(reduced){dialog.close();return}
    const animation=dialog.animate([{transform:'translateY(0)'},{transform:'translateY(100%)'}],{duration:220,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'})
    animation.onfinish=()=>{dialog.close();animation.cancel()}
    return()=>animation.cancel()
  },[expanded,!!current])
  useEffect(()=>{
    if(!expanded||!drawer.current)return
    const node=drawer.current,viewport=window.visualViewport
    const update=()=>{node.style.setProperty('--player-visible-height',Math.round(viewport?.height||window.innerHeight)+'px');node.style.setProperty('--player-visible-top',Math.round(viewport?.offsetTop||0)+'px')}
    update();viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);window.addEventListener('resize',update)
    return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update)}
  },[expanded])
  async function toggle(){if(!audio.current)return;try{if(audio.current.paused)await audio.current.play();else audio.current.pause()}catch{setError('Tap play to start listening.')}}
  async function cast(){try{if(typeof audio.current?.webkitShowPlaybackTargetPicker==='function')audio.current.webkitShowPlaybackTargetPicker();else await audio.current?.remote?.prompt()}catch(e){if(e.name!=='NotAllowedError'&&e.name!=='AbortError')setError('No casting device is available.')}}
  function seek(value){lastAudioTime.current=value;if(!audio.current)return;audio.current.currentTime=value;setPosition(value)}
  function previous(){if(position>3||!hasPrevious)seek(0);else onPrevious()}
  async function save(event){const id=event.target.value;if(!id)return;setSaving(true);setSaved('');try{await onSave(id,current.id);setSaved('Added to playlist.')}catch(e){setSaved(e.message)}finally{setSaving(false);event.target.value=''}}
  function startDrag(event,song){
    if(event.button!==0)return
    drag.current={id:song.queueId,y:event.clientY}
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function finishDrag(event){
    const source=drag.current;drag.current=null
    if(!source||Math.abs(event.clientY-source.y)<5)return
    const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-queue-id]')
    if(row)onMove?.(source.id,row.dataset.queueId)
  }
  const lyricLines=parseLrc(current?.syncedLyrics)
  const lyricIndex=lyricLines.findLastIndex(line=>line.time<=position)
  useEffect(()=>{
    if(!expanded||view!=='lyrics'||lyricIndex<0)return
    const frame=requestAnimationFrame(()=>{
      const panel=lyricsPanel.current,line=panel?.querySelector('[aria-current="true"]')
      if(!line)return
      const panelBounds=panel.getBoundingClientRect(),lineBounds=line.getBoundingClientRect()
      const top=panel.scrollTop+lineBounds.top-panelBounds.top-panel.clientTop-(panel.clientHeight-lineBounds.height)/2
      panel.scrollTo({top:Math.max(0,top),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
    })
    return()=>cancelAnimationFrame(frame)
  },[expanded,view,lyricIndex,current?.queueId,current?.url,current?.syncedLyrics])
  if(!current)return null
  const playButton=<button className="km-play-button" aria-label={playing?'Pause':'Play'} disabled={!current?.url||busy} onClick={toggle}><Icon name={playing?'pause':'play'}/></button>
  return <>
    <CollapsedPlayer {...{current,playing,busy,position,duration,volume,setVolume,repeat,setRepeat,queue,hasNext,onNext,previous,toggle,expanded,onShuffle,onActivity}} triggerRef={trigger} onVolume={value=>{if(audio.current)audio.current.volume=value}} onOpen={view=>{setView(view);setExpanded(true)}}/>
    <dialog ref={drawer} className="km-now-playing" onClick={event=>{if(event.target!==event.currentTarget)return;const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)setExpanded(false)}} onPointerDownCapture={onActivity} onKeyDownCapture={onActivity} aria-labelledby="now-playing-title" onCancel={event=>{event.preventDefault();setExpanded(false)}} onClose={()=>{setExpanded(false);trigger.current?.focus()}}>
      <header className="km-now-playing-header"><button type="button" className="km-icon-button" aria-label="Close Now Playing" onClick={()=>setExpanded(false)}><PlayerIcon name="down"/></button><div className="km-player-wordmark"><Brand/><span id="now-playing-title" className="km-visually-hidden">Now Playing</span></div>{canCast?<button className="km-icon-button" aria-label="Choose AirPlay device" onClick={cast}><PlayerIcon name="cast"/></button>:<span className="km-now-playing-header-spacer"/>}</header>
      <div id="player-view-playing" hidden={view!=='playing'} className="km-now-playing-body"><div className="km-player-art-space"><Artwork item={current}/></div><div className="km-now-playing-info"><h2>{current?.title||'Your next favorite is waiting'}</h2><p>{current?<><MusicLink item={current}/>{current.album&&<> | <MusicLink item={current} kind="album"/></>}</>:"Choose a song, album, or playlist"}</p>
        <div className="km-player-song-actions"><button type="button" className="km-player-lyrics-button" onClick={()=>setView('lyrics')}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 5h7v8H6l-2 6H1l2-6Zm13 0h7v8h-4l-2 6h-3l2-6Z"/></svg>Lyrics</button>{onSave&&<label className="km-player-save"><Icon name="plus"/><span className="km-visually-hidden">Save to playlist</span><select aria-label="Save to playlist" defaultValue="" disabled={!current||!playlists.length||saving} onChange={save}><option value="" disabled>{saving?'Saving...':playlists.length?'Save to Playlist':'No playlists yet'}</option>{playlists.map(list=><option key={list.id} value={list.id}>{list.name}</option>)}</select></label>}</div>
        <div className="km-now-playing-timeline"><input aria-label="Playback position" type="range" min="0" max={duration||0} step="0.1" value={position} disabled={!current||!duration} style={{'--progress':`${duration?position/duration*100:0}%`}} onChange={e=>seek(Number(e.target.value))}/><div><span>{time(position)}</span><span>{time(duration)}</span></div></div>
        <div className="km-now-playing-controls"><button className="km-icon-button" aria-label="Shuffle queue" disabled={queue.length<3} onClick={onShuffle}><PlayerIcon name="shuffle"/></button><button className="km-icon-button" aria-label="Previous song or restart" disabled={!current||busy} onClick={previous}><PlayerIcon name="previous"/></button>{playButton}<button className="km-icon-button" aria-label="Next song" disabled={busy||!hasNext} onClick={()=>onNext()}><Icon name="next"/></button><button className="km-icon-button" aria-label="Repeat song" aria-pressed={repeat} disabled={!current} onClick={()=>setRepeat(v=>!v)}><PlayerIcon name="repeat"/></button></div>
        <div className="km-now-playing-volume"><Icon name="volume"/><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={e=>{const v=Number(e.target.value);setVolume(v);if(audio.current)audio.current.volume=v}}/>{current&&<button type="button" onClick={onStop}>Stop</button>}</div>
        {(error||queueError||saved)&&<p className="km-player-message" role="status">{error||queueError||saved}</p>}
      </div></div>
      <section ref={lyricsPanel} id="player-view-lyrics" hidden={view!=='lyrics'} className="km-player-view km-player-lyrics" aria-label="Lyrics"><h2>Lyrics</h2><p className="km-muted">{current.title}</p>{lyricLines.length?<div className="km-player-synced-lyrics">{lyricLines.map((line,index)=><button type="button" key={`${line.time}-${index}`} aria-current={index===lyricIndex?'true':undefined} onClick={()=>seek(line.time)} disabled={!current.url}>{line.text}</button>)}</div>:current.lyrics?<p className="km-player-lyrics-text">{current.lyrics}</p>:<p>{current.lyricsStatus==='instrumental'?'This is an instrumental track.':current.lyricsStatus==='failed'?'Lyrics could not be retrieved. You can retry from Manage Music.':"Lyrics aren't available for this song yet."}</p>}{current.lyricsSource&&<p className="km-lyrics-attribution">Lyrics: {current.lyricsSource}</p>}</section>
      <section id="player-view-queue" hidden={view!=='queue'} className="km-player-view" aria-label="Queue"><div className="km-queue-heading"><h2>Queue <small>{queue.length} {queue.length===1?'song':'songs'}</small></h2><button type="button" disabled={queue.length<3} onClick={onShuffle}><PlayerIcon name="shuffle"/>Shuffle</button><button type="button" onClick={onStop}>Clear queue</button></div><p className="km-muted">Drag the handles to reorder upcoming songs, or use the arrow buttons.</p><ol className="km-player-queue">{queue.map((song,index)=><li key={song.queueId} data-queue-id={song.queueId} className={index===0?'is-current':''}>
        {index>0?<button type="button" className="km-queue-drag km-icon-button" aria-label={`Reorder ${song.title}`} onPointerDown={event=>startDrag(event,song)} onPointerUp={finishDrag} onPointerCancel={()=>{drag.current=null}} onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();const target=queue[index+(event.key==='ArrowUp'?-1:1)];if(target)onMove?.(song.queueId,target.queueId)}}}><Icon name="menu"/></button>:<span className="km-queue-current-icon"><Icon name="music"/></span>}
        <div className="km-queue-song"><button type="button" className="km-queue-track-play" disabled={busy||index===0} aria-label={index===0?`Now playing ${song.title}`:`Play ${song.title}`} onClick={()=>onPlayQueue?.(song.queueId)}><Artwork item={song}/><span><strong>{song.title}</strong></span></button><small>{index===0?'Now playing | ':''}<MusicLink item={song}/>{song.album&&<> | <MusicLink item={song} kind="album"/></>}</small></div>
        <div className="km-queue-row-actions">{index>0&&<><button type="button" className="km-icon-button" aria-label={`Move ${song.title} up`} disabled={index===1} onClick={()=>onMove?.(song.queueId,queue[index-1].queueId)}><PlayerIcon name="up"/></button><button type="button" className="km-icon-button" aria-label={`Move ${song.title} down`} disabled={index===queue.length-1} onClick={()=>onMove?.(song.queueId,queue[index+1].queueId)}><PlayerIcon name="down"/></button></>}<button type="button" className="km-icon-button" aria-label={`Remove ${song.title} from queue`} onClick={()=>onRemove?.(song.queueId)}><Icon name="close"/></button></div>
      </li>)}</ol></section>
      <nav className="km-player-view-nav" aria-label="Now Playing views">{[['playing','Now Playing','music'],['lyrics','Lyrics','lyrics'],['queue','Queue','playlists']].map(([id,label,icon])=><button key={id} type="button" aria-current={view===id?'page':undefined} aria-controls={`player-view-${id}`} onClick={()=>setView(id)}>{icon==='lyrics'?<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5h7v8H7l-2 6H2l2-6Zm12 0h7v8h-4l-2 6h-3l2-6Z"/></svg>:<Icon name={icon}/>}<span>{label}</span></button>)}</nav>
    </dialog>
    {current?.url&&<audio ref={audio} key={current.queueId||current.url} src={current.url} autoPlay={autoPlay} loop={repeat} onLoadedMetadata={e=>{setDuration(Number.isFinite(e.target.duration)?e.target.duration:0);e.target.volume=volume}} onTimeUpdate={event=>{const track=event.currentTarget,edge=Math.min(1,track.duration/4);if(track.loop&&track.duration>0&&lastAudioTime.current>track.duration-edge&&track.currentTime<edge)onPlaybackStart?.();lastAudioTime.current=track.currentTime;setPosition(track.currentTime)}} onPlay={()=>{setPlaying(true);onPlaybackStart?.()}} onPause={()=>setPlaying(false)} onEnded={()=>{setPlaying(false);onNext()}} onError={()=>{setPlaying(false);setError('This song could not be played. Try choosing it again.')}}/>}
  </>
}
