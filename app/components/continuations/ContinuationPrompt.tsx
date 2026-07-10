"use client";
import{useEffect,useState,useTransition}from"react";import Link from"next/link";import{resolveContinuation,type ContinuationSource}from"@/lib/continuations/resolve";import{trackProductEvent}from"@/lib/product-events/browser";import{setWatchlistMaxPrice}from"@/lib/actions/watchlists";import{confirmPurchase}from"@/lib/actions/library";
export default function ContinuationPrompt({source,filmId,username}:{source:ContinuationSource;filmId?:string;username?:string}){
 const key=`fg_continuation_closed:${source}:${filmId??username??"x"}`;const[closed,setClosed]=useState(true);const[priceOpen,setPriceOpen]=useState<"price_target"|"purchase_price"|null>(null);const[price,setPrice]=useState("");const[pending,start]=useTransition();const choices=resolveContinuation(source,{filmId,username});
 useEffect(()=>{if(sessionStorage.getItem(key)||!choices.length)return;setClosed(false);trackProductEvent({event_name:"continuation_prompt_viewed",properties:{source_action:source,continuation_kind:choices.map(choice=>choice.kind).join("+")}});},[key,source,choices.length]);
 if(closed||!choices.length)return null;
 const savePrice=()=>{if(!filmId||!priceOpen)return;start(async()=>{if(priceOpen==="price_target")await setWatchlistMaxPrice(filmId,Number(price));else await confirmPurchase(filmId,Number(price));trackProductEvent({event_name:"continuation_prompt_acted",properties:{source_action:source,continuation_kind:priceOpen}});setClosed(true);});};
 return <aside className="continuation-prompt">
  <button aria-label="Close continuation" onClick={()=>{sessionStorage.setItem(key,"1");setClosed(true);}}>×</button>
  <div><div className="eyebrow">Keep the thread alive</div><p>What follows this action?</p>{priceOpen&&filmId&&<div className="continuation-price"><label>$<input inputMode="decimal" value={price} onChange={event=>setPrice(event.target.value)} placeholder="4.99"/></label><button disabled={pending} onClick={savePrice}>{priceOpen==="price_target"?"Arm summon":"Record tithe"}</button></div>}</div>
  <div>{choices.map(choice=>{
   if(choice.kind==="price_target"||choice.kind==="purchase_price"){const priceKind=choice.kind;return <button key={priceKind} onClick={()=>setPriceOpen(priceKind)}>{choice.label} →</button>;}
   const separator=choice.href.includes("?")?"&":"?";const href=choice.href.startsWith("#")?choice.href:`${choice.href}${separator}continuation_source=${source}&continuation_kind=${choice.kind}`;
   return <Link prefetch={false} key={choice.kind} href={href}>{choice.label} →</Link>;
  })}</div>
 </aside>;
}
