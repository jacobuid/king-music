import React, { useEffect, useRef } from 'react'
import { Reauthenticate } from '@jacobuid/king-auth'
import { Icon } from './ui'
export function PasswordGate({ open, action, onClose, onVerified }) {
  const dialog=useRef(null)
  useEffect(()=>{if(open&&!dialog.current.open)dialog.current.showModal();else if(!open&&dialog.current.open)dialog.current.close()},[open])
  return <dialog ref={dialog} className="km-profile-pin km-password-gate" aria-labelledby="password-gate-title" onCancel={event=>{event.preventDefault();onClose()}}><div className="km-section-heading"><h2 id="password-gate-title">{action==='profile:create'?'Create a profile':action==='profiles:manage'?'Manage Profiles':'Manage Music'}</h2><button type="button" className="km-icon-button" aria-label="Close password confirmation" onClick={onClose}><Icon name="close"/></button></div><p>Confirm your KingAuth account password to continue.</p>{open&&<Reauthenticate key={action} action={action} title={null} onSuccess={onVerified}/>}</dialog>
}
