import { useEffect, useReducer, useRef, useState } from 'react'
import { emptyQueue, queueReducer, QUEUE_IDLE_MS } from './queue-state.mjs'
export function usePlaybackQueue({ request, profileId, onPlayed }) {
  const [state,dispatch]=useReducer(queueReducer,undefined,emptyQueue)
  const [resolved,setResolved]=useState(null),[error,setError]=useState(''),[autoPlay,setAutoPlay]=useState(false)
  const api=useRef(request),activity=useRef(Date.now()),playing=useRef(false)
  const playedCallback=useRef(onPlayed),activeProfile=useRef(profileId)
  playedCallback.current=onPlayed;activeProfile.current=profileId
  api.current=request
  const head=state.entries[0]
  function touch(){activity.current=Date.now()}
  function clear(){playing.current=false;setAutoPlay(false);touch();dispatch({type:'clear'});setResolved(null);setError('')}
  useEffect(()=>{
    let cancelled=false
    setResolved(null);setError('');playing.current=false
    if(!head)return
    touch()
    api.current(`/api/media/${head.id}/play`,{method:'POST',body:JSON.stringify({profileId})})
      .then(result=>{if(!cancelled)setResolved({...head,...result,queueId:head.queueId})})
      .catch(error=>{if(!cancelled)setError(error.message)})
    return()=>{cancelled=true}
  },[head?.queueId,profileId])
  useEffect(()=>{
    const check=()=>{if(playing.current)touch();else if(Date.now()-activity.current>=QUEUE_IDLE_MS)clear()}
    const timer=setInterval(check,1000)
    window.addEventListener('focus',check);document.addEventListener('visibilitychange',check)
    return()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)}
  },[])
  function act(action){touch();dispatch(action)}
  return {
    autoPlay,entries:state.entries,current:resolved?.queueId===head?.queueId?resolved:head,error,
    busy:!!head&&resolved?.queueId!==head.queueId&&!error,
    add:songs=>{if(songs.length){if(!state.entries.length)setAutoPlay(false);act({type:'add',songs:songs.map(song=>({...song,queueId:crypto.randomUUID()}))})}},
    playNow:song=>{setAutoPlay(true);act({type:'playNow',song:{...song,queueId:crypto.randomUUID()}})},
    next:()=>{setAutoPlay(true);act({type:'next'})},previous:()=>{setAutoPlay(true);act({type:'previous'})},hasPrevious:!!state.history.length,
    remove:id=>{if(id===head?.queueId)setAutoPlay(playing.current);act({type:'remove',id})},select:id=>{setAutoPlay(true);act({type:'select',id})},
    move:(id,before)=>act({type:'move',id,before}),shuffle:()=>act({type:'shuffle'}),clear,
        touch,onPlayingChange:value=>{playing.current=value;touch()},
    onPlaybackStart:()=>{
      touch();if(!head)return
      const owner=profileId,song=head,playbackId=crypto.randomUUID()
      api.current('/api/home/activity',{method:'POST',body:JSON.stringify({kind:'song',mediaId:song.id,profileId:owner,playbackId})})
        .then(result=>{if(activeProfile.current===owner)playedCallback.current?.(song,result.lastPlayedAt,result.playCount)})
        .catch(()=>{})
    }
  }
}
