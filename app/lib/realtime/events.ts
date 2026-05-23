export const RITUAL_MENTION_EVENT = "film-goblin:ritual-mention";

export interface RitualMentionEventDetail {
  messageId: string;
  pickId: number;
  actorUsername: string;
  body: string;
}
