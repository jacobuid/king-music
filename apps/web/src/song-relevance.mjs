export function normalizeSearch(value='') {return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
export function matchesSong(song,query){const terms=normalizeSearch(query).split(' ').filter(Boolean),text=normalizeSearch([song.title,song.artist,song.album].join(' '));return terms.every(term=>text.includes(term))}
export function songRelevance(song,query){
 const q=normalizeSearch(query);if(!q)return 0
 const title=normalizeSearch(song.title),artist=normalizeSearch(song.artist),album=normalizeSearch(song.album),terms=q.split(' '),words=title.split(' ')
 if(title===q)return 10000
 let score=0
 if(terms.every(term=>words.includes(term)))score=6000
 else if(terms.every(term=>title.includes(term)))score=4000
 if(title.startsWith(q+' '))score+=800
 if(title.includes(q))score+=400
 if(artist===q)score+=1800;else if(artist.includes(q))score+=600
 if(album===q)score+=900;else if(album.includes(q))score+=300
 if(matchesSong(song,q))score+=100
 return score
}
export function rankSongs(songs,query){return songs.map((song,index)=>({song,index,score:songRelevance(song,query)})).sort((a,b)=>b.score-a.score||Number(!!a.song.discovery)-Number(!!b.song.discovery)||a.index-b.index).map(item=>item.song)}
