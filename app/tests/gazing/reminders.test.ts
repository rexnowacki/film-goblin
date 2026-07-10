import { describe, expect, it } from "vitest"; import { getReminderDue } from "@/lib/gazing/reminders";
const base={status:"scheduled" as const,startsAt:"2026-07-11T12:00:00Z",reminder24hSentAt:null,reminder2hSentAt:null,aftermathSentAt:null};
describe("gazing reminders",()=>{
 it("selects exact 24h and 2h windows without duplicates",()=>{ expect(getReminderDue(base,new Date("2026-07-10T12:00:00Z"))).toEqual(["gazing_reminder_24h"]); expect(getReminderDue(base,new Date("2026-07-11T10:00:00Z"))).toEqual(["gazing_reminder_2h"]); expect(getReminderDue({...base,reminder2hSentAt:"x"},new Date("2026-07-11T10:00:00Z"))).toEqual([]); });
 it("suppresses cancelled and emits aftermath for happened or an unresolved scheduled night after two hours",()=>{ expect(getReminderDue({...base,status:"cancelled"},new Date())).toEqual([]); expect(getReminderDue({...base,status:"happened"},new Date("2026-07-11T13:00:00Z"))).toEqual(["gazing_aftermath"]);expect(getReminderDue(base,new Date("2026-07-11T14:00:00Z"))).toEqual(["gazing_aftermath"]); });
});
