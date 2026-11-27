// Download bytes are measured; post-download work uses a bounded time estimate.
export function importProgressPercent(value,elapsedMs=0){
 const reported=Math.max(0,Math.min(100,Math.floor(Number(value)||0)))
 if(reported<80||reported===100)return reported
 const baseline=80+(reported-80)*14/19
 const elapsed=Math.max(0,Number(elapsedMs)||0)
 return Math.min(99,Math.floor(baseline+(99-baseline)*(1-Math.exp(-elapsed/45000))))
}
