import { describe, expect, it } from "vitest"; import { canConfirmAttendance, canTransitionGazing } from "@/lib/gazing/state";
const start="2026-07-10T20:00:00Z";
describe("gazing state",()=>{
 it("allows host cancellation before start and happened at/after start only",()=>{ expect(canTransitionGazing({current:"scheduled",next:"cancelled",startsAt:start,now:new Date("2026-07-10T19:00:00Z"),isHost:true})).toBe(true); expect(canTransitionGazing({current:"scheduled",next:"happened",startsAt:start,now:new Date(start),isHost:true})).toBe(true); expect(canTransitionGazing({current:"scheduled",next:"happened",startsAt:start,now:new Date("2026-07-10T19:59:59Z"),isHost:true})).toBe(false); });
 it("never reopens or lets a participant close",()=>{ expect(canTransitionGazing({current:"happened",next:"scheduled",startsAt:start,now:new Date(start),isHost:true})).toBe(false); expect(canTransitionGazing({current:"scheduled",next:"cancelled",startsAt:start,now:new Date(start),isHost:false})).toBe(false); });
 it("allows only host or RSVP self-confirmation after start",()=>{ expect(canConfirmAttendance({status:"scheduled",startsAt:start,now:new Date(start),isHost:false,hasRsvp:true})).toBe(true); expect(canConfirmAttendance({status:"cancelled",startsAt:start,now:new Date(start),isHost:true,hasRsvp:false})).toBe(false); });
});
