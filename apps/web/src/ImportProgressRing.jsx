import React, {useEffect,useRef,useState} from 'react'
import {importProgressPercent} from './import-progress.mjs'
export function ImportProgressRing({value=0,stage='queued',title}){
 const reported=Math.max(0,Math.min(100,Math.floor(Number(value)||0)))
 const sample=useRef({title,reported,at:Date.now(),shown:importProgressPercent(reported)})
 const [,tick]=useState(0)
 if(sample.current.title!==title||reported<sample.current.reported)sample.current={title,reported,at:Date.now(),shown:importProgressPercent(reported)}
 if(sample.current.reported!==reported){sample.current.reported=reported;sample.current.at=Date.now()}
 const percent=Math.max(sample.current.shown,importProgressPercent(reported,Date.now()-sample.current.at))
 sample.current.shown=percent
 useEffect(()=>{if(reported<80||reported>=100)return;const timer=setInterval(()=>tick(n=>n+1),1000);return()=>clearInterval(timer)},[reported])
 const estimate=reported>=80&&reported<100?' (estimated)':''
 const labels={queued:'Queued',starting:'Starting',downloading:'Downloading',preparing:'Preparing audio',uploading:'Uploading',artwork:'Saving artwork',lyrics:'Saving lyrics',saving:'Saving song',ready:'Ready'}
 return <span className="km-import-percent" role="progressbar" aria-label={'Importing '+title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={(labels[stage]||'Importing')+' | '+percent+'%'+estimate} title={(labels[stage]||'Importing')+' | '+percent+'%'}><svg viewBox="0 0 36 36" aria-hidden="true"><circle className="km-import-percent-track" cx="18" cy="18" r="15"/><circle className="km-import-percent-fill" cx="18" cy="18" r="15" pathLength="100" strokeDasharray="100" strokeDashoffset={100-percent}/></svg><span aria-hidden="true">{percent}%</span></span>
}
