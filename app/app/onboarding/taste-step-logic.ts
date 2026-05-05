export interface FlavorCard {
  label: string;
  tagName: string;
  descriptor: string;
}

export const FLAVOR_CARDS: FlavorCard[] = [
  { label: "Folk Rot",       tagName: "folk horror",      descriptor: "ancient dread, pastoral cursed" },
  { label: "Velvet Murder",  tagName: "giallo",           descriptor: "Italian noir, style-soaked kills" },
  { label: "Witchcraft",     tagName: "witchcraft",       descriptor: "covens, hexes, feminine fury" },
  { label: "Flesh Trouble",  tagName: "body horror",      descriptor: "meat gone wrong, transformation" },
  { label: "Star Madness",   tagName: "cosmic horror",    descriptor: "void, ancient entities, small humans" },
  { label: "Holy Terror",    tagName: "religious horror", descriptor: "faith weaponized, god as monster" },
  { label: "Slow Doom",      tagName: "arthouse",         descriptor: "beautiful, bleak, slow-burning dread" },
  { label: "Trash Magic",    tagName: "midnight movie",   descriptor: "low-budget, wild, cult midnight fare" },
];

export function getSelectedTagIds(
  selectedLabels: string[],
  laneTagMap: Record<string, string>,
): string[] {
  return selectedLabels
    .map(label => {
      const card = FLAVOR_CARDS.find(c => c.label === label);
      return card ? laneTagMap[card.tagName] : undefined;
    })
    .filter((id): id is string => id !== undefined);
}
