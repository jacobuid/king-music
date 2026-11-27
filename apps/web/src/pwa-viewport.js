// Limit zoom gestures only in the installed app; preserve normal page scrolling.
const displayMode=window.matchMedia('(display-mode: standalone)')
const installed=()=>displayMode.matches||navigator.standalone===true
function updateViewport(){
 const active=installed()
 document.documentElement.classList.toggle('km-installed-app',active)
 document.querySelector('meta[name="viewport"]')?.setAttribute('content',active?'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no':'width=device-width,initial-scale=1')
}
updateViewport()
displayMode.addEventListener('change',updateViewport)
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,event=>{if(installed())event.preventDefault()},{passive:false})
for(const type of ['touchstart','touchmove'])document.addEventListener(type,event=>{if(installed()&&event.touches.length>1)event.preventDefault()},{passive:false})
document.addEventListener('wheel',event=>{if(installed()&&event.ctrlKey)event.preventDefault()},{passive:false})
