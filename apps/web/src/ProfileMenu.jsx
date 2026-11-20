import React, { useEffect, useRef, useState } from 'react'
import { SignOut } from '@jacobuid/king-auth'
import { ProfilePortrait } from './ProfilePicker'

export function ProfileMenu({ profile, canChangePicture, onChangePicture, onManageMusic, onSwitch }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const trigger = useRef(null)
  useEffect(() => {
    if (!open) return
    function outside(event) { if (!root.current?.contains(event.target)) setOpen(false) }
    function escape(event) { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  function choose(action) { setOpen(false); trigger.current?.focus(); action() }
  return <div className="km-profile-menu" ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button ref={trigger} className="km-profile-menu-trigger" aria-label={`Profile options for ${profile.name}`} aria-expanded={open} aria-controls="profile-options" onClick={() => setOpen(value => !value)}><ProfilePortrait profile={profile}/></button>
    {open && <div id="profile-options" className="km-profile-menu-panel">
      <div className="km-profile-menu-heading"><strong>{profile.name}</strong><small>{profile.role === 'adult' ? 'Adult profile' : 'Kids profile'}</small></div>
      {canChangePicture && <button onClick={() => choose(onChangePicture)}>Change picture</button>}
      {profile.role === 'adult' && <button onClick={() => choose(onManageMusic)}>Manage Music</button>}
      <button onClick={() => choose(onSwitch)}>Switch profile</button>
      <div className="km-profile-menu-signout"><SignOut/></div>
    </div>}
  </div>
}
