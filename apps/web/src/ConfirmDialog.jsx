import React, { useEffect, useRef, useState } from 'react'
import { Icon } from './ui'
export function ConfirmDialog({open,title,message,confirmLabel,onConfirm,onClose}) {
  const dialog=useRef(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{if(open){setError('');if(!dialog.current.open)dialog.current.showModal()}else if(dialog.current.open)dialog.current.close()},[open])
  async function confirm(){setBusy(true);setError('');try{await onConfirm();onClose()}catch(error){setError(error.message)}finally{setBusy(false)}}
  return <dialog ref={dialog} className="km-playlist-picker" aria-label={title} onCancel={event=>{event.preventDefault();if(!busy)onClose()}} onClose={onClose}><header><h2>{title}</h2><button type="button" className="km-icon-button" aria-label="Close confirmation" disabled={busy} onClick={onClose}><Icon name="close"/></button></header><p>{message}</p><p>The song will stay in your music library.</p>{error&&<p className="km-alert" role="alert">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="km-btn--primary" disabled={busy} onClick={confirm}>{busy?'Working...':confirmLabel}</button></footer></dialog>
}
