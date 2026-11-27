import React from 'react'
export function ImportProgressRing({value=0,stage='queued',title}){
 const percent=Math.max(0,Math.min(100,Math.floor(Number(value)||0))),labels={queued:'Queued',starting:'Starting',downloading:'Downloading',preparing:'Preparing audio',uploading:'Uploading',artwork:'Saving artwork',lyrics:'Saving lyrics',saving:'Saving song',ready:'Ready'}
 return <span className="km-import-percent" role="progressbar" aria-label={'Importing '+title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={(labels[stage]||'Importing')+' | '+percent+'%'} title={(labels[stage]||'Importing')+' | '+percent+'%'}><svg viewBox="0 0 36 36" aria-hidden="true"><circle className="km-import-percent-track" cx="18" cy="18" r="15"/><circle className="km-import-percent-fill" cx="18" cy="18" r="15" pathLength="100" strokeDasharray="100" strokeDashoffset={100-percent}/></svg><span aria-hidden="true">{percent}%</span></span>
}
