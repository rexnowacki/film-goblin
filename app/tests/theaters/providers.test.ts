import { describe, expect, it } from "vitest";
import { parseGuildComingSoon } from "@/lib/theaters/providers/guild";
import { parseLoftComingSoon } from "@/lib/theaters/providers/loft";

const now = new Date("2026-05-05T12:00:00Z");

describe("parseLoftComingSoon", () => {
  it("extracts title, runtime, category, and date labels", () => {
    const html = `
      <h3><a href="/film/se7en/">Se7en</a></h3>
      <h4>2 HR 7 MIN | R</h4>
      <h5>Cult Classics / 4K restoration!</h5>
      <h5>Starts May 8</h5>
      <h3><a href="/film/rocky/">The Rocky Horror Picture Show</a></h3>
      <h4>1 HR 40 MIN | R</h4>
      <h5>Saturday, May 16</h5>
    `;
    const rows = parseLoftComingSoon(html, now);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "Se7en",
      theaterSlug: "loft-cinema",
      runtimeLabel: "2 HR 7 MIN",
      ratingLabel: "R",
      categoryLabels: ["Cult Classics / 4K restoration!"],
      startsOn: "2026-05-08",
    });
  });
});

describe("parseGuildComingSoon", () => {
  it("extracts title years, descriptions, date ranges, and showtime labels", () => {
    const html = `
      <div role="listitem">
        <h4>FERRIS BUELLER'S DAY OFF (1986)</h4>
        <p>A NM Entertainment Magazine 40th Anniversary special screening.</p>
        <p>May 8</p>
        <p>Fri 10:30pm only</p>
        <a href="/ferris" aria-label="Read More">Read More</a>
      </div>
      <div role="listitem">
        <h4>NORMAL</h4>
        <p>Ben Wheatley's newest outrageous neo-western.</p>
        <p>May 9 thru 11</p>
        <p>Sat to Mon 5:30pm only!</p>
        <a href="/normal" aria-label="Read More">Read More</a>
      </div>
    `;
    const rows = parseGuildComingSoon(html, now);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "FERRIS BUELLER'S DAY OFF",
      rawTitle: "FERRIS BUELLER'S DAY OFF (1986)",
      sourceId: "FERRIS BUELLER'S DAY OFF-1986",
      sourceUrl: "https://www.guildcinema.com/ferris",
      startsOn: "2026-05-08",
      showtimeLabel: "Fri 10:30pm only",
    });
    expect(rows[1]).toMatchObject({
      title: "NORMAL",
      startsOn: undefined,
      datePrecision: "label",
      dateLabel: "May 9 thru 11",
    });
  });
});
