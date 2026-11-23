const SECTIONS=new Set(['home','library','playlists','playlist','albums','album','artist','admin','profiles'])
export function historyPage(value={}) {
 const section=SECTIONS.has(value.section)?value.section:'home'
 const page={section,query:typeof value.query==='string'?value.query.slice(0,500):'',filter:null,profileForm:value.profileForm===true,editingProfileId:typeof value.editingProfileId==='string'?value.editingProfileId:null}
 const filter=value.filter
 if(filter&&typeof filter==='object'){
  if(typeof filter.playlistId==='string')page.filter={playlistId:filter.playlistId,name:typeof filter.name==='string'?filter.name:'Playlist',ids:Array.isArray(filter.ids)?filter.ids.filter(id=>typeof id==='string').slice(0,10000):[]}
  else if(typeof filter.album==='string')page.filter={album:filter.album,artist:typeof filter.artist==='string'?filter.artist:''}
  else if(typeof filter.artist==='string')page.filter={artist:filter.artist}
 }
 if(page.filter?.playlistId&&['library','playlists'].includes(section))page.section='playlist'
 if(page.filter?.album&&section==='library')page.section='album'
 if(page.section==='playlist'&&!page.filter?.playlistId)page.section='playlists'
 if(page.section==='album'&&!page.filter?.album)page.section='albums'
 if(page.section==='artist'&&!page.filter?.artist)page.section='library'
 return page
}
export function pageHash(value){
 const page=historyPage(value),params=new URLSearchParams()
 if(page.section==='playlist')params.set('id',page.filter.playlistId)
 else if(page.section==='album'){params.set('album',page.filter.album);params.set('artist',page.filter.artist)}
 else if(page.section==='artist')params.set('artist',page.filter.artist)
 const route=page.profileForm?'profile':page.section==='library'?'songs':page.section
 return '#'+route+(params.size?'?'+params.toString():'')
}
export function readPageHash(hash=''){
 const [route,search='']=hash.replace(/^#/,'').split('?'),params=new URLSearchParams(search)
 const section=route==='songs'?'library':route
 const playlistId=params.get('id')||params.get('playlist')
 let filter=null
 if(playlistId&&['playlist','playlists','library'].includes(section))filter={playlistId,name:'Playlist',ids:[]}
 else if(params.has('album'))filter={album:params.get('album'),artist:params.get('artist')||''}
 else if(section==='artist'&&params.get('artist'))filter={artist:params.get('artist')}
 return historyPage({section,filter})
}
export function navigationSection(section){return {playlist:'playlists',album:'albums',artist:'library'}[section]||section}
