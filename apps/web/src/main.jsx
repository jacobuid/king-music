import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider, SignIn, SignUp, ForgotPassword, SignOut, useAuth } from '@jacobuid/king-auth'
import { Artwork, Brand, Icon, Player, Shell } from './ui'
import { createApiClient } from './api-client.mjs'
import { ProfilePicker, ProfilePortrait } from './ProfilePicker'
import { PasswordGate } from './PasswordGate'
import { SongManager } from './SongManager'
import { YoutubeImporter } from './YoutubeImporter'
import { ProfileCreatePage } from './ProfileCreatePage'
import { AvatarGallery } from './AvatarGallery'
import { ProfileMenu } from './ProfileMenu'
import './style.css'
import './player.css'
import { SongList } from './SongList'
import { PlaylistCards } from './PlaylistCards'
import { ownPlaylists, canEditPlaylist } from './playlist-visibility.mjs'
import './song-list.css'
import { usePlaybackQueue } from './usePlaybackQueue'
import { usePageHistory } from './usePageHistory'
import { HomeShelf } from './HomeShelf'
import { AlbumCard } from './AlbumCard'
import { PlaylistPicker } from './PlaylistPicker'
import { albumSongs, albumId, buildAlbumZip, saveAlbumZip } from './album-actions.mjs'
import { emptyHomeActivity, homeShelves, recentSong, recentAlbum } from './home-activity.mjs'
const api = import.meta.env.VITE_API_URL || ''
function App() {
  const { isSignedIn, isLoading, getToken, getAccessToken, user } = useAuth()
  const [ownAvatarOpen,setOwnAvatarOpen]=useState(false),[avatarSaving,setAvatarSaving]=useState(false),[avatarError,setAvatarError]=useState('')
  const [editingProfile,setEditingProfile]=useState(null)
  const [manageToken,setManageToken]=useState(''),[passwordAction,setPasswordAction]=useState('music:manage'),[passwordOpen,setPasswordOpen]=useState(false),[profileProof,setProfileProof]=useState('')
  const [uploadStatus,setUploadStatus]=useState('')
  const searchInput=useRef(null)
  const generation=useRef(0),sharedSongOpened=useRef(null),activityProfile=useRef(null),playlistRefreshId=useRef(0)
  const [authView,setAuthView]=useState('signin'), [profiles,setProfiles]=useState([]), [profile,setProfile]=useState(null), [token,setToken]=useState('')
  const [pending,setPending]=useState(null), [pin,setPin]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false)
  const [section,setSection]=useState('home'), [tracks,setTracks]=useState([]), [playlists,setPlaylists]=useState([]), [filter,setFilter]=useState(null), [query,setQuery]=useState('')
  const [profileForm,setProfileForm]=useState(false),[albumForPlaylist,setAlbumForPlaylist]=useState(null)
  const [homeActivity,setHomeActivity]=useState(emptyHomeActivity)
  activityProfile.current=profile?.id
  const request = createApiClient({ baseUrl: api, getToken, getAccessToken, getProfileToken: () => token, getManageToken: () => manageToken, requireBaseUrl: import.meta.env.PROD })
  const playback=usePlaybackQueue({request,profileId:profile?.id,onPlayed:(song,lastPlayedAt)=>{setHomeActivity(activity=>recentSong(activity,song.id,lastPlayedAt));setTracks(items=>items.map(item=>item.id===song.id?{...item,playCount:(item.playCount||0)+1}:item));refreshPlaylists().catch(()=>{})}})
  usePageHistory({scope:profile&&user?.id?`${user.id}:${profile.id}`:null,page:{section,filter,query,profileForm,editingProfileId:editingProfile?.id||null},onRestore:page=>{
    setAlbumForPlaylist(null);setOwnAvatarOpen(false);setPasswordOpen(false);setError('')
    const edited=page.editingProfileId?profiles.find(item=>item.id===page.editingProfileId):null
    setEditingProfile(edited||null);setProfileForm(page.profileForm&&(!page.editingProfileId||!!edited));setSection(page.section);setFilter(page.filter);setQuery(page.query)
    if(page.profileForm&&!page.editingProfileId&&!profileProof){setProfileForm(false);setPasswordAction('profile:create');setPasswordOpen(true)}
    if(['admin','profiles'].includes(page.section)&&!manageToken){setSection('home');setFilter(null);setPasswordAction(page.section==='profiles'?'profiles:manage':'music:manage');setPasswordOpen(true)}
    if(page.filter?.playlistId){
      const id=page.filter.playlistId,version=generation.current
      request(`/api/playlists/${id}/tracks`).then(rows=>{if(version===generation.current)setFilter(current=>current?.playlistId===id?{...current,ids:rows.map(song=>song.id)}:current)}).catch(()=>{if(version===generation.current){setFilter(current=>current?.playlistId===id?null:current)}})
    }
  }})
  const current=playback.current
  async function run(action){setError('');setBusy(true);try{await action()}catch(e){setError(e.message)}finally{setBusy(false)}}
  function clear(){setAlbumForPlaylist(null);setHomeActivity(emptyHomeActivity());setOwnAvatarOpen(false);setAvatarError('');setEditingProfile(null);setManageToken('');setPasswordOpen(false);setProfileProof('');generation.current++;setProfile(null);setToken('');setTracks([]);setPlaylists([]);playback.clear();setFilter(null);setSection('home');setPending(null);setPin('');setProfileForm(false)}
  useEffect(()=>{clear();setProfiles([]);if(isSignedIn) run(async()=>setProfiles(await request('/api/profiles')))},[isSignedIn,user?.id])
  useEffect(()=>{
    let cancelled=false
    setHomeActivity(emptyHomeActivity())
    if(profile)run(async()=>{
      const [songs,lists,activity]=await Promise.allSettled([request('/api/library'),request('/api/playlists'),request('/api/home/activity')])
      if(cancelled)return
      if(songs.status==='fulfilled')setTracks(songs.value)
      if(lists.status==='fulfilled')setPlaylists(lists.value)
      if(activity.status==='fulfilled')setHomeActivity(activity.value)
      if(songs.status==='rejected')throw songs.reason
      if(lists.status==='rejected')throw lists.reason
    })
    return()=>{cancelled=true}
  },[profile,token])
  async function unlock(e,enteredPin=pin){e?.preventDefault();await run(async()=>{const result=await request(`/api/profiles/${pending.id}/unlock`,{method:'POST',body:JSON.stringify({pin:enteredPin})});generation.current++;setToken(result.token);setProfile(pending);setSection('home');setPending(null);setPin('')})}
  async function createProfile(e){e.preventDefault();const form=new FormData(e.currentTarget),values=Object.fromEntries(form);if(!values.avatar)delete values.avatar;await run(async()=>{const p=await request('/api/profiles',{method:'POST',headers:{'X-Reauthentication-Proof':profileProof},body:JSON.stringify(values)});setProfiles(v=>[...v,p]);setProfileForm(false);setProfileProof('')})}
  async function changeOwnAvatar(avatar){
    if(!profile||!token)return
    setAvatarSaving(true);setAvatarError('')
    try{const saved=await request(`/api/profiles/${profile.id}/avatar`,{method:'POST',body:JSON.stringify({avatar})});setProfile(p=>({...p,avatar:saved.avatar}));setProfiles(items=>items.map(p=>p.id===profile.id?{...p,avatar:saved.avatar}:p));setOwnAvatarOpen(false)}catch(error){setAvatarError(error.message)}finally{setAvatarSaving(false)}
  }
  async function saveProfile(event){event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));await run(async()=>{const saved=await request(`/api/profiles/${editingProfile.id}`,{method:'POST',body:JSON.stringify(values)});const updated=profiles.map(p=>p.id===saved.id?{...p,...saved}:p);setProfiles(updated);setProfile(current=>current?.id===saved.id?(updated.find(p=>p.role==='adult')||current):current);setProfileForm(false);setEditingProfile(null)})}
  async function refreshPlaylists(){const owner=profile?.id,revision=++playlistRefreshId.current;const lists=await request('/api/playlists');if(activityProfile.current===owner&&playlistRefreshId.current===revision)setPlaylists(lists);return lists}
  function play(items){playback.add(items)}
  const visible=(filter?.ids?tracks.filter(t=>filter.ids.includes(t.id)).sort((a,b)=>filter.ids.indexOf(a.id)-filter.ids.indexOf(b.id)):filter?.album?tracks.filter(t=>t.album===filter.album&&t.artist===filter.artist):tracks).filter(t=>`${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(query.toLowerCase()))
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get('song')
    if(!id||!profile)return
    const key=`${profile.id}:${id}`
    if(sharedSongOpened.current===key)return
    const song=tracks.find(song=>song.id===id)
    if(song){sharedSongOpened.current=key;setFilter(null);setQuery(song.title);setSection('library')}
  },[tracks,profile?.id])
  useEffect(()=>{
    if(!profile||section!=='library'||!filter?.album)return
    const owner=profile.id
    const album=filter.album,artist=filter.artist||''
    request('/api/home/activity',{method:'POST',body:JSON.stringify({kind:'album',album,artist,profileId:profile.id})})
      .then(result=>{if(activityProfile.current===owner)setHomeActivity(activity=>recentAlbum(activity,album,artist,result.lastVisitedAt))})
      .catch(()=>{})
  },[profile?.id,section,filter?.album,filter?.artist])
  const shelves=homeShelves(tracks,homeActivity)
  const albums=[...new Map(tracks.filter(t=>t.album).map(t=>[`${t.artist}\0${t.album}`,t])).values()]
  function navigate(next,search=false){if(next==='admin'&&!manageToken){setPasswordAction('music:manage');setPasswordOpen(true);return}setSection(next);setFilter(null);setQuery('');if(search)setTimeout(()=>searchInput.current?.focus(),0)}
  function openAlbum(item){setFilter({album:item.album,artist:item.artist});setSection('library');setQuery('')}
  async function openPlaylist(item){await run(async()=>{const rows=await request(`/api/playlists/${item.id}/tracks`);setFilter({name:item.name,playlistId:item.id,ids:rows.map(t=>t.id)});setSection('library');setQuery('')})}
  function beginProfileManagement(intent) {
    setError('');setPin('');
    setPasswordAction(intent==='add'?'profile:create':'profiles:manage');setPasswordOpen(true)
  }
  async function passwordVerified(result) {
    if(passwordAction==='profile:create'){setEditingProfile(null);setProfileProof(result.proof);setPasswordOpen(false);setProfileForm(true);return}
    const access=await request(passwordAction==='profiles:manage'?'/api/manage/profiles/unlock':'/api/manage/unlock',{method:'POST',headers:{'X-Reauthentication-Proof':result.proof},body:'{}'})
    generation.current++;setToken('');setManageToken(access.token);setProfile(access.profile);playback.clear();setSection(passwordAction==='profiles:manage'?'profiles':'admin');setPasswordOpen(false)
  }
  function passwordGate(){return <PasswordGate open={passwordOpen} action={passwordAction} onClose={()=>setPasswordOpen(false)} onVerified={passwordVerified}/>}

  function queueAlbum(album){playback.add(albumSongs(tracks,album))}
  async function downloadAlbum(album,onProgress){
    const blob=await buildAlbumZip(albumSongs(tracks,album),song=>request(`/api/media/${song.id}/download`,{method:'POST',body:JSON.stringify({profileId:profile.id})}),{onProgress})
    saveAlbumZip(blob,album)
  }
  const albumCards=()=> <div className="km-grid">{albums.map((album,index)=><AlbumCard key={albumId(album)} album={album} index={index} onOpen={openAlbum} onQueue={queueAlbum} onPlaylist={setAlbumForPlaylist} onDownload={downloadAlbum}/>)}</div>
  const homePlaylists=ownPlaylists(playlists,profile?.id)
  const editablePlaylists=playlists.filter(list=>canEditPlaylist(list,profile))
  const playlistCards=items=><PlaylistCards playlists={items} profile={profile} songs={tracks} onOpen={openPlaylist} onQueue={list=>{const version=generation.current;run(async()=>{const rows=await request(`/api/playlists/${list.id}/tracks`);if(version===generation.current)play(rows.map(row=>tracks.find(song=>song.id===row.id)).filter(Boolean))})}} onRename={async(id,name)=>{const result=await request(`/api/playlists/${id}`,{method:'POST',body:JSON.stringify({name})});setPlaylists(current=>current.map(list=>list.id===id?{...list,name:result.name}:list))}} onDelete={async id=>{await request(`/api/playlists/${id}`,{method:'DELETE'});setPlaylists(current=>current.filter(list=>list.id!==id));if(filter?.playlistId===id)setFilter(null)}} onCoverSave={async(list,blob)=>{const upload=await request(`/api/playlists/${list.id}/cover`,{method:'POST',body:JSON.stringify({size:blob.size})});const response=await fetch(upload.url,{method:'PUT',headers:upload.headers,body:blob});if(!response.ok)throw new Error('The cover could not be uploaded. Please retry.');await request(`/api/playlists/${list.id}/cover/${upload.id}/complete`,{method:'POST',body:'{}'});await refreshPlaylists()}} onAutomaticCover={async list=>{await request(`/api/playlists/${list.id}/cover`,{method:'DELETE'});await refreshPlaylists()}}/>
  const player=<Player current={current} autoPlay={playback.autoPlay} queue={playback.entries} onPlayQueue={playback.select} onNext={playback.next} hasNext={playback.entries.length>1} onPrevious={playback.previous} hasPrevious={playback.hasPrevious} busy={playback.busy} queueError={playback.error} onStop={playback.clear} onRemove={playback.remove} onMove={playback.move} onShuffle={playback.shuffle} onActivity={playback.touch} onPlayingChange={playback.onPlayingChange} onPlaybackStart={playback.onPlaybackStart} playlists={editablePlaylists} onSave={async(playlistId,mediaId)=>{await request(`/api/playlists/${playlistId}/tracks`,{method:'POST',body:JSON.stringify({mediaId})});await refreshPlaylists()}}/>
  const albumPlaylistPicker=<PlaylistPicker song={albumForPlaylist?{id:albumId(albumForPlaylist),title:albumForPlaylist.album,description:`${albumSongs(tracks,albumForPlaylist).length} songs`}:null} playlists={editablePlaylists} onSave={async playlistId=>{const songs=albumSongs(tracks,albumForPlaylist);if(!songs.length)throw new Error('This album has no available songs.');for(const song of songs)await request(`/api/playlists/${playlistId}/tracks`,{method:'POST',body:JSON.stringify({mediaId:song.id})});await refreshPlaylists();if(filter?.playlistId===playlistId){const rows=await request(`/api/playlists/${playlistId}/tracks`);setFilter(current=>current?{...current,ids:rows.map(song=>song.id)}:current)}}} onClose={()=>setAlbumForPlaylist(null)}/>
  if(isLoading)return <main className="km-gate"><Brand/><p role="status">Loading your music...</p></main>
  if(!isSignedIn)return <main className={`km-gate km-auth km-auth--${authView}`}>
    <section className={`km-auth-panel km-auth-panel--${authView}`} aria-labelledby="auth-heading">
      <Brand/>
      <header className="km-auth-heading">
        <h1 id="auth-heading">{authView==='signin'?'Welcome Back':authView==='signup'?'Join King Music':'Forgot Password?'}</h1>
        <p>{authView==='signin'?'Log in to your King Music account':authView==='signup'?'Your next favorite song is waiting.':'Let us get you back to your music.'}</p>
      </header>
      {authView==='signin'?<SignIn title={null} submitLabel={<><Icon name="play"/>Log In</>}/>:authView==='signup'?<SignUp title={null}/>:<ForgotPassword title={null}/>}
      {authView==='signin'&&<button className="km-auth-forgot" onClick={()=>setAuthView('reset')}>Forgot Password?</button>}
      <footer className="km-auth-footer">{authView==='signin'?<><span>Don’t have an account?</span><button onClick={()=>setAuthView('signup')}>Sign Up</button></>:<><span>Already have an account?</span><button onClick={()=>setAuthView('signin')}>Log In</button></>}</footer>
    </section>
  </main>
  if(profileForm)return <><ProfileCreatePage key={editingProfile?.id || 'new'} editingProfile={editingProfile} busy={busy} error={error} firstProfile={!profiles.length} onSubmit={editingProfile?saveProfile:createProfile} onCancel={()=>{setEditingProfile(null);setProfileForm(false);setProfileProof('');setError('')}}/>{player}</>
  if(!profile)return <><ProfilePicker profiles={profiles} busy={busy} error={error} pending={pending} pin={pin} onPinChange={setPin} onUnlock={unlock} signOut={<SignOut/>}
    onCancelUnlock={()=>{setPending(null);setPin('');setError('');}}
    onSelectProfile={selected=>{;setPending(selected);setPin('');setError('')}}
    onAdd={selected=>beginProfileManagement('add',selected)} onManage={selected=>beginProfileManagement('manage',selected)} onManageMusic={()=>{setPasswordAction('music:manage');setPasswordOpen(true)}}>
    {passwordGate()}
  </ProfilePicker>{player}</>
  return <><Shell profile={profile} section={section} onNavigate={navigate} onSwitch={clear}>
    <div className="km-topbar"><span className="km-eyebrow">{section==='admin'?'ACCOUNT & CATALOG':'YOUR EVERYDAY SOUNDTRACK'}</span><ProfileMenu profile={profile} canChangePicture={!!token} onChangePicture={()=>{setAvatarError('');setOwnAvatarOpen(true)}} onManageMusic={()=>navigate('admin')} onSwitch={clear}/></div>
    {error&&<p className="km-alert" role="alert">{error}</p>}
    {section==='home'&&<><section className="km-hero"><div><p className="km-eyebrow">TURN UP YOUR DAY</p><h1>Welcome back, {profile.name}.</h1><p>Find your rhythm. Play something you love.</p><button className="km-btn--primary" disabled={busy||!tracks.length} onClick={()=>play(tracks)}><Icon name="plus"/>Add library to queue</button></div></section><div className="km-shortcuts">{[['playlists','playlists','Playlists','Made by you'],['albums','albums','Albums','The complete experience'],['library','music','Songs','Every song, one place'],['library','search','Search','Find your next favorite']].map(([id,icon,title,subtitle],i)=><button className={`km-shortcut km-accent-${i}`} key={title} onClick={()=>navigate(id,icon==='search')}><Icon name={icon}/><strong>{title}</strong><small>{subtitle}</small></button>)}</div><HomeShelf title="Songs" eyebrow="RECENTLY PLAYED BY YOU" items={shelves.songs} kind="song" onSelect={playback.playNow} onViewAll={()=>navigate('library')} emptyMessage="Play a song to see your recently played music here."/><HomeShelf title="Albums" eyebrow={shelves.hasVisitedAlbums?'RECENTLY VISITED':'LATEST ADDITIONS'} items={shelves.albums} kind="album" onSelect={openAlbum} onAlbumQueue={queueAlbum} onAlbumPlaylist={setAlbumForPlaylist} onAlbumDownload={downloadAlbum} onViewAll={()=>navigate('albums')} emptyMessage="Albums will appear here when songs are added to your library."/><section className="km-block"><div className="km-section-heading"><div><p className="km-eyebrow">A MIX FOR EVERY MOMENT</p><h2>Your playlists</h2></div><button className="km-text-button" onClick={()=>navigate('playlists')}>View all</button></div>{homePlaylists.length?playlistCards(homePlaylists):<div className="km-empty km-empty--compact"><Icon name="playlists"/><div><h3>Your mood. Your mix.</h3><p>Create a playlist and fill it with songs you love.</p></div></div>}</section></>}
    {section==='albums'&&<section className="km-block"><p className="km-eyebrow">THE WHOLE STORY</p><h1>Albums</h1><p className="km-muted">From the opening track to the final note.</p>{albums.length?albumCards():<div className="km-empty"><Icon name="albums"/><h3>No albums yet</h3><p>Albums appear when songs have an album name.</p></div>}</section>}
    {section==='playlists'&&<section className="km-block"><p className="km-eyebrow">CURATED BY YOU</p><h1>Playlists</h1><p className="km-muted">Playlists shared by every profile on your account.</p><form className="km-playlist-form" onSubmit={e=>{e.preventDefault();const form=e.currentTarget,name=new FormData(form).get('name');run(async()=>{const p=await request('/api/playlists',{method:'POST',body:JSON.stringify({name})});setPlaylists(v=>[...v,p]);form.reset()})}}><label htmlFor="playlist-name">Create a playlist</label><div><input id="playlist-name" name="name" placeholder="Give your mix a name" maxLength={80} required/><button className="km-btn--primary" disabled={busy}><Icon name="plus"/>Create</button></div></form>{playlists.length?playlistCards(playlists):<div className="km-empty"><Icon name="playlists"/><h3>Start with a name. Make it yours.</h3><p>Add songs from your music library after creating a playlist.</p></div>}</section>}
    {section==='library'&&<section className="km-block"><p className="km-eyebrow">PRESS PLAY. FEEL SOMETHING.</p><h1>{filter?.name||filter?.album||'Songs'}</h1><div className="km-library-toolbar"><label className="km-search"><Icon name="search"/><input ref={searchInput} aria-label="Search music" placeholder="Search songs, artists, albums" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="km-btn--primary" disabled={busy||!visible.length} onClick={()=>play(visible)}><Icon name="plus"/>Add all to queue</button>{filter&&<button onClick={()=>setFilter(null)}>All songs</button>}</div>{filter?.playlistId&&query.trim()&&<p className="km-muted">Clear the search to reorder playlist songs.</p>}<SongList playlistView={!!filter?.playlistId} onReorder={filter?.playlistId&&!query.trim()&&canEditPlaylist(playlists.find(list=>list.id===filter.playlistId)||{},profile)?async mediaIds=>{const playlistId=filter.playlistId;const result=await request(`/api/playlists/${playlistId}/order`,{method:'POST',body:JSON.stringify({mediaIds})});setFilter(current=>current?.playlistId===playlistId?{...current,ids:result.mediaIds}:current);await refreshPlaylists()}:undefined} songs={visible} currentId={current?.id} busy={busy||playback.busy} onPlay={playback.playNow} onRemoveFromPlaylist={filter?.playlistId&&canEditPlaylist(playlists.find(list=>list.id===filter.playlistId)||{},profile)?async song=>{await request(`/api/playlists/${filter.playlistId}/tracks/${song.id}`,{method:'DELETE'});await refreshPlaylists();setFilter(current=>current?{...current,ids:current.ids.filter(id=>id!==song.id)}:current)}:undefined} onAlbum={openAlbum} onDownload={async song=>{const result=await request(`/api/media/${song.id}/download`,{method:'POST',body:JSON.stringify({profileId:profile.id})});const link=document.createElement('a');link.href=result.url;link.download=result.filename;document.body.appendChild(link);link.click();link.remove()}} onQueue={song=>playback.add([song])} playlists={editablePlaylists} onSave={async(playlistId,mediaId)=>{await request(`/api/playlists/${playlistId}/tracks`,{method:'POST',body:JSON.stringify({mediaId})});await refreshPlaylists();if(filter?.playlistId===playlistId){const rows=await request(`/api/playlists/${playlistId}/tracks`);setFilter({...filter,ids:rows.map(song=>song.id)})}}}/>{!visible.length&&<div className="km-empty"><Icon name="music"/><h3>{query?'No matching songs':'Your soundtrack starts here'}</h3><p>{query?'Try another song, artist, or album.':filter?.ids?'Add songs to this playlist from Your music.':'Songs in your collection will appear here.'}</p></div>}</section>}
    {section==='profiles'&&profile.role==='adult'&&<section className="km-block"><h1>Manage Profiles</h1><p className="km-muted">Choose the profile you want to edit.</p><div className="km-profile-grid km-profile-manage-grid">{profiles.map((p,index)=><button className="km-profile-card" key={p.id} onClick={()=>{setError('');setEditingProfile(p);setProfileForm(true)}}><span className="km-profile-art"><ProfilePortrait profile={p} index={index}/></span><strong>{p.name}</strong><small>{p.role==='adult'?'Adult':'Kids'}</small></button>)}<button className="km-profile-card km-profile-add" onClick={()=>beginProfileManagement('add')}><span className="km-profile-art"><Icon name="plus"/></span><strong>Add Profile</strong></button></div></section>}
    {section==='admin'&&profile.role==='adult'&&<section className="km-block km-manage-music"><header className="km-manage-heading"><p className="km-eyebrow">MAKE YOURSELF AT HOME</p><h1>Manage Music</h1><p className="km-muted">Manage music shared by every profile on your account.</p></header><YoutubeImporter request={request} onImported={async()=>{setTracks(await request('/api/library'));setPlaylists(await request('/api/playlists'))}}/><SongManager songs={tracks} request={request} onPreview={song=>play([song])} currentId={current?.id} onSaved={async()=>setTracks(await request('/api/library'))}/><div className="km-admin-grid"><section className="km-panel"><h2>Upload a song</h2><p className="km-muted">Add audio to your private music collection.</p><form onSubmit={e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form),file=data.get('file');run(async()=>{setUploadStatus('Preparing upload...');try{if(!(file instanceof File)||!file.size)throw new Error('Choose an audio file.');const upload=await request('/api/admin/uploads',{method:'POST',body:JSON.stringify({title:data.get('title'),artist:data.get('artist'),album:data.get('album'),trackNumber:Number(data.get('trackNumber')),kidsAllowed:data.has('kidsAllowed'),filename:file.name,size:file.size})});setUploadStatus('Uploading song...');const response=await fetch(upload.url,{method:'PUT',headers:upload.headers,body:file});if(!response.ok)throw new Error('The song could not be uploaded. Try again.');setUploadStatus('Saving to your library...');await request(`/api/admin/uploads/${upload.id}/complete`,{method:'POST',body:'{}'});setTracks(await request('/api/library'));form.reset();setUploadStatus('Song added to your library.')}catch(error){setUploadStatus('');throw error}})}}><fieldset className="km-upload-fields" disabled={busy}><label>Audio file<input name="file" type="file" accept=".mp3,.m4a,.aac,.flac,.ogg,.opus,.wav" required/></label><small>MP3, M4A, AAC, FLAC, OGG, OPUS, or WAV. Up to 100 MiB.</small>{[['title','Song title'],['artist','Artist'],['album','Album']].map(([name,label])=><label key={name}>{label}<input name={name} maxLength={200} required={name==='title'}/></label>)}<label>Track number<input name="trackNumber" type="number" min="0" defaultValue="1" required/></label><label className="km-checkbox"><input type="checkbox" name="kidsAllowed"/>Available to kids</label><button className="km-btn--primary" disabled={busy}><Icon name="plus"/>{busy?'Uploading...':'Upload song'}</button></fieldset><p role="status" aria-live="polite">{uploadStatus}</p></form></section></div></section>}
  </Shell>{player}{passwordGate()}<AvatarGallery open={ownAvatarOpen} value={profile.avatar || (profile.role==='kids'?'penguin':'ember')} busy={avatarSaving} error={avatarError} onClose={()=>setOwnAvatarOpen(false)} onSelect={changeOwnAvatar}/>{albumPlaylistPicker}</>
}
createRoot(document.getElementById('root')).render(<AuthProvider><App/></AuthProvider>)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.error))
}
