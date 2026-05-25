import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function confirm(message: string, yes: boolean): Promise<void> {
  if (yes) return;
  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${message}\nContinue? [y/N] `);
    if (answer.trim().toLowerCase() !== "y") {
      throw new Error("Aborted.");
    }
  } finally {
    rl.close();
  }
}
