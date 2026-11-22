import type { Env } from './index'
import { allowedKey, playbackUrl } from './storage'
export async function accountPlaylists(env:Env,profile:{id:string;role:string;user_id:string}) {
  const lists=await env.DB.prepare(`SELECT p.id,p.name,p.cover_key,p.profile_id AS creatorId,owner.name AS creatorName,(?=1 OR p.profile_id=?) AS canEdit FROM playlists p JOIN profiles owner ON owner.id=p.profile_id WHERE owner.user_id=? ORDER BY p.created_at`).bind(profile.role==='adult'?1:0,profile.id,profile.user_id).all<{id:string;name:string;cover_key:string|null;creatorId:string;creatorName:string;canEdit:number}>()
  const covers=await env.DB.prepare(`WITH counts AS (SELECT media_id,SUM(play_count) AS plays,MAX(last_played_at) AS last_played FROM profile_song_history GROUP BY media_id),ranked AS (
    SELECT t.playlist_id,m.id,m.thumbnail_key,m.thumbnail_url,COALESCE(c.plays,0) AS play_count,
    ROW_NUMBER() OVER(PARTITION BY t.playlist_id ORDER BY COALESCE(c.plays,0) DESC,COALESCE(c.last_played,0) DESC,t.position,m.id) AS rank
    FROM playlist_tracks t JOIN playlists p ON p.id=t.playlist_id JOIN profiles owner ON owner.id=p.profile_id JOIN media m ON m.id=t.media_id LEFT JOIN counts c ON c.media_id=m.id
    WHERE owner.user_id=? AND m.user_id=? AND (?=1 OR m.kids_allowed=1)) SELECT * FROM ranked WHERE rank<=4 ORDER BY playlist_id,rank`).bind(profile.user_id,profile.user_id,profile.role==='adult'?1:0).all<{playlist_id:string;id:string;thumbnail_key:string|null;thumbnail_url:string|null;play_count:number}>()
  return Promise.all(lists.results.map(async list=>({id:list.id,name:list.name,creatorId:list.creatorId,creatorName:list.creatorName,canEdit:!!list.canEdit,thumbnailUrl:list.cover_key&&allowedKey(list.cover_key)?await playbackUrl(env,list.cover_key):null,coverSongs:await Promise.all(covers.results.filter(song=>song.playlist_id===list.id).map(async song=>({id:song.id,playCount:song.play_count,thumbnailUrl:song.thumbnail_key&&allowedKey(song.thumbnail_key)?await playbackUrl(env,song.thumbnail_key):song.thumbnail_url})))})))
}
