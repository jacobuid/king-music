export function filterSongs(songs, {query='',artists=[],albums=[]}) {
  const text=query.trim().toLowerCase()
  return songs.filter(song=>(!artists.length||artists.includes(song.artist||''))&&(!albums.length||albums.includes(song.album||''))&&`${song.title||''} ${song.artist||''} ${song.album||''}`.toLowerCase().includes(text))
}
export function songFilterOptions(songs,field) {
  return [...new Set(songs.map(song=>song[field]||''))].sort((a,b)=>a.localeCompare(b))
}
