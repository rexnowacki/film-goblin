export interface DigestSnapshot {
  films_refreshed: number;
  price_changes: number;
  alerts_fired: number;
  parse_failures: number;
  unavailable_marked: number;
  parse_failure_ids: number[];
  stopped_reason: "complete" | "max_films" | "time_budget";
}

export class Digest {
  private s: DigestSnapshot = {
    films_refreshed: 0,
    price_changes: 0,
    alerts_fired: 0,
    parse_failures: 0,
    unavailable_marked: 0,
    parse_failure_ids: [],
    stopped_reason: "complete",
  };

  filmRefreshed() { this.s.films_refreshed++; }
  priceChanged() { this.s.price_changes++; }
  alertFired() { this.s.alerts_fired++; }
  parseFailure(itunesId: number) {
    this.s.parse_failures++;
    this.s.parse_failure_ids.push(itunesId);
  }
  markedUnavailable() { this.s.unavailable_marked++; }
  stopped(reason: DigestSnapshot["stopped_reason"]) { this.s.stopped_reason = reason; }

  snapshot(): DigestSnapshot { return { ...this.s, parse_failure_ids: [...this.s.parse_failure_ids] }; }

  render(): string {
    const s = this.s;
    const parts = [
      `films_refreshed=${s.films_refreshed}`,
      `price_changes=${s.price_changes}`,
      `alerts_fired=${s.alerts_fired}`,
      `parse_failures=${s.parse_failures}`,
      `unavailable_marked=${s.unavailable_marked}`,
      `stopped_reason=${s.stopped_reason}`,
    ];
    if (s.parse_failure_ids.length > 0) {
      parts.push(`parse_failure_ids=${s.parse_failure_ids.join(",")}`);
    }
    return parts.join(" ");
  }
}
