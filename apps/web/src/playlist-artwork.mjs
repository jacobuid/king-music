export function cropSquare(image,zoom=1,x=0,y=0) {
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height
  const side=Math.min(width,height)/Math.max(1,zoom)
  return {sx:(width-side)*(Math.max(-1,Math.min(1,x))+1)/2,sy:(height-side)*(Math.max(-1,Math.min(1,y))+1)/2,side}
}
export function playlistTiles(coverSongs=[],librarySongs=[]) {
  const library=new Map(librarySongs.map(song=>[song.id,song]))
  const seen=new Set(),songs=[]
  for(const coverSong of coverSongs){
    const song={...library.get(coverSong.id),...coverSong}
    const known=library.get(coverSong.id)
    if(!song.album&&known?.album){song.album=known.album;song.artist=known.artist}
    const key=song.album?.trim()?JSON.stringify([song.album.trim().toLowerCase(),(song.artist||'').trim().toLowerCase()]):song.id||song.thumbnailUrl
    if(seen.has(key))continue
    seen.add(key);songs.push(song)
    if(songs.length===4)break
  }
  return Array.from({length:4},(_,index)=>songs[index]||null)
}
