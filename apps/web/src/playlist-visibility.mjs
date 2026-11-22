export const ownPlaylists=(playlists,profileId)=>playlists.filter(list=>list.creatorId===profileId)
export const canEditPlaylist=(list,profile)=>!!profile&&(list.canEdit===undefined?(profile.role==='adult'||list.creatorId===profile.id):!!list.canEdit)
