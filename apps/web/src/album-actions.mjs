import { Zip, ZipPassThrough } from 'fflate'
export function albumSongs(tracks,album) {
  return tracks.filter(song=>song.album===album.album&&(song.artist||'')===(album.artist||'')).sort((a,b)=>((Number(a.trackNumber)>0?Number(a.trackNumber):Infinity)-(Number(b.trackNumber)>0?Number(b.trackNumber):Infinity))||String(a.title).localeCompare(String(b.title)))
}
export const albumId=album=>`album:${encodeURIComponent(JSON.stringify([album.album,album.artist||'']))}`
export function safeDownloadName(value) {
  return String(value||'Album').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/^\.+/,'').trim().slice(0,140)||'Album'
}
export async function buildAlbumZip(songs,getDownload,{fetchImpl=fetch,onProgress=()=>{},maxBytes=500*1024*1024,signal}={}) {
  if(!songs.length)throw new Error('This album has no available songs.')
  const chunks=[];let zipError=null,finished=false,totalBytes=0
  const zip=new Zip((error,data,final)=>{if(error)zipError=error;else if(data)chunks.push(data);if(final)finished=true})
  try{
    for(let index=0;index<songs.length;index++){
      signal?.throwIfAborted();onProgress({done:index,total:songs.length})
      const song=songs[index],download=await getDownload(song)
      const response=await fetchImpl(download.url,{signal})
      if(!response.ok)throw new Error(`Could not download ${song.title}. Please try again.`)
      if(totalBytes+Number(response.headers.get('Content-Length')||0)>maxBytes){await response.body?.cancel();throw new Error('This album is too large for a browser ZIP download. Download the songs individually.')}
      const filename=download.filename||song.title+'.m4a',extension=/\.[a-z0-9]{1,8}$/i.exec(filename)?.[0]||'.m4a'
      const stem=filename.endsWith(extension)?filename.slice(0,-extension.length):filename
      const name=`${String(index+1).padStart(2,'0')} - ${safeDownloadName(stem)}${extension}`
      const entry=new ZipPassThrough(name);zip.add(entry)
      let fileBytes=0
      const push=chunk=>{fileBytes+=chunk.length;totalBytes+=chunk.length;if(totalBytes>maxBytes)throw new Error('This album is too large for a browser ZIP download. Download the songs individually.');entry.push(chunk);if(zipError)throw zipError}
      if(response.body){
        const reader=response.body.getReader()
        try{while(true){const {done,value}=await reader.read();if(done)break;push(value)}}catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
      }else push(new Uint8Array(await response.arrayBuffer()))
      if(!fileBytes)throw new Error(`The download for ${song.title} was empty. Please retry.`)
      entry.push(new Uint8Array(0),true)
      onProgress({done:index+1,total:songs.length})
    }
    zip.end();if(zipError)throw zipError;if(!finished)throw new Error('The album download could not be completed.')
    return new Blob(chunks,{type:'application/zip'})
  }catch(error){zip.terminate();throw error}
}
export function saveAlbumZip(blob,album) {
  const url=URL.createObjectURL(blob),link=document.createElement('a')
  link.href=url;link.download=safeDownloadName(album.album)+'.zip';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)
}
