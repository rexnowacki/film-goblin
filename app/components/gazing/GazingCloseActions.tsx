"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeGazing } from "@/lib/actions/gazing";
import { trackProductEvent } from "@/lib/product-events/browser";

export default function GazingCloseActions({token,inviteId,canHappen}:{token:string;inviteId:string;canHappen:boolean}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const close = (status:"happened"|"cancelled") => start(async() => {
    await closeGazing(token,status);
    trackProductEvent({event_name:"gazing_closed",subject_type:"gazing_invite",subject_id:inviteId,properties:{status}});
    if (status === "cancelled") router.replace("/coven/gazings");
  });
  return <div className="gazing-close-actions"><button className="btn" disabled={pending||!canHappen} onClick={()=>close("happened")}>It happened</button><button className="btn-outline" disabled={pending} onClick={()=>close("cancelled")}>Cancel gazing</button></div>;
}
