import { guildProvider } from "./guild";
import { loftProvider } from "./loft";

export const theaterProviders = [loftProvider, guildProvider] as const;
