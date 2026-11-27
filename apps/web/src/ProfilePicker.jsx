import React, { useEffect, useLayoutEffect, useRef } from 'react'
import { Brand, Icon } from './ui'
export const profileAvatars = ['ember','aurora','midnight','penguin','monkey','coyote','cat','rabbit','goat','chicken','hippo','alligator','gorilla','panda','dusty','auburn','slate','copper','willow','pearl','onyx','ruby']
export const profileAvatarLabels = { gorilla: 'Cool Gorilla', dusty: 'Dusty', auburn: 'Auburn' }
export function ProfilePortrait({ profile, index = 0 }) {
  const avatar = profile.avatar || (profile.role === 'kids' ? 'penguin' : profileAvatars[index % 3])
  return <img src={`${import.meta.env.BASE_URL}profiles/${avatar}.png`} alt="" className="km-profile-portrait"/>
}
export function ProfilePicker({ profiles, busy, error, pending, pin, onPinChange, onUnlock, onCancelUnlock, onSelectProfile, onAdd, onManage, onManageMusic, signOut, children }) {
  const dialog = useRef(null)
  const opener = useRef(null)
  const pinInput = useRef(null)
  const submitting = useRef(false)
  async function submitPin(value) {
    if (busy || submitting.current || !/^\d{4}$/.test(value)) return
    submitting.current = true
    try { await onUnlock(null, value) }
    finally {
      submitting.current = false
      if (dialog.current?.open) { onPinChange(''); pinInput.current?.focus() }
    }
  }
  function changePin(event) {
    const value = event.target.value.replace(/\D/g, '').slice(0, 4)
    onPinChange(value)
    if (value.length === 4) submitPin(value)
  }
  useLayoutEffect(() => {
    if (!pending) return
    const node=dialog.current,viewport=window.visualViewport
    const update=()=>{
      node.style.setProperty('--pin-visible-height',Math.round(viewport?.height||window.innerHeight)+'px')
      node.style.setProperty('--pin-visible-top',Math.round(viewport?.offsetTop||0)+'px')
    }
    update()
    viewport?.addEventListener('resize',update)
    viewport?.addEventListener('scroll',update)
    window.addEventListener('resize',update)
    return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('resize',update);node.style.removeProperty('--pin-visible-height');node.style.removeProperty('--pin-visible-top')}
  },[pending])
  useEffect(() => {
    if (pending && !dialog.current.open) { opener.current = document.activeElement; dialog.current.showModal(); pinInput.current?.focus() }
    else if (!pending && dialog.current.open) { dialog.current.close(); opener.current?.focus() }
  }, [pending])
  useEffect(() => { if (pending && !busy) pinInput.current?.focus() }, [busy, pending])
  return <main className="km-gate km-profiles">
    <div className="km-profile-account">{signOut}</div>
    <div className="km-profile-picker">
      <Brand/>
      <header className="km-profile-heading"><h1>Choose a Profile</h1><p>Who's listening today?</p></header>
      {!pending && error && <p className="km-alert" role="alert">{error}</p>}
      <div className="km-profile-grid" role="group" aria-label="Choose a listening profile">
        {profiles.map((p,i) => <button className="km-profile-card" key={p.id} disabled={busy} onClick={() => onSelectProfile(p)}>
          <span className="km-profile-art"><ProfilePortrait profile={p} index={i}/></span>
          <strong>{p.name}</strong><small>{p.role === 'adult' ? 'Adult' : 'Kids'}</small>
        </button>)}
        <button className="km-profile-card km-profile-add" disabled={busy} onClick={() => onAdd()}><span className="km-profile-art"><Icon name="plus"/></span><strong>Add Profile</strong><small>{profiles.length ? 'Password required' : 'Start here'}</small></button>
      </div>
      {!profiles.length && <p className="km-profile-empty">Create an adult profile to start your music collection.</p>}
      {profiles.length > 0 && <button className="km-profile-manage" disabled={busy} onClick={() => onManage()}><Icon name="settings"/>Manage Profiles</button>}
      {children}
    </div>
    <dialog ref={dialog} className={`km-profile-pin km-profile-unlock ${error ? 'km-profile-pin--error' : ''}`} onCancel={event => { event.preventDefault(); onCancelUnlock() }} onClose={() => { if(pending)onCancelUnlock() }} aria-labelledby="profile-pin-title">
      {pending && <form onSubmit={event=>{event.preventDefault();submitPin(pin)}}><div className="km-section-heading"><h2 id="profile-pin-title">Unlock {pending.name}</h2><button className="km-icon-button" type="button" aria-label="Cancel PIN entry" onClick={onCancelUnlock}><Icon name="close"/></button></div><p>Enter this profile's four-digit PIN to continue.</p>{error && <p className="km-alert" role="alert">{error}</p>}<div className="km-pin-boxes" onClick={()=>pinInput.current?.focus()}>{[0,1,2,3].map(index=><span key={index} className={pin.length===index?'active':''} aria-hidden="true">{pin[index]?'•':''}</span>)}<input ref={pinInput} className="km-pin-input" autoFocus type="password" inputMode="numeric" enterKeyHint="done" autoComplete="off" pattern="[0-9]{4}" maxLength={4} required value={pin} disabled={busy} onChange={changePin} aria-label="Four-digit profile PIN" aria-describedby="profile-pin-hint"/></div><p id="profile-pin-hint" className="km-pin-hint" role="status">{busy?'Unlocking profile...':'Enters automatically after four digits.'}</p></form>}
    </dialog>
  </main>
}
