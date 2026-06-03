import { describe, expect, it } from "vitest";
import { parseLoftShowtimes } from "@/lib/theaters/showtimes/parse-loft-showtimes";

const HTML = `
<div class="date-showings">
  <h3><a href="https://loftcinema.org/film/death-becomes-her/">Death Becomes Her</a></h3>
  <div class="date-collection-wrapper">
    <div class="date-collection active" data-date="700101">
      <div class="selectable-date  open-air-cinema" data-sid="630176" data-title="Death Becomes Her" data-date="Fri 6/5 @ 7:45pm" data-tickets="67">
        <div class="date-oval">7:45pm</div><p>Open Air Cinema\t</p>
      </div>
      <div class="selectable-date  screen-4" data-sid="630215" data-title="Death Becomes Her" data-date="Fri 6/5 @ 8:30pm" data-tickets="44">
        <div class="date-oval">8:30pm</div><p>Screen 4\t</p>
      </div>
    </div>
  </div>
</div>
<div class="date-showings">
  <h3><a href="/film/close-encounters/">Close Encounters of the Third Kind in 70mm</a></h3>
  <div class="date-collection-wrapper">
    <div class="date-collection active" data-date="700101">
      <div class="selectable-date  screen-1" data-date="Sat 6/7 @ 2:00pm" data-title="Close Encounters &amp; Friends in 70mm" data-sid="640001" data-tickets="12">
        <div class="date-oval">2:00pm</div><p>Screen 1\t</p>
      </div>
    </div>
  </div>
</div>
`;

describe("parseLoftShowtimes", () => {
  it("extracts one row per selectable-date with sid, title, date, screen, film url", () => {
    const rows = parseLoftShowtimes(HTML);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      sid: "630176",
      title: "Death Becomes Her",
      rawDate: "Fri 6/5 @ 7:45pm",
      screenLabel: "Open Air Cinema",
      filmUrl: "https://loftcinema.org/film/death-becomes-her/",
    });
    expect(rows[1].sid).toBe("630215");
    expect(rows[1].screenLabel).toBe("Screen 4");
  });

  it("associates each showtime with the film url of its enclosing block", () => {
    const rows = parseLoftShowtimes(HTML);
    expect(rows[2].filmUrl).toBe("https://loftcinema.org/film/close-encounters/");
    expect(rows[2].title).toBe("Close Encounters & Friends in 70mm");
  });
});
