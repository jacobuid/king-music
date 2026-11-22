export const QUEUE_IDLE_MS = 60 * 60 * 1000
export const emptyQueue = () => ({ entries: [], history: [] })
export function queueReducer(state, action) {
  const { entries, history } = state
  switch (action.type) {
    case 'add': return { history: entries.length ? history : [], entries: [...entries, ...action.songs] }
    case 'playNow': return {entries:[action.song,...entries.slice(1)],history:entries.length?[...history,entries[0]]:[]}
    case 'clear': return emptyQueue()
    case 'next': return entries.length ? { entries: entries.slice(1), history: [...history, entries[0]] } : state
    case 'previous': return history.length ? { entries: [history.at(-1), ...entries], history: history.slice(0, -1) } : state
    case 'remove': return { entries: entries.filter(song => song.queueId !== action.id), history: history.filter(song => song.queueId !== action.id) }
    case 'select': {
      const song = entries.find(song => song.queueId === action.id)
      if (!song || song === entries[0]) return state
      return { entries: [song, ...entries.slice(1).filter(item => item !== song)], history: [...history, entries[0]] }
    }
    case 'move': {
      const from = entries.findIndex(song => song.queueId === action.id)
      const to = entries.findIndex(song => song.queueId === action.before)
      if (from < 1 || to < 1 || from === to) return state
      const reordered = [...entries]
      reordered.splice(to, 0, ...reordered.splice(from, 1))
      return { ...state, entries: reordered }
    }
    case 'shuffle': {
      const reordered = [...entries]
      for (let i = reordered.length - 1; i > 1; i--) {
        const j = 1 + Math.floor((action.random || Math.random)() * i)
        ;[reordered[i], reordered[j]] = [reordered[j], reordered[i]]
      }
      return { ...state, entries: reordered }
    }
    default: return state
  }
}
