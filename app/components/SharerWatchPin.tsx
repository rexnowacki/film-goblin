import Link from "next/link";
import type { SharerWatch } from "@/lib/queries/sharer-watch";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthName(isoDate: string): string {
  const m = Number(isoDate.slice(5, 7));
  return Number.isFinite(m) && m >= 1 && m <= 12 ? MONTHS[m - 1] : "the past";
}

interface Props {
  watch: SharerWatch;
}

export default function SharerWatchPin({ watch }: Props) {
  return (
    <div className="sharer-watch-pin">
      <div className="sharer-watch-pin-line">
        ✦{" "}
        <Link href={`/p/${encodeURIComponent(watch.username)}`} className="sharer-watch-pin-username">
          {watch.username}
        </Link>{" "}
        watched this in {monthName(watch.watched_at)}.
        {watch.recommended !== null && (
          <span className={`sharer-watch-pin-verdict ${watch.recommended ? "loved" : "didnt"}`}>
            {watch.recommended ? "loved it" : "didn't love it"}
          </span>
        )}
      </div>
      {watch.note && (
        <div className="sharer-watch-pin-note">&ldquo;{watch.note}&rdquo;</div>
      )}
    </div>
  );
}
