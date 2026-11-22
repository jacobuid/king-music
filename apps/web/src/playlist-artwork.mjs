export function cropSquare(image,zoom=1,x=0,y=0) {
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height
  const side=Math.min(width,height)/Math.max(1,zoom)
  return {sx:(width-side)*(Math.max(-1,Math.min(1,x))+1)/2,sy:(height-side)*(Math.max(-1,Math.min(1,y))+1)/2,side}
}
export function playlistTiles(coverSongs=[]) {
  const songs=coverSongs.slice(0,4)
  return Array.from({length:4},(_,index)=>songs.length?songs[index%songs.length]:null)
}
