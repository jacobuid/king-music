import React, { useState } from 'react'
import { Brand, Icon } from './ui'
import { AvatarGallery, avatarName } from './AvatarGallery'
const avatarImage = name => `${import.meta.env.BASE_URL}profiles/${name}.png`
export function ProfileCreatePage({ busy, error, firstProfile, editingProfile, onSubmit, onCancel }) {
  const [role,setRole]=useState(editingProfile?.role || 'adult'),[chosenAvatar,setChosenAvatar]=useState(editingProfile?.avatar || null)
  const [galleryOpen,setGalleryOpen]=useState(false)
  const avatar=chosenAvatar || (role==='kids'?'penguin':'ember')
  return <main className="km-gate km-profile-create">
    <header className="km-profile-create-header"><Brand/><button type="button" disabled={busy} onClick={onCancel}>Back to profiles</button></header>
    <section className="km-profile-create-card" aria-labelledby="create-profile-title">
      <div className="km-section-heading"><h1 id="create-profile-title">{editingProfile?'Edit profile':'Add profile'}</h1><button type="button" className="km-icon-button" aria-label={editingProfile?'Cancel profile editing':'Cancel profile creation'} disabled={busy} onClick={onCancel}><Icon name="close"/></button></div>
      {error&&<p className="km-alert" role="alert">{error}</p>}
      <form onSubmit={onSubmit}>
        <fieldset className="km-upload-fields" disabled={busy}>
          <label htmlFor="new-profile-name">Name<input id="new-profile-name" name="name" defaultValue={editingProfile?.name || ''} maxLength={40} autoComplete="off" required/></label>
          <label htmlFor="new-profile-pin">{editingProfile?'New four-digit PIN (optional)':'Four-digit PIN'}<input id="new-profile-pin" name="pin" type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{4}" maxLength={4} required={!editingProfile} placeholder={editingProfile?'Leave blank to keep the current PIN':undefined}/></label>
          <div className="km-profile-picture-field"><span id="profile-picture-label">Picture</span><div className="km-profile-picture-selection"><img src={avatarImage(avatar)} alt={`${avatarName(avatar)} profile picture`}/><span>{avatarName(avatar)}</span><button type="button" aria-haspopup="dialog" aria-controls="profile-avatar-gallery" aria-labelledby="select-profile-picture profile-picture-label" onClick={()=>setGalleryOpen(true)}><span id="select-profile-picture">Select</span></button></div></div>
          <input type="hidden" name="avatar" value={avatar}/>
          <label htmlFor="new-profile-role">Profile type<select id="new-profile-role" name="role" value={role} onChange={event=>setRole(event.target.value)}><option value="adult">Adult</option>{!firstProfile&&<option value="kids">Kids</option>}</select></label>
          <button className="km-btn--primary" type="submit" disabled={busy}>{busy?(editingProfile?'Saving...':'Creating profile...'):(editingProfile?'Save changes':'Create profile')}</button>
        </fieldset>
      </form>
    </section>
    <AvatarGallery open={galleryOpen} value={avatar} onClose={()=>setGalleryOpen(false)} onSelect={name=>{setChosenAvatar(name);setGalleryOpen(false)}}/>

  </main>
}
