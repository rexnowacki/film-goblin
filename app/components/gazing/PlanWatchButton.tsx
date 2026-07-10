"use client";
import { useEffect,useState } from "react"; import {useSearchParams}from"next/navigation";import PlanWatchSheet from "./PlanWatchSheet";
export interface PlanWatchMember {id:string;username:string;avatar_url:string|null;}
export default function PlanWatchButton({filmId,filmTitle,members}:{filmId:string;filmTitle:string;members:PlanWatchMember[]}){const params=useSearchParams();const[open,setOpen]=useState(false);useEffect(()=>{if(params.get("plan")==="1")setOpen(true);},[params]);return <><button type="button" className="btn-outline btn-lg" onClick={()=>setOpen(true)}>Plan a watch</button>{open&&<PlanWatchSheet filmId={filmId} filmTitle={filmTitle} members={members} continuationSource={params.get("continuation_source")} onClose={()=>setOpen(false)}/>}</>}
