export function section(title: string): void {
  console.log(`\n${title}`);
}

export function row(label: string, value: unknown): void {
  console.log(`  ${label}: ${value}`);
}

export function table(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) {
    console.log("  none");
    return;
  }
  console.table(rows);
}
