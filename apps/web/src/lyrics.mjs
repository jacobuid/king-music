export function parseLrc(text) {
  if(typeof text!=='string')return []
  const lines=[]
  for(const line of text.split(/\r?\n/)){
    const matches=[...line.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)]
    const content=line.replace(/\[[^\]]*\]/g,'').trim()
    if(!content)continue
    for(const match of matches){const seconds=Number(match[2]);if(seconds<60)lines.push({time:Number(match[1])*60+seconds,text:content})}
  }
  return lines.sort((a,b)=>a.time-b.time)
}
