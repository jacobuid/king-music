const albumKey=(album,artist)=>JSON.stringify([album,artist||''])
const timestamp=value=>{const time=typeof value==='number'?value:Date.parse(value);return Number.isFinite(time)?time:0}
export const emptyHomeActivity=()=>({songs:[],albums:[]})
export function recentSong(activity,mediaId,lastPlayedAt=Date.now()) {
  if(activity.songs.some(song=>song.mediaId===mediaId&&song.lastPlayedAt>lastPlayedAt))return activity
  return {...activity,songs:[{mediaId,lastPlayedAt},...activity.songs.filter(song=>song.mediaId!==mediaId)].sort((a,b)=>b.lastPlayedAt-a.lastPlayedAt).slice(0,24)}
}
export function recentAlbum(activity,album,artist,lastVisitedAt=Date.now()) {
  if(activity.albums.some(item=>albumKey(item.album,item.artist)===albumKey(album,artist)&&item.lastVisitedAt>lastVisitedAt))return activity
  return {...activity,albums:[{album,artist,lastVisitedAt},...activity.albums.filter(item=>albumKey(item.album,item.artist)!==albumKey(album,artist))].sort((a,b)=>b.lastVisitedAt-a.lastVisitedAt).slice(0,24)}
}
export function homeShelves(tracks,activity=emptyHomeActivity()) {
  const byId=new Map(tracks.map(song=>[song.id,song]))
  const songs=[...activity.songs].sort((a,b)=>timestamp(b.lastPlayedAt)-timestamp(a.lastPlayedAt)).map(item=>byId.get(item.mediaId)).filter(Boolean).slice(0,5)
  const newest=[...tracks].sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt)||String(a.id).localeCompare(String(b.id)))
  const byAlbum=new Map()
  for(const song of newest){if(song.album&&!byAlbum.has(albumKey(song.album,song.artist)))byAlbum.set(albumKey(song.album,song.artist),song)}
  const visited=[...activity.albums].sort((a,b)=>timestamp(b.lastVisitedAt)-timestamp(a.lastVisitedAt)).map(item=>byAlbum.get(albumKey(item.album,item.artist))).filter(Boolean)
  return {songs,albums:(visited.length?visited:[...byAlbum.values()]).slice(0,12),hasVisitedAlbums:visited.length>0}
}
