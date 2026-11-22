import React, { useEffect, useRef, useState } from 'react'
import { Icon } from './ui'
import { cropSquare } from './playlist-artwork.mjs'
export function CoverUploadModal({playlist,onSave,onClose}) {
  const dialog=useRef(null),canvas=useRef(null),image=useRef(null),input=useRef(null),drag=useRef(null)
  const [file,setFile]=useState(null),[ready,setReady]=useState(false),[zoom,setZoom]=useState(1),[x,setX]=useState(0),[y,setY]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{setFile(null);setReady(false);setError('');if(input.current)input.current.value='';if(playlist&&!dialog.current.open)dialog.current.showModal();else if(!playlist&&dialog.current.open)dialog.current.close()},[playlist?.id])
  useEffect(()=>{
    setReady(false);image.current=null
    if(!file)return
    if(file.size>20*1024*1024){setError('Choose an image smaller than 20 MiB.');return}
    const url=URL.createObjectURL(file),img=new Image();let active=true
    img.onload=()=>{if(active){image.current=img;setZoom(1);setX(0);setY(0);setReady(true)}}
    img.onerror=()=>{if(active)setError('This image could not be opened. Try a JPEG, PNG or WebP image.')}
    img.src=url
    return()=>{active=false;URL.revokeObjectURL(url)}
  },[file])
  useEffect(()=>{if(!ready||!image.current)return;const crop=cropSquare(image.current,zoom,x,y),ctx=canvas.current.getContext('2d');ctx.fillStyle='#111';ctx.fillRect(0,0,800,800);ctx.drawImage(image.current,crop.sx,crop.sy,crop.side,crop.side,0,0,800,800)},[ready,zoom,x,y])
  async function save(){setBusy(true);setError('');try{const blob=await new Promise((resolve,reject)=>canvas.current.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not crop this image.')),'image/jpeg',.9));await onSave(playlist,blob);onClose()}catch(error){setError(error.message)}finally{setBusy(false)}}
  function startDrag(event){if(!ready||busy)return;drag.current={x:event.clientX,y:event.clientY,panX:x,panY:y};event.currentTarget.setPointerCapture(event.pointerId)}
  function move(event){if(!drag.current||!image.current)return;const size=event.currentTarget.getBoundingClientRect().width,crop=cropSquare(image.current,zoom,x,y),width=image.current.naturalWidth,height=image.current.naturalHeight;setX(Math.max(-1,Math.min(1,drag.current.panX-(width>crop.side?2*(event.clientX-drag.current.x)*crop.side/(size*(width-crop.side)):0))));setY(Math.max(-1,Math.min(1,drag.current.panY-(height>crop.side?2*(event.clientY-drag.current.y)*crop.side/(size*(height-crop.side)):0))))}
  return <dialog ref={dialog} className="km-playlist-picker km-cover-upload" aria-label="Upload playlist cover" onCancel={event=>{event.preventDefault();if(!busy)onClose()}} onClose={onClose}><header><h2>Upload cover art</h2><button type="button" className="km-icon-button" aria-label="Close cover upload" disabled={busy} onClick={onClose}><Icon name="close"/></button></header><p>{playlist?.name}</p><label>Choose an image<input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={busy} onChange={event=>{setError('');setFile(event.target.files?.[0]||null)}}/></label><div className="km-cover-crop" hidden={!ready}><canvas ref={canvas} width="800" height="800" role="img" aria-label="Square cover crop preview" onPointerDown={startDrag} onPointerMove={move} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}/><span className="km-cover-crop-grid" aria-hidden="true"/></div>{ready&&<fieldset disabled={busy} className="km-cover-adjustments"><p>Drag the image to position it, or use the sliders.</p><label>Zoom<input aria-label="Cover zoom" type="range" min="1" max="4" step="0.01" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label><label>Horizontal position<input aria-label="Horizontal crop position" type="range" min="-1" max="1" step="0.01" value={x} onChange={event=>setX(Number(event.target.value))}/></label><label>Vertical position<input aria-label="Vertical crop position" type="range" min="-1" max="1" step="0.01" value={y} onChange={event=>setY(Number(event.target.value))}/></label></fieldset>}{error&&<p className="km-alert" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="km-btn--primary" disabled={!ready||busy} onClick={save}>{busy?'Uploading...':'Save cover'}</button></footer></dialog>
}
