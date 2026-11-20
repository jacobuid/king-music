import React, { useEffect, useRef } from 'react'
import { Icon } from './ui'
import { profileAvatars, profileAvatarLabels } from './ProfilePicker'
export const avatarName = name => profileAvatarLabels[name] || name[0].toUpperCase()+name.slice(1)
export function AvatarGallery({ open, value, onSelect, onClose, busy=false, error='', id='profile-avatar-gallery' }) {
  const dialog=useRef(null)
  useEffect(()=>{if(open&&!dialog.current.open)dialog.current.showModal();else if(!open&&dialog.current.open)dialog.current.close()},[open])
  return <dialog ref={dialog} id={id} className="km-avatar-gallery" aria-labelledby={`${id}-title`} aria-busy={busy} onCancel={event=>{event.preventDefault();if(!busy)onClose()}}>
    <div className="km-section-heading"><h2 id={`${id}-title`}>Choose a profile picture</h2><button type="button" className="km-icon-button" aria-label="Close profile pictures" disabled={busy} onClick={onClose}><Icon name="close"/></button></div>
    {error&&<p className="km-alert" role="alert">{error}</p>}
    {busy&&<p role="status">Saving your picture...</p>}
    <div className="km-avatar-options">{profileAvatars.map(name=><button key={name} type="button" aria-pressed={value===name} disabled={busy} onClick={()=>onSelect(name)}><img src={`${import.meta.env.BASE_URL}profiles/${name}.png`} alt="" loading="lazy"/><span>{avatarName(name)}</span>{value===name&&<span className="km-avatar-option-check" aria-hidden="true"><Icon name="check"/></span>}</button>)}</div>
  </dialog>
}
