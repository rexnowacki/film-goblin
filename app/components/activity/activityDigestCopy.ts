export function watchedDigestSummary(count: number) {
  return {
    before: " devoured ",
    countLabel: `${count} ${count === 1 ? "film" : "films"}`,
    after: " in a single day.",
  };
}
