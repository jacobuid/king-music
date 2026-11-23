import {useEffect,useRef,useState} from 'react'
export function useCollectionInfo(request,{kind,artist,album=''}){
 const api=useRef(request);api.current=request
 const [revision,setRevision]=useState(0),[state,setState]=useState({loading:true,data:null,error:false})
 useEffect(()=>{
  let active=true
  setState({loading:true,data:null,error:false})
  if(!artist||!api.current){setState({loading:false,data:null,error:false});return}
  const params=new URLSearchParams({kind,artist,...(album?{album}:{})})
  api.current('/api/collection/details?'+params).then(data=>{if(active)setState({loading:false,data,error:false})}).catch(()=>{if(active)setState({loading:false,data:null,error:true})})
  return()=>{active=false}
 },[kind,artist,album,revision])
 return {...state,retry:()=>setRevision(value=>value+1)}
}
