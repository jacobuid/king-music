import {useLayoutEffect,useRef} from 'react'
export function useDetailSummary(){
 const panel=useRef(null),refresh=useRef(()=>{})
 useLayoutEffect(()=>{
  const node=panel.current
  if(!node)return
  function update(){
   if(!node.isConnected)return
   if(window.innerWidth<=1100){node.style.removeProperty('--detail-art-size');node.style.removeProperty('--detail-panel-height');return}
   const player=document.querySelector('.km-player-bar')
   const playerHeight=player?player.getBoundingClientRect().height:0
   const height=Math.max(0,(window.visualViewport?.height||window.innerHeight)-Math.max(20,node.getBoundingClientRect().top)-playerHeight-20)
   const fixed=[...node.children].filter(child=>!child.matches('.km-detail-cover,.km-artist-avatar')&&getComputedStyle(child).display!=='none')
   const reserved=fixed.reduce((sum,child)=>sum+child.getBoundingClientRect().height,0)+fixed.length*16
   const artwork=Math.max(64,Math.min(node.clientWidth,height-reserved))
   node.style.setProperty('--detail-panel-height',height+'px')
   node.style.setProperty('--detail-art-size',artwork+'px')
  }
  refresh.current=update;update()
  const observer=new ResizeObserver(update)
  observer.observe(node)
  for(const child of [...node.children].filter(child=>!child.matches('.km-detail-cover,.km-artist-avatar')))observer.observe(child)
  window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update)
  return()=>{observer.disconnect();window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);refresh.current=()=>{}}
 },[])
 useLayoutEffect(()=>refresh.current())
 return panel
}
