// Editorial tag pass for FilmGoblin catalog per v2 staff style guide.
// Run from /Users/christophernowacki/film-goblin/db with env sourced from app/.env.local.
//
// For each film:
// - `primary` — primary sub-genre (required, must be type='subgenre')
// - `secondaries` — 0-2 secondary sub-genres (will be placed in tail)
// - `subjects` / `tones` / `themes` / `settings` / `content` — facet picks
// - `order` — full ordered list (Primary first; secondaries at index >= 4)
// - `note` — optional rationale, included in markdown
// - `skip` — if set, film is not tagged (not horror, or insufficient info)

import { Client } from "pg";
import { writeFileSync } from "fs";

interface TagPlan {
  title: string;
  primary?: string;
  secondaries?: string[];
  subjects?: string[];
  tones?: string[];
  themes?: string[];
  settings?: string[];
  content?: string[];
  order?: string[];
  note?: string;
  skip?: string; // reason
}

const PLAN: Record<string, TagPlan> = {
  // ── Horror, well-known ──────────────────────────────────────────────────
  "6832e5f5-88f1-412f-a5b6-9e47fe30c633": {
    title: "A Dark Song",
    primary: "religious horror",
    subjects: ["ritual", "demons"],
    tones: ["slow-burn", "claustrophobic", "atmospheric"],
    themes: ["grief", "isolation"],
    settings: ["rural horror"],
    order: ["religious horror", "grief", "ritual", "slow-burn", "isolation", "claustrophobic", "atmospheric", "demons", "rural horror"],
  },
  "eedde598-3c15-4d04-9f5e-c9e966de43bb": {
    title: "A Girl Walks Home Alone At Night",
    primary: "gothic",
    secondaries: ["erotic horror"],
    subjects: ["vampires"],
    tones: ["dreamlike", "atmospheric", "slow-burn"],
    themes: ["isolation", "queer", "sexuality"],
    settings: ["urban horror"],
    order: ["gothic", "isolation", "dreamlike", "queer", "vampires", "atmospheric", "slow-burn", "sexuality", "urban horror", "erotic horror"],
  },
  "53be3f5e-18a8-47c2-9b72-e8ada585bd2b": {
    title: "Barbarian",
    primary: "psychological horror",
    secondaries: ["splatterpunk"],
    subjects: ["serial killer"],
    tones: ["claustrophobic", "mean-spirited"],
    themes: ["paranoia", "isolation"],
    settings: ["urban horror", "suburban"],
    content: ["gore", "violent"],
    order: ["psychological horror", "paranoia", "claustrophobic", "isolation", "mean-spirited", "serial killer", "urban horror", "suburban", "gore", "violent", "splatterpunk"],
  },
  "7eab7729-6331-4847-9b65-bbc85b7181b5": {
    title: "Beyond the Black Rainbow",
    primary: "psychological horror",
    secondaries: ["techno-horror"],
    tones: ["psychedelic", "dreamlike", "slow-burn"],
    themes: ["isolation", "obsession"],
    settings: ["period setting"],
    order: ["psychological horror", "psychedelic", "dreamlike", "isolation", "slow-burn", "obsession", "period setting", "techno-horror"],
  },
  "56619643-b200-496a-9cba-19699bced356": {
    title: "Black Phone 2",
    primary: "supernatural horror",
    subjects: ["ghosts", "creepy kids", "serial killer"],
    tones: ["bleak", "atmospheric"],
    themes: ["family trauma"],
    settings: ["period setting"],
    order: ["supernatural horror", "family trauma", "ghosts", "bleak", "atmospheric", "creepy kids", "serial killer", "period setting"],
  },
  "6b8b1d93-e45e-43a6-8c7a-7bb1eb9bdb79": {
    title: "Bodies Bodies Bodies",
    primary: "slasher",
    secondaries: ["horror comedy"],
    tones: ["mean-spirited", "funny", "claustrophobic"],
    themes: ["paranoia", "queer", "social class"],
    settings: ["small town"],
    order: ["slasher", "paranoia", "mean-spirited", "queer", "funny", "claustrophobic", "social class", "small town", "horror comedy"],
  },
  "278cfdf3-281f-46f3-b784-1de454a39c6f": {
    title: "Body Parts",
    primary: "body horror",
    subjects: ["cursed object"],
    tones: ["claustrophobic", "atmospheric"],
    themes: ["paranoia", "obsession"],
    content: ["gore"],
    order: ["body horror", "paranoia", "claustrophobic", "obsession", "cursed object", "atmospheric", "gore"],
  },
  "a990fb97-72df-4afc-910a-c0cc6d60cf82": {
    title: "Bone Tomahawk",
    primary: "survival horror",
    secondaries: ["splatterpunk"],
    subjects: ["cult"],
    tones: ["bleak", "slow-burn", "mean-spirited"],
    themes: ["masculinity", "colonialism"],
    settings: ["wilderness", "period setting"],
    content: ["gore", "violent"],
    order: ["survival horror", "bleak", "slow-burn", "masculinity", "mean-spirited", "cult", "wilderness", "period setting", "colonialism", "gore", "violent", "splatterpunk"],
  },
  "1ca05082-4562-4017-a3b1-dddf51a80ce3": {
    title: "Bring Her Back",
    primary: "supernatural horror",
    subjects: ["ritual", "creepy kids"],
    tones: ["bleak", "fever dream"],
    themes: ["grief", "family trauma"],
    content: ["gore", "violent"],
    order: ["supernatural horror", "grief", "bleak", "family trauma", "fever dream", "ritual", "creepy kids", "gore", "violent"],
  },
  "27cf8869-4033-414b-aed1-17295bc68572": {
    title: "Candyman (1992)",
    primary: "supernatural horror",
    secondaries: ["slasher"],
    subjects: ["ghosts", "cursed place"],
    tones: ["atmospheric", "bleak"],
    themes: ["race", "social class", "obsession"],
    settings: ["urban horror"],
    content: ["gore"],
    order: ["supernatural horror", "race", "atmospheric", "obsession", "bleak", "ghosts", "cursed place", "social class", "urban horror", "gore", "slasher"],
  },
  "499af346-9008-47b5-8457-759d78151f3d": {
    title: "Color Out of Space",
    primary: "cosmic horror",
    secondaries: ["body horror"],
    subjects: ["aliens"],
    tones: ["psychedelic", "fever dream"],
    themes: ["family trauma"],
    settings: ["rural horror", "wilderness"],
    content: ["gore"],
    order: ["cosmic horror", "psychedelic", "family trauma", "fever dream", "aliens", "rural horror", "wilderness", "gore", "body horror"],
  },
  "50cc90f5-6729-4a9d-a933-c1b91413a3ad": {
    title: "Cuckoo",
    primary: "creature feature",
    secondaries: ["body horror"],
    tones: ["dreamlike", "atmospheric"],
    themes: ["family trauma", "motherhood"],
    settings: ["wilderness"],
    order: ["creature feature", "family trauma", "dreamlike", "motherhood", "atmospheric", "wilderness", "body horror"],
  },
  "81caaa5c-7eaf-4190-b00f-7f51b7e0f6f5": {
    title: "Cure",
    primary: "thriller",
    subjects: ["serial killer", "possession"],
    tones: ["slow-burn", "atmospheric", "bleak"],
    themes: ["paranoia", "obsession"],
    settings: ["urban horror"],
    note: "Thriller as Primary — horror-adjacent: true. Kurosawa's hypnosis-driven serial killer Kafkaesque.",
    order: ["thriller", "paranoia", "slow-burn", "atmospheric", "obsession", "serial killer", "possession", "bleak", "urban horror"],
  },
  "b5fbfb7f-4050-4508-b9ad-a93b8321b8f4": {
    title: "Daguerrotype",
    primary: "supernatural horror",
    secondaries: ["gothic"],
    subjects: ["ghosts", "cursed object"],
    tones: ["atmospheric", "slow-burn", "dreamlike"],
    themes: ["obsession", "grief"],
    order: ["supernatural horror", "obsession", "atmospheric", "slow-burn", "ghosts", "dreamlike", "grief", "cursed object", "gothic"],
  },
  "d46f9837-6aea-49a2-a1e1-3133c35f9c63": {
    title: "Deep Red",
    primary: "giallo",
    subjects: ["serial killer"],
    tones: ["psychedelic", "atmospheric", "mean-spirited"],
    themes: ["paranoia"],
    settings: ["urban horror"],
    content: ["gore", "violent"],
    order: ["giallo", "serial killer", "paranoia", "psychedelic", "atmospheric", "mean-spirited", "urban horror", "gore", "violent"],
  },
  "b7ad7369-07d6-41f5-8237-a51fbe439639": {
    title: "Don't Breathe",
    primary: "home invasion",
    secondaries: ["thriller"],
    tones: ["claustrophobic", "mean-spirited"],
    themes: ["social class"],
    settings: ["urban horror"],
    content: ["violent"],
    order: ["home invasion", "claustrophobic", "mean-spirited", "social class", "urban horror", "violent", "thriller"],
  },
  "1998daef-35e6-4593-94ca-96784f75bd21": {
    title: "Drag Me to Hell (Unrated)",
    primary: "supernatural horror",
    secondaries: ["horror comedy"],
    subjects: ["demons", "cursed object"],
    tones: ["funny", "campy"],
    themes: ["social class"],
    content: ["gore"],
    order: ["supernatural horror", "demons", "funny", "campy", "cursed object", "social class", "gore", "horror comedy"],
  },
  "f36b955c-0ada-462a-a240-91bdf34e6982": {
    title: "Ex Machina",
    primary: "techno-horror",
    secondaries: ["thriller"],
    tones: ["claustrophobic", "slow-burn", "atmospheric"],
    themes: ["technology", "isolation", "obsession"],
    settings: ["wilderness"],
    note: "Techno-horror as Primary — sci-fi thriller w/ horror-of-the-mind core. Director-as-creator hubris reads as horror premise.",
    order: ["techno-horror", "technology", "claustrophobic", "isolation", "slow-burn", "obsession", "atmospheric", "wilderness", "thriller"],
  },
  "d5b39906-7d7d-4edd-bbce-b8980a37439c": {
    title: "Eyes Without a Face",
    primary: "body horror",
    secondaries: ["gothic"],
    tones: ["dreamlike", "atmospheric", "slow-burn"],
    themes: ["family trauma", "obsession", "body autonomy"],
    settings: ["period setting"],
    order: ["body horror", "obsession", "dreamlike", "family trauma", "atmospheric", "slow-burn", "body autonomy", "period setting", "gothic"],
  },
  "1baefc76-a4ab-434d-89b0-7e80c597ca0f": {
    title: "Fright Night",
    primary: "slasher",
    secondaries: ["horror comedy"],
    subjects: ["vampires"],
    tones: ["funny", "campy", "nostalgic"],
    settings: ["suburban"],
    order: ["slasher", "vampires", "funny", "campy", "nostalgic", "suburban", "horror comedy"],
  },
  "2ace9173-5a1c-44cf-8f3f-57bf4d453f3f": {
    title: "Gamera vs. Gyaos",
    primary: "creature feature",
    secondaries: ["monster movie"],
    subjects: ["kaiju"],
    tones: ["campy", "nostalgic"],
    settings: ["period setting"],
    order: ["creature feature", "kaiju", "campy", "nostalgic", "period setting", "monster movie"],
  },
  "3ab7ae44-c99b-49e7-a060-6e2440d12c6e": {
    title: "George A. Romero's Night of the Living Dead (1968)",
    primary: "survival horror",
    secondaries: ["splatterpunk"],
    subjects: ["zombies"],
    tones: ["bleak", "claustrophobic", "atmospheric"],
    themes: ["race", "paranoia"],
    settings: ["rural horror"],
    content: ["gore"],
    order: ["survival horror", "zombies", "bleak", "race", "claustrophobic", "paranoia", "atmospheric", "rural horror", "gore", "splatterpunk"],
  },
  "d67901d8-9883-415d-9868-3f7f3d50d0fd": {
    title: "Green Room",
    primary: "survival horror",
    secondaries: ["thriller"],
    tones: ["claustrophobic", "mean-spirited", "bleak"],
    themes: ["social class"],
    settings: ["wilderness"],
    content: ["gore", "violent"],
    order: ["survival horror", "claustrophobic", "mean-spirited", "bleak", "social class", "wilderness", "gore", "violent", "thriller"],
  },
  "6d5fe129-4c04-46ff-8ed4-08041cc7c789": {
    title: "Hellraiser",
    primary: "body horror",
    secondaries: ["splatterpunk"],
    subjects: ["demons", "cursed object"],
    tones: ["bleak", "atmospheric"],
    themes: ["sexuality", "obsession"],
    content: ["gore", "splatter", "sexual content"],
    order: ["body horror", "demons", "sexuality", "cursed object", "bleak", "obsession", "atmospheric", "gore", "splatter", "sexual content", "splatterpunk"],
  },
  "0c3d195b-509a-4fa3-9132-776838adc03a": {
    title: "Hellbound: Hellraiser II",
    primary: "body horror",
    secondaries: ["splatterpunk"],
    subjects: ["demons"],
    tones: ["fever dream", "bleak"],
    themes: ["sexuality"],
    content: ["gore", "splatter"],
    order: ["body horror", "demons", "fever dream", "bleak", "sexuality", "gore", "splatter", "splatterpunk"],
  },
  "cd90324f-1f0b-40a5-ab73-4ff0daf692f8": {
    title: "Hellraiser III: Hell On Earth",
    primary: "splatterpunk",
    subjects: ["demons"],
    tones: ["campy"],
    settings: ["urban horror"],
    content: ["gore", "splatter"],
    order: ["splatterpunk", "demons", "campy", "urban horror", "gore", "splatter"],
  },
  "b0b88385-6686-44d3-bddb-e4c400453493": {
    title: "Henry: Portrait of a Serial Killer",
    primary: "exploitation",
    subjects: ["serial killer"],
    tones: ["bleak", "mean-spirited", "nihilistic"],
    themes: ["masculinity"],
    settings: ["urban horror"],
    content: ["gore", "violent"],
    order: ["exploitation", "serial killer", "bleak", "mean-spirited", "nihilistic", "masculinity", "urban horror", "gore", "violent"],
  },
  "7023a50c-384c-473a-a164-ca5b253e3163": {
    title: "Hereditary",
    primary: "supernatural horror",
    secondaries: ["religious horror"],
    subjects: ["cult", "demons"],
    tones: ["bleak", "fever dream", "atmospheric"],
    themes: ["family trauma", "grief", "religion"],
    settings: ["suburban"],
    order: ["supernatural horror", "family trauma", "grief", "bleak", "fever dream", "religion", "atmospheric", "cult", "demons", "suburban", "religious horror"],
  },
  "bfbb8c0c-5a0b-4f4e-aa7c-f03030ce4eb4": {
    title: "In Fabric",
    primary: "cursed media",
    subjects: ["cursed object"],
    tones: ["surreal", "psychedelic", "dreamlike"],
    themes: ["social class", "sexuality"],
    content: ["sexual content"],
    order: ["cursed media", "cursed object", "surreal", "social class", "psychedelic", "dreamlike", "sexuality", "sexual content"],
  },
  "84801125-468a-4e6e-b8ca-11845283dffa": {
    title: "Inferno",
    primary: "giallo",
    subjects: ["witches"],
    tones: ["psychedelic", "dreamlike", "atmospheric"],
    settings: ["urban horror"],
    order: ["giallo", "psychedelic", "witches", "dreamlike", "atmospheric", "urban horror"],
  },
  "737af26b-0b8a-45dc-bb41-49c13f6833e9": {
    title: "Invasion of the Body Snatchers (1978)",
    primary: "body horror",
    secondaries: ["cosmic horror"],
    subjects: ["aliens"],
    tones: ["bleak", "claustrophobic", "atmospheric"],
    themes: ["paranoia", "isolation"],
    settings: ["urban horror"],
    order: ["body horror", "paranoia", "aliens", "bleak", "claustrophobic", "isolation", "atmospheric", "urban horror", "cosmic horror"],
  },
  "44b12d35-2257-4eb9-aefc-dd1fa62bc8f1": {
    title: "Invasion of the Body Snatchers (1956)",
    primary: "body horror",
    secondaries: ["cosmic horror"],
    subjects: ["aliens"],
    tones: ["bleak", "atmospheric"],
    themes: ["paranoia", "conspiracy"],
    settings: ["small town", "period setting"],
    order: ["body horror", "paranoia", "aliens", "bleak", "atmospheric", "conspiracy", "small town", "period setting", "cosmic horror"],
  },
  "7c1b5b23-bdeb-403b-80b8-1ce1319b4815": {
    title: "It Comes At Night",
    primary: "survival horror",
    secondaries: ["psychological horror"],
    tones: ["bleak", "claustrophobic", "slow-burn"],
    themes: ["paranoia", "family trauma", "isolation"],
    settings: ["wilderness"],
    order: ["survival horror", "paranoia", "bleak", "family trauma", "claustrophobic", "isolation", "slow-burn", "wilderness", "psychological horror"],
  },
  "b5f013ef-61a5-483e-90cc-41b17470ea34": {
    title: "Jeepers Creepers",
    primary: "creature feature",
    tones: ["mean-spirited", "atmospheric"],
    settings: ["rural horror"],
    content: ["violent"],
    order: ["creature feature", "mean-spirited", "atmospheric", "rural horror", "violent"],
  },
  "227b368a-43bd-4fbd-908f-38c9c3ef0121": {
    title: "Jeepers Creepers 2",
    primary: "creature feature",
    tones: ["mean-spirited", "claustrophobic"],
    settings: ["rural horror"],
    content: ["violent"],
    order: ["creature feature", "mean-spirited", "claustrophobic", "rural horror", "violent"],
  },
  "8b29d958-7258-43b3-897c-c6321cc9ec46": {
    title: "Jennifer's Body (Unrated)",
    primary: "horror comedy",
    secondaries: ["supernatural horror"],
    subjects: ["demons"],
    tones: ["funny", "campy"],
    themes: ["queer", "sexuality", "coming-of-age"],
    settings: ["small town"],
    content: ["gore"],
    order: ["horror comedy", "queer", "demons", "funny", "sexuality", "campy", "coming-of-age", "small town", "gore", "supernatural horror"],
  },
  "9d004484-1edf-4db1-be7b-ef15ffabddeb": {
    title: "Kuroneko",
    primary: "folk horror",
    secondaries: ["gothic"],
    subjects: ["ghosts", "ritual"],
    tones: ["dreamlike", "atmospheric", "slow-burn"],
    themes: ["revenge", "motherhood"],
    settings: ["period setting", "rural horror"],
    order: ["folk horror", "revenge", "ghosts", "dreamlike", "motherhood", "atmospheric", "slow-burn", "ritual", "period setting", "rural horror", "gothic"],
  },
  "a5c0e869-f904-4ad7-a6b1-17eaf9f985ec": {
    title: "Late Night with the Devil",
    primary: "supernatural horror",
    secondaries: ["found footage"],
    subjects: ["demons", "possession"],
    tones: ["nostalgic", "atmospheric"],
    themes: ["obsession"],
    settings: ["period setting"],
    order: ["supernatural horror", "demons", "nostalgic", "possession", "obsession", "atmospheric", "period setting", "found footage"],
  },
  "acdb08a5-17f2-43a4-8d18-a8dce143783b": {
    title: "Longlegs",
    primary: "thriller",
    subjects: ["serial killer", "demons", "cursed object"],
    tones: ["fever dream", "atmospheric", "dreamlike"],
    themes: ["family trauma", "religion"],
    settings: ["period setting"],
    note: "Thriller-as-Primary — horror-adjacent: true. Procedural with occult overlay.",
    order: ["thriller", "serial killer", "fever dream", "atmospheric", "family trauma", "dreamlike", "religion", "demons", "cursed object", "period setting"],
  },
  "0a639c74-1e45-4f51-b4ce-b5c4ceab0628": {
    title: "Mandy",
    primary: "exploitation",
    secondaries: ["psychological horror"],
    subjects: ["cult"],
    tones: ["psychedelic", "fever dream", "mean-spirited"],
    themes: ["revenge", "religion"],
    settings: ["wilderness", "period setting"],
    content: ["gore", "violent"],
    order: ["exploitation", "psychedelic", "revenge", "fever dream", "cult", "mean-spirited", "religion", "wilderness", "period setting", "gore", "violent", "psychological horror"],
  },
  "7c56a7de-9adf-40b0-b512-9bc9b6a545c8": {
    title: "Martyrs (Subtitled)",
    primary: "extreme horror",
    secondaries: ["religious horror"],
    subjects: ["cult", "ritual"],
    tones: ["bleak", "nihilistic", "mean-spirited"],
    themes: ["religion", "body autonomy"],
    content: ["gore", "violent"],
    order: ["extreme horror", "bleak", "nihilistic", "religion", "mean-spirited", "cult", "body autonomy", "ritual", "gore", "violent", "religious horror"],
  },
  "90720087-2b7f-40d2-a2ba-4259e5cbe954": {
    title: "Midsommar",
    primary: "folk horror",
    subjects: ["cult", "ritual"],
    tones: ["dreamlike", "bleak", "psychedelic"],
    themes: ["grief", "relationship horror", "breakup horror"],
    settings: ["rural horror", "period setting"],
    content: ["gore"],
    order: ["folk horror", "breakup horror", "grief", "dreamlike", "relationship horror", "cult", "bleak", "psychedelic", "ritual", "rural horror", "period setting", "gore"],
  },
  "ac6c3f97-0591-44e5-8e7f-1ba1d772c688": {
    title: "Mother of Tears: The Third Mother",
    primary: "supernatural horror",
    secondaries: ["giallo"],
    subjects: ["witches", "coven"],
    tones: ["psychedelic", "atmospheric"],
    settings: ["urban horror"],
    content: ["gore", "violent"],
    order: ["supernatural horror", "witches", "coven", "psychedelic", "atmospheric", "urban horror", "gore", "violent", "giallo"],
  },
  "1318bf7f-6784-4309-8448-77e62d87274b": {
    title: "Night of the Creeps",
    primary: "horror comedy",
    secondaries: ["creature feature"],
    subjects: ["zombies", "aliens"],
    tones: ["funny", "campy", "nostalgic"],
    settings: ["suburban"],
    order: ["horror comedy", "funny", "zombies", "campy", "aliens", "nostalgic", "suburban", "creature feature"],
  },
  "a0237517-dcc5-4144-9cc2-26fd8582916b": {
    title: "Nightmare On Elm Street Uncut (1984)",
    primary: "slasher",
    secondaries: ["supernatural horror"],
    subjects: ["serial killer"],
    tones: ["dreamlike", "fever dream", "nostalgic"],
    settings: ["suburban"],
    content: ["gore"],
    order: ["slasher", "dreamlike", "serial killer", "fever dream", "nostalgic", "suburban", "gore", "supernatural horror"],
  },
  "ff01dfd8-28c7-488f-90a1-296aad897291": {
    title: "Nosferatu (2024)",
    primary: "gothic",
    subjects: ["vampires"],
    tones: ["fever dream", "atmospheric", "dreamlike"],
    themes: ["obsession", "sexuality"],
    settings: ["period setting"],
    order: ["gothic", "obsession", "fever dream", "sexuality", "vampires", "atmospheric", "dreamlike", "period setting"],
  },
  "f525a104-1fc6-44c3-9c19-a2d1ce91d039": {
    title: "Onibaba",
    primary: "folk horror",
    subjects: ["ritual"],
    tones: ["bleak", "atmospheric", "claustrophobic"],
    themes: ["sexuality", "motherhood"],
    settings: ["period setting", "wilderness"],
    content: ["sexual content"],
    order: ["folk horror", "bleak", "sexuality", "atmospheric", "motherhood", "claustrophobic", "ritual", "period setting", "wilderness", "sexual content"],
  },
  "1472cd5a-9b2b-4b68-a673-8aa4caebd864": {
    title: "PG: Psycho Goreman",
    primary: "horror comedy",
    secondaries: ["splatterpunk"],
    subjects: ["aliens", "creepy kids"],
    tones: ["funny", "campy", "midnight movie"],
    settings: ["suburban"],
    content: ["gore", "splatter"],
    order: ["horror comedy", "funny", "creepy kids", "campy", "aliens", "midnight movie", "suburban", "gore", "splatter", "splatterpunk"],
  },
  "b2f70eae-3bbc-4257-9a45-78b38ae8b698": {
    title: "Picnic at Hanging Rock",
    primary: "folk horror",
    secondaries: ["psychological horror"],
    tones: ["dreamlike", "atmospheric", "slow-burn"],
    themes: ["coming-of-age", "sexuality", "colonialism"],
    settings: ["wilderness", "period setting"],
    order: ["folk horror", "dreamlike", "coming-of-age", "atmospheric", "sexuality", "slow-burn", "colonialism", "wilderness", "period setting", "psychological horror"],
  },
  "2db89719-f902-4b00-9a55-af92902382ff": {
    title: "Possession",
    primary: "psychological horror",
    secondaries: ["body horror"],
    subjects: ["demons", "possession"],
    tones: ["surreal", "fever dream", "mean-spirited"],
    themes: ["relationship horror", "breakup horror", "obsession"],
    settings: ["urban horror"],
    content: ["gore", "violent"],
    order: ["psychological horror", "breakup horror", "surreal", "relationship horror", "fever dream", "obsession", "mean-spirited", "demons", "possession", "urban horror", "gore", "violent", "body horror"],
  },
  "6c2676c3-c95d-461d-ab6a-ac05b18eff66": {
    title: "Pyewacket",
    primary: "folk horror",
    secondaries: ["religious horror"],
    subjects: ["ritual", "demons"],
    tones: ["atmospheric", "bleak"],
    themes: ["family trauma", "coming-of-age"],
    settings: ["rural horror", "wilderness"],
    order: ["folk horror", "family trauma", "atmospheric", "coming-of-age", "ritual", "bleak", "demons", "rural horror", "wilderness", "religious horror"],
  },
  "4986fbdb-b83e-4e21-b915-3b44ad137b14": {
    title: "Ravenous",
    primary: "folk horror",
    secondaries: ["horror comedy"],
    tones: ["mean-spirited", "atmospheric", "campy"],
    themes: ["colonialism", "masculinity"],
    settings: ["wilderness", "period setting"],
    content: ["gore", "violent"],
    order: ["folk horror", "colonialism", "mean-spirited", "atmospheric", "masculinity", "campy", "wilderness", "period setting", "gore", "violent", "horror comedy"],
  },
  "66bc2294-e911-404a-a584-d70cdc8d6cc1": {
    title: "Red Rooms",
    primary: "thriller",
    subjects: ["serial killer"],
    tones: ["bleak", "slow-burn", "atmospheric"],
    themes: ["obsession", "technology"],
    settings: ["urban horror"],
    note: "Thriller-as-Primary, horror-adjacent: true. Dark-web obsession procedural.",
    order: ["thriller", "obsession", "bleak", "slow-burn", "serial killer", "atmospheric", "technology", "urban horror"],
  },
  "941745a3-24fe-4fc2-aeed-46b0df7afc55": {
    title: "Ringu",
    primary: "cursed media",
    secondaries: ["supernatural horror"],
    subjects: ["ghosts", "cursed object"],
    tones: ["atmospheric", "slow-burn", "bleak"],
    themes: ["motherhood", "technology"],
    order: ["cursed media", "ghosts", "atmospheric", "slow-burn", "motherhood", "cursed object", "bleak", "technology", "supernatural horror"],
  },
  "7f0ee278-1da0-4235-99b5-37a92d9d26f3": {
    title: "Ringu Spiral",
    primary: "cursed media",
    secondaries: ["supernatural horror"],
    subjects: ["ghosts", "cursed object"],
    tones: ["atmospheric", "slow-burn"],
    themes: ["obsession"],
    order: ["cursed media", "ghosts", "atmospheric", "obsession", "slow-burn", "cursed object", "supernatural horror"],
  },
  "95c96fdb-7cb2-4a22-8976-8ef39e6a1a8d": {
    title: "The Ring",
    primary: "cursed media",
    secondaries: ["supernatural horror"],
    subjects: ["ghosts", "cursed object", "creepy kids"],
    tones: ["atmospheric", "bleak"],
    themes: ["motherhood", "technology"],
    order: ["cursed media", "ghosts", "atmospheric", "motherhood", "creepy kids", "bleak", "cursed object", "technology", "supernatural horror"],
  },
  "c8031204-b37a-4818-a109-6332d183cbf4": {
    title: "Saint Maud",
    primary: "religious horror",
    secondaries: ["psychological horror"],
    tones: ["bleak", "atmospheric", "fever dream"],
    themes: ["religion", "isolation", "obsession"],
    settings: ["small town"],
    order: ["religious horror", "religion", "bleak", "isolation", "atmospheric", "obsession", "fever dream", "small town", "psychological horror"],
  },
  "fff6445d-1d4d-4261-8c67-fd5a6e28876f": {
    title: "Santa Sangre",
    primary: "exploitation",
    secondaries: ["gothic"],
    subjects: ["serial killer", "cult"],
    tones: ["surreal", "psychedelic", "fever dream"],
    themes: ["motherhood", "religion", "obsession"],
    content: ["gore", "violent", "sexual content"],
    order: ["exploitation", "surreal", "motherhood", "psychedelic", "religion", "fever dream", "obsession", "serial killer", "cult", "gore", "violent", "sexual content", "gothic"],
  },
  "5f9f0082-39b8-4688-8e95-9b12ad93a1e9": {
    title: "Scream",
    primary: "slasher",
    secondaries: ["horror comedy"],
    subjects: ["serial killer"],
    tones: ["funny", "nostalgic"],
    themes: ["paranoia"],
    settings: ["small town"],
    content: ["gore"],
    order: ["slasher", "serial killer", "funny", "paranoia", "nostalgic", "small town", "gore", "horror comedy"],
  },
  "d08d9b27-7db5-4e32-acfc-5a8c5dc6ac1f": {
    title: "Shin Godzilla",
    primary: "monster movie",
    secondaries: ["creature feature"],
    subjects: ["kaiju"],
    tones: ["bleak", "atmospheric"],
    themes: ["conspiracy", "technology"],
    settings: ["urban horror"],
    order: ["monster movie", "kaiju", "bleak", "conspiracy", "atmospheric", "technology", "urban horror", "creature feature"],
  },
  "7fceea01-8b7d-4b76-902f-287103e7b656": {
    title: "Sleepaway Camp",
    primary: "slasher",
    subjects: ["serial killer", "creepy kids"],
    tones: ["nostalgic", "campy"],
    themes: ["coming-of-age", "queer"],
    settings: ["wilderness"],
    content: ["gore"],
    order: ["slasher", "creepy kids", "nostalgic", "coming-of-age", "campy", "queer", "serial killer", "wilderness", "gore"],
  },
  "1d493307-c6fe-4473-a1e6-9ffa8a5f8d4c": {
    title: "Speak No Evil (2024)",
    primary: "psychological horror",
    secondaries: ["home invasion"],
    tones: ["mean-spirited", "slow-burn", "claustrophobic"],
    themes: ["family trauma", "paranoia"],
    settings: ["rural horror"],
    content: ["violent"],
    order: ["psychological horror", "family trauma", "mean-spirited", "paranoia", "slow-burn", "claustrophobic", "rural horror", "violent", "home invasion"],
  },
  "95ffaeae-1e2d-4a14-822e-39e4589cdbcc": {
    title: "Split (2017)",
    primary: "thriller",
    secondaries: ["psychological horror"],
    subjects: ["serial killer"],
    tones: ["claustrophobic", "atmospheric"],
    themes: ["family trauma"],
    note: "Thriller-as-Primary, horror-adjacent: true.",
    order: ["thriller", "serial killer", "claustrophobic", "family trauma", "atmospheric", "psychological horror"],
  },
  "c597879b-fca7-4b29-881e-2dcf8cd4f569": {
    title: "Starve Acre",
    primary: "folk horror",
    subjects: ["ritual"],
    tones: ["bleak", "atmospheric", "slow-burn"],
    themes: ["grief", "family trauma", "motherhood"],
    settings: ["rural horror", "period setting"],
    order: ["folk horror", "grief", "family trauma", "bleak", "atmospheric", "motherhood", "slow-burn", "ritual", "rural horror", "period setting"],
  },
  "d96604d0-742f-4288-93f4-98a0b96f51a6": {
    title: "Stephen King's Silver Bullet",
    primary: "creature feature",
    subjects: ["werewolves"],
    tones: ["nostalgic", "atmospheric"],
    themes: ["coming-of-age"],
    settings: ["small town", "period setting"],
    content: ["gore"],
    order: ["creature feature", "werewolves", "nostalgic", "coming-of-age", "atmospheric", "small town", "period setting", "gore"],
  },
  "aaf56da2-8447-4591-8f14-e41ada5d3ffd": {
    title: "Suicide Club",
    primary: "exploitation",
    secondaries: ["psychological horror"],
    subjects: ["cult"],
    tones: ["surreal", "mean-spirited", "nihilistic"],
    themes: ["technology", "conspiracy", "coming-of-age"],
    settings: ["urban horror"],
    content: ["gore", "violent"],
    order: ["exploitation", "surreal", "technology", "mean-spirited", "cult", "nihilistic", "conspiracy", "coming-of-age", "urban horror", "gore", "violent", "psychological horror"],
  },
  "085310be-0df5-4666-ac66-78a20b4ea574": {
    title: "Suspiria (2018)",
    primary: "supernatural horror",
    secondaries: ["body horror"],
    subjects: ["coven", "witches"],
    tones: ["fever dream", "atmospheric", "dreamlike"],
    themes: ["motherhood", "religion"],
    settings: ["period setting"],
    content: ["gore"],
    order: ["supernatural horror", "motherhood", "fever dream", "coven", "atmospheric", "witches", "dreamlike", "religion", "period setting", "gore", "body horror"],
  },
  "f5d09288-b876-4788-b043-e662913c774e": {
    title: "The Babadook",
    primary: "supernatural horror",
    secondaries: ["psychological horror"],
    subjects: ["demons", "creepy kids"],
    tones: ["bleak", "claustrophobic", "atmospheric"],
    themes: ["grief", "motherhood", "family trauma"],
    settings: ["suburban"],
    order: ["supernatural horror", "grief", "motherhood", "bleak", "family trauma", "claustrophobic", "demons", "atmospheric", "creepy kids", "suburban", "psychological horror"],
  },
  "1d65a498-52fc-464e-a67d-10770d4bb31b": {
    title: "The Black Phone",
    primary: "supernatural horror",
    secondaries: ["thriller"],
    subjects: ["ghosts", "creepy kids", "serial killer"],
    tones: ["nostalgic", "claustrophobic"],
    themes: ["family trauma", "coming-of-age"],
    settings: ["suburban", "period setting"],
    content: ["violent"],
    order: ["supernatural horror", "ghosts", "nostalgic", "family trauma", "claustrophobic", "coming-of-age", "creepy kids", "serial killer", "suburban", "period setting", "violent", "thriller"],
  },
  "cffe9986-85a2-49f5-9c8c-52760eb2518f": {
    title: "The Blair Witch Project",
    primary: "found footage",
    secondaries: ["folk horror"],
    subjects: ["witches"],
    tones: ["claustrophobic", "atmospheric", "bleak"],
    themes: ["isolation", "paranoia"],
    settings: ["wilderness", "rural horror"],
    order: ["found footage", "witches", "claustrophobic", "isolation", "atmospheric", "paranoia", "bleak", "wilderness", "rural horror", "folk horror"],
  },
  "f719a8c5-49fd-48a0-9c79-63bd011c2899": {
    title: "The Body Snatcher",
    primary: "gothic",
    tones: ["atmospheric", "bleak"],
    themes: ["obsession"],
    settings: ["period setting", "urban horror"],
    order: ["gothic", "atmospheric", "obsession", "bleak", "period setting", "urban horror"],
  },
  "8d09c0b6-108b-4f92-858f-74cfce2e1ca5": {
    title: "The 'Burbs",
    primary: "horror comedy",
    secondaries: ["psychological horror"],
    tones: ["funny", "campy", "nostalgic"],
    themes: ["paranoia", "conspiracy"],
    settings: ["suburban"],
    order: ["horror comedy", "funny", "paranoia", "campy", "conspiracy", "nostalgic", "suburban", "psychological horror"],
  },
  "d3cd7655-737e-47c9-a31c-083feab4ad28": {
    title: "The Cabin In the Woods",
    primary: "horror comedy",
    secondaries: ["creature feature"],
    subjects: ["zombies", "demons", "cult"],
    tones: ["funny", "campy"],
    themes: ["conspiracy", "religion"],
    settings: ["wilderness"],
    content: ["gore"],
    order: ["horror comedy", "funny", "conspiracy", "campy", "zombies", "religion", "demons", "cult", "wilderness", "gore", "creature feature"],
  },
  "5d2a408c-4714-4304-a516-526583eeb640": {
    title: "The Craft",
    primary: "supernatural horror",
    subjects: ["witches", "coven"],
    tones: ["midnight movie", "nostalgic"],
    themes: ["coming-of-age", "queer"],
    settings: ["suburban"],
    order: ["supernatural horror", "coming-of-age", "witches", "midnight movie", "coven", "nostalgic", "queer", "suburban"],
  },
  "d3233eab-b9e8-47c8-974f-ce0e10f8dc9c": {
    title: "The Curse of La Llorona",
    primary: "supernatural horror",
    subjects: ["ghosts", "creepy kids"],
    tones: ["atmospheric"],
    themes: ["motherhood", "family trauma"],
    settings: ["urban horror"],
    order: ["supernatural horror", "ghosts", "motherhood", "family trauma", "atmospheric", "creepy kids", "urban horror"],
  },
  "16d87173-d7be-48c3-9041-34f145905d39": {
    title: "The Dunwich Horror (1970)",
    primary: "cosmic horror",
    secondaries: ["folk horror"],
    subjects: ["ritual", "cursed place"],
    tones: ["psychedelic", "atmospheric"],
    themes: ["religion"],
    settings: ["rural horror", "period setting"],
    order: ["cosmic horror", "psychedelic", "ritual", "atmospheric", "religion", "cursed place", "rural horror", "period setting", "folk horror"],
  },
  "91d36a97-72ef-4cf9-ab5e-be67eca6eedd": {
    title: "The Empty Man",
    primary: "cosmic horror",
    secondaries: ["folk horror"],
    subjects: ["cult", "ritual"],
    tones: ["bleak", "slow-burn", "atmospheric"],
    themes: ["paranoia", "isolation"],
    settings: ["urban horror"],
    order: ["cosmic horror", "cult", "bleak", "paranoia", "slow-burn", "isolation", "atmospheric", "ritual", "urban horror", "folk horror"],
  },
  "245029da-5922-4413-81d1-b9cd20e71bc3": {
    title: "The Faculty",
    primary: "creature feature",
    secondaries: ["horror comedy"],
    subjects: ["aliens"],
    tones: ["funny", "nostalgic"],
    themes: ["paranoia", "coming-of-age"],
    settings: ["small town"],
    content: ["gore"],
    order: ["creature feature", "aliens", "funny", "paranoia", "nostalgic", "coming-of-age", "small town", "gore", "horror comedy"],
  },
  "84230ef4-84c6-490b-93f8-977e32918951": {
    title: "The Last House on the Left (2009)",
    primary: "exploitation",
    secondaries: ["home invasion"],
    tones: ["mean-spirited", "bleak", "nihilistic"],
    themes: ["revenge", "family trauma"],
    settings: ["rural horror"],
    content: ["gore", "violent", "sexual content"],
    order: ["exploitation", "revenge", "mean-spirited", "family trauma", "bleak", "nihilistic", "rural horror", "gore", "violent", "sexual content", "home invasion"],
  },
  "bc712b77-69fc-4119-8cee-ac6b7495f34b": {
    title: "The Lighthouse (2019)",
    primary: "psychological horror",
    secondaries: ["folk horror"],
    tones: ["fever dream", "claustrophobic", "mean-spirited"],
    themes: ["isolation", "masculinity"],
    settings: ["wilderness", "period setting"],
    order: ["psychological horror", "isolation", "fever dream", "masculinity", "claustrophobic", "mean-spirited", "wilderness", "period setting", "folk horror"],
  },
  "835efa6b-3857-4e00-a517-38a9e065544e": {
    title: "The Lost Boys",
    primary: "horror comedy",
    secondaries: ["creature feature"],
    subjects: ["vampires"],
    tones: ["funny", "campy", "nostalgic"],
    themes: ["coming-of-age"],
    settings: ["small town"],
    order: ["horror comedy", "vampires", "funny", "coming-of-age", "campy", "nostalgic", "small town", "creature feature"],
  },
  "21be4a0e-5b80-42e6-8475-a84db02773d1": {
    title: "The Love Witch",
    primary: "gothic",
    secondaries: ["horror comedy"],
    subjects: ["witches"],
    tones: ["campy", "dreamlike", "nostalgic"],
    themes: ["sexuality", "obsession"],
    order: ["gothic", "witches", "campy", "sexuality", "dreamlike", "obsession", "nostalgic", "horror comedy"],
  },
  "30112351-d5b8-429b-8bea-bd3ad1fb6eb8": {
    title: "The Loved Ones (Unrated)",
    primary: "exploitation",
    secondaries: ["splatterpunk"],
    tones: ["mean-spirited", "campy"],
    themes: ["coming-of-age", "obsession"],
    content: ["gore", "violent"],
    order: ["exploitation", "mean-spirited", "obsession", "campy", "coming-of-age", "gore", "violent", "splatterpunk"],
  },
  "fadaa368-1e58-41e1-abf9-378cba3137e6": {
    title: "The Substance",
    primary: "body horror",
    secondaries: ["splatterpunk"],
    tones: ["fever dream", "mean-spirited"],
    themes: ["body autonomy", "obsession"],
    content: ["gore", "splatter", "sexual content"],
    order: ["body horror", "body autonomy", "fever dream", "obsession", "mean-spirited", "gore", "splatter", "sexual content", "splatterpunk"],
  },
  "243e183c-1417-468c-9704-a024aad93402": {
    title: "The Texas Chain Saw Massacre",
    primary: "exploitation",
    secondaries: ["slasher"],
    subjects: ["serial killer"],
    tones: ["bleak", "mean-spirited", "nihilistic"],
    themes: ["family trauma"],
    settings: ["rural horror"],
    content: ["gore", "violent"],
    order: ["exploitation", "serial killer", "bleak", "family trauma", "mean-spirited", "nihilistic", "rural horror", "gore", "violent", "slasher"],
  },
  "5375a021-09c7-421f-9186-a040fc4f0b05": {
    title: "The Thing",
    primary: "body horror",
    subjects: ["aliens"],
    tones: ["claustrophobic", "bleak", "atmospheric"],
    themes: ["paranoia", "isolation"],
    settings: ["wilderness"],
    content: ["gore"],
    order: ["body horror", "paranoia", "claustrophobic", "isolation", "bleak", "aliens", "atmospheric", "wilderness", "gore"],
  },
  "4f020391-b1a1-43b1-a664-f929266803ec": {
    title: "The Ugly Stepsister",
    primary: "body horror",
    secondaries: ["folk horror"],
    tones: ["bleak", "fever dream"],
    themes: ["body autonomy", "coming-of-age", "family trauma"],
    settings: ["period setting"],
    content: ["gore"],
    order: ["body horror", "body autonomy", "bleak", "fever dream", "coming-of-age", "family trauma", "period setting", "gore", "folk horror"],
  },
  "24db529c-0c7b-418a-a2e3-ea5bbcfeb84d": {
    title: "The Void",
    primary: "cosmic horror",
    secondaries: ["body horror"],
    subjects: ["cult", "ritual"],
    tones: ["claustrophobic", "atmospheric"],
    settings: ["small town"],
    content: ["gore"],
    order: ["cosmic horror", "cult", "claustrophobic", "ritual", "atmospheric", "small town", "gore", "body horror"],
  },
  "aa4e88c7-2b9f-4a75-962e-cb1c43a57a2b": {
    title: "The Wicker Man (1973)",
    primary: "folk horror",
    subjects: ["cult", "ritual"],
    tones: ["atmospheric", "slow-burn"],
    themes: ["religion", "sexuality"],
    settings: ["rural horror"],
    order: ["folk horror", "cult", "atmospheric", "ritual", "slow-burn", "religion", "sexuality", "rural horror"],
  },
  "9601bc08-0fc6-4113-9025-d9f0440869bb": {
    title: "The Witch",
    primary: "folk horror",
    secondaries: ["religious horror"],
    subjects: ["witches"],
    tones: ["fever dream", "atmospheric", "bleak"],
    themes: ["family trauma", "religion"],
    settings: ["period setting", "wilderness"],
    order: ["folk horror", "family trauma", "fever dream", "atmospheric", "religion", "bleak", "witches", "period setting", "wilderness", "religious horror"],
  },
  "2e7f1a2e-345b-48dd-99ac-c46b321cdf16": {
    title: "Three... Extremes",
    primary: "extreme horror",
    secondaries: ["body horror"],
    tones: ["bleak", "mean-spirited"],
    themes: ["body autonomy", "obsession"],
    content: ["gore", "violent"],
    order: ["extreme horror", "bleak", "body autonomy", "mean-spirited", "obsession", "gore", "violent", "body horror"],
  },
  "481588f1-b8a7-47c3-a59e-dff6568d7889": {
    title: "Titane",
    primary: "body horror",
    subjects: ["serial killer"],
    tones: ["surreal", "mean-spirited", "fever dream"],
    themes: ["body autonomy", "queer", "family trauma"],
    settings: ["urban horror"],
    content: ["gore", "violent", "sexual content"],
    order: ["body horror", "body autonomy", "surreal", "queer", "mean-spirited", "family trauma", "fever dream", "serial killer", "urban horror", "gore", "violent", "sexual content"],
  },
  "4b2be5fe-c405-4970-964d-d4c3232ce447": {
    title: "Tokyo Fist",
    primary: "body horror",
    secondaries: ["exploitation"],
    tones: ["mean-spirited", "fever dream"],
    themes: ["masculinity", "relationship horror", "obsession"],
    settings: ["urban horror"],
    content: ["gore", "violent"],
    order: ["body horror", "masculinity", "relationship horror", "mean-spirited", "obsession", "fever dream", "urban horror", "gore", "violent", "exploitation"],
  },
  "eaf58ebe-46c0-4549-bdaa-eb884f6f43f1": {
    title: "Tomie",
    primary: "supernatural horror",
    secondaries: ["body horror"],
    tones: ["dreamlike", "mean-spirited"],
    themes: ["obsession", "sexuality"],
    settings: ["urban horror"],
    order: ["supernatural horror", "obsession", "dreamlike", "sexuality", "mean-spirited", "urban horror", "body horror"],
  },
  "1acd2296-b805-469a-a166-e5e17b2d5dd2": {
    title: "Ugetsu",
    primary: "folk horror",
    secondaries: ["gothic"],
    subjects: ["ghosts"],
    tones: ["dreamlike", "atmospheric", "slow-burn"],
    themes: ["grief", "family trauma"],
    settings: ["period setting", "rural horror"],
    order: ["folk horror", "dreamlike", "ghosts", "grief", "atmospheric", "family trauma", "slow-burn", "period setting", "rural horror", "gothic"],
  },
  "d9f7ba31-f38d-4fb1-a901-e8f38b17f97f": {
    title: "Under the Shadow",
    primary: "supernatural horror",
    subjects: ["demons"],
    tones: ["claustrophobic", "atmospheric", "bleak"],
    themes: ["motherhood", "family trauma"],
    settings: ["urban horror", "period setting"],
    order: ["supernatural horror", "motherhood", "claustrophobic", "family trauma", "atmospheric", "demons", "bleak", "urban horror", "period setting"],
  },
  "793fb157-c618-460f-86b3-7762402506a0": {
    title: "Weapons",
    primary: "supernatural horror",
    secondaries: ["psychological horror"],
    subjects: ["witches", "creepy kids"],
    tones: ["bleak", "atmospheric"],
    themes: ["family trauma", "paranoia"],
    settings: ["small town"],
    content: ["gore"],
    order: ["supernatural horror", "family trauma", "bleak", "creepy kids", "atmospheric", "paranoia", "witches", "small town", "gore", "psychological horror"],
  },
  "8809035f-f17f-4ff4-8714-b7f16ed0ed8d": {
    title: "What Lies Beneath",
    primary: "supernatural horror",
    secondaries: ["thriller"],
    subjects: ["ghosts"],
    tones: ["atmospheric", "slow-burn"],
    themes: ["relationship horror", "paranoia"],
    settings: ["suburban"],
    order: ["supernatural horror", "ghosts", "atmospheric", "relationship horror", "slow-burn", "paranoia", "suburban", "thriller"],
  },
  "d7a1595e-0368-4268-b504-a8af5abe7fba": {
    title: "When Evil Lurks",
    primary: "religious horror",
    secondaries: ["supernatural horror"],
    subjects: ["demons", "possession"],
    tones: ["mean-spirited", "bleak", "nihilistic"],
    themes: ["religion", "family trauma"],
    settings: ["rural horror"],
    content: ["gore", "violent"],
    order: ["religious horror", "demons", "mean-spirited", "bleak", "possession", "religion", "nihilistic", "family trauma", "rural horror", "gore", "violent", "supernatural horror"],
  },
  "511e8e6b-c486-4cb9-a9fe-6c9f4961b34a": {
    title: "As Above, So Below",
    primary: "found footage",
    secondaries: ["religious horror"],
    subjects: ["ritual"],
    tones: ["claustrophobic", "fever dream"],
    themes: ["paranoia", "religion"],
    settings: ["urban horror"],
    order: ["found footage", "claustrophobic", "paranoia", "fever dream", "religion", "ritual", "urban horror", "religious horror"],
  },
  "c98906f9-b889-416b-bf78-ae9e89df8f70": {
    title: "Evolution",
    primary: "body horror",
    secondaries: ["cosmic horror"],
    subjects: ["creepy kids"],
    tones: ["dreamlike", "atmospheric", "slow-burn"],
    themes: ["body autonomy", "motherhood"],
    settings: ["wilderness"],
    order: ["body horror", "dreamlike", "creepy kids", "atmospheric", "body autonomy", "slow-burn", "motherhood", "wilderness", "cosmic horror"],
  },
  "2c100558-43fb-4076-b03b-1582bc9d5ae2": {
    title: "Zodiac",
    primary: "thriller",
    subjects: ["serial killer"],
    tones: ["slow-burn", "bleak", "atmospheric"],
    themes: ["paranoia", "obsession"],
    settings: ["urban horror", "period setting"],
    note: "Thriller-as-Primary, horror-adjacent: true.",
    order: ["thriller", "obsession", "slow-burn", "serial killer", "bleak", "paranoia", "atmospheric", "urban horror", "period setting"],
  },
  "4df12c80-05e9-4bf5-80ac-bebac667f8ac": {
    title: "Midnight Special (2016)",
    primary: "techno-horror",
    secondaries: ["thriller"],
    subjects: ["creepy kids", "cult"],
    tones: ["atmospheric", "slow-burn"],
    themes: ["family trauma", "religion"],
    settings: ["wilderness"],
    note: "Sci-fi chase film w/ cult & paranormal-child core. Techno-horror feels closest.",
    order: ["techno-horror", "creepy kids", "atmospheric", "family trauma", "slow-burn", "religion", "cult", "wilderness", "thriller"],
  },

  // ── Lesser-known but tag-able with confidence ──────────────────────────
  "7395e43f-bbf2-4511-8839-ea7b893ab20d": {
    title: "Little Bites",
    primary: "creature feature",
    subjects: ["demons"],
    tones: ["atmospheric", "bleak"],
    themes: ["motherhood", "addiction"],
    settings: ["suburban"],
    note: "Single-mother grief-bargain horror.",
    order: ["creature feature", "motherhood", "atmospheric", "addiction", "bleak", "demons", "suburban"],
  },
  "5ded856f-2b3a-4673-b2ef-6e478cbae9b0": {
    title: "Frankie Freako",
    primary: "horror comedy",
    secondaries: ["creature feature"],
    subjects: ["aliens"],
    tones: ["funny", "campy", "midnight movie"],
    settings: ["suburban"],
    order: ["horror comedy", "funny", "aliens", "campy", "midnight movie", "suburban", "creature feature"],
  },
  "b9bcba16-d648-4222-a789-3ecb429ab206": {
    title: "Meatball Machine (2005)",
    primary: "splatterpunk",
    secondaries: ["body horror"],
    tones: ["mean-spirited", "midnight movie"],
    themes: ["body autonomy", "relationship horror"],
    content: ["gore", "splatter", "violent"],
    order: ["splatterpunk", "body autonomy", "mean-spirited", "relationship horror", "midnight movie", "gore", "splatter", "violent", "body horror"],
  },
  "52c071df-6610-4129-8343-6199fa2a3bc8": {
    title: "Grotesque",
    primary: "extreme horror",
    secondaries: ["exploitation"],
    subjects: ["serial killer"],
    tones: ["bleak", "mean-spirited", "nihilistic"],
    content: ["gore", "violent", "sexual content"],
    order: ["extreme horror", "serial killer", "bleak", "mean-spirited", "nihilistic", "gore", "violent", "sexual content", "exploitation"],
  },
  "7227d7b6-bc51-4301-8ab3-317ecaee0db9": {
    title: "Gun Woman",
    primary: "exploitation",
    tones: ["mean-spirited", "midnight movie"],
    themes: ["revenge", "body autonomy"],
    content: ["gore", "violent", "sexual content"],
    order: ["exploitation", "revenge", "mean-spirited", "body autonomy", "midnight movie", "gore", "violent", "sexual content"],
  },
  "dcc2b670-acdd-46ae-aff4-8751d3db5e9b": {
    title: "One Missed Call 2",
    primary: "supernatural horror",
    secondaries: ["cursed media"],
    subjects: ["ghosts", "cursed object"],
    tones: ["atmospheric", "bleak"],
    themes: ["technology"],
    order: ["supernatural horror", "ghosts", "atmospheric", "technology", "bleak", "cursed object", "cursed media"],
  },
  "4db9aff4-f422-429f-a1ee-6b6e50f972b6": {
    title: "Tormented",
    primary: "supernatural horror",
    subjects: ["ghosts", "creepy kids"],
    tones: ["dreamlike", "bleak"],
    themes: ["family trauma", "grief"],
    order: ["supernatural horror", "family trauma", "ghosts", "dreamlike", "grief", "bleak", "creepy kids"],
  },
  "11e692e0-0fc4-4fac-a880-b90cc419337f": {
    title: "The Real Exorcist",
    primary: "religious horror",
    subjects: ["possession", "demons"],
    tones: ["atmospheric"],
    themes: ["religion"],
    order: ["religious horror", "possession", "atmospheric", "religion", "demons"],
  },
  "f17561c9-7e10-4807-8522-cf3528ecd187": {
    title: "Minutes to Midnight",
    primary: "slasher",
    tones: ["mean-spirited"],
    settings: ["wilderness"],
    content: ["gore", "violent"],
    note: "Genre slasher, light editorial info.",
    order: ["slasher", "mean-spirited", "wilderness", "gore", "violent"],
  },
  "61b2e77a-f2af-4d4e-b811-4a24035cbcbf": {
    title: "New Religion",
    primary: "psychological horror",
    secondaries: ["religious horror"],
    subjects: ["ritual", "cult"],
    tones: ["surreal", "atmospheric", "slow-burn"],
    themes: ["grief", "religion"],
    settings: ["urban horror"],
    order: ["psychological horror", "grief", "surreal", "ritual", "atmospheric", "religion", "slow-burn", "cult", "urban horror", "religious horror"],
  },
  "310fb971-2115-4527-9800-d01e793bc4c2": {
    title: "Unwelcome",
    primary: "folk horror",
    secondaries: ["creature feature"],
    subjects: ["ritual"],
    tones: ["atmospheric"],
    themes: ["motherhood", "family trauma"],
    settings: ["rural horror"],
    content: ["gore"],
    order: ["folk horror", "motherhood", "atmospheric", "family trauma", "ritual", "rural horror", "gore", "creature feature"],
  },
  "05268313-743b-4f51-a054-4c0b1db0b228": {
    title: "The Night",
    primary: "supernatural horror",
    secondaries: ["psychological horror"],
    subjects: ["ghosts"],
    tones: ["claustrophobic", "atmospheric", "fever dream"],
    themes: ["paranoia", "family trauma"],
    settings: ["urban horror"],
    order: ["supernatural horror", "ghosts", "claustrophobic", "paranoia", "atmospheric", "family trauma", "fever dream", "urban horror", "psychological horror"],
  },

  // ── Skips: not horror, not in catalog scope ────────────────────────────
  "00de9119-544f-4071-8e9b-551dc20c338a": { title: "Eighth Grade", skip: "Not horror — coming-of-age drama. Outside catalog scope." },
  "bf58b8a4-dccb-4921-8899-e721ee60ce23": { title: "Escape from Alcatraz", skip: "Not horror — prison-break drama. Outside catalog scope." },
  "0fd6ea08-b719-42f5-9f65-21cd9e459d6d": { title: "Materialists", skip: "Not horror — romantic drama. Outside catalog scope." },
  "bb0d318b-5f1f-4cc5-9b0a-3d3eb7e04328": { title: "Midnight Madness", skip: "Not horror — comedy. Outside catalog scope." },
  "07808df4-1b30-44c5-9d5f-b5f21171cca2": { title: "The Adventures of Buckaroo Banzai", skip: "Not horror — sci-fi comedy. Outside catalog scope." },
  "72990381-305e-475d-a0b2-3ea16afdbd24": { title: "Priscilla, Queen of the Desert", skip: "Not horror — comedy/drama. Outside catalog scope." },
  "8330ec97-bcab-45f6-a214-f8cb51bb8a32": { title: "The Last Black Man in San Francisco", skip: "Not horror — drama. Outside catalog scope." },
  "ba2bf423-b17e-496e-b487-aa8fcef1c465": { title: "The Smashing Machine", skip: "Not horror — sports drama. Outside catalog scope." },
  "d8b651e9-c29a-410d-923c-9c15bc2fc09b": { title: "The Warriors", skip: "Not horror — cult crime/action. Outside catalog scope." },
  "9ee7dba4-dbbf-4ad5-8075-ddf7ad23a89c": { title: "Time Warp Vol 1 – Midnight Madness", skip: "Documentary — outside fiction-film catalog scope." },
  "d456e2dc-0d10-4c3a-9662-4481699448df": { title: "Uncut Gems", skip: "Not horror — anxiety thriller. Outside catalog scope." },
  "1adde485-f93a-4179-bc97-69ac472da3d8": { title: "Wife of a Spy", skip: "Not horror — period spy drama. Outside catalog scope." },
  "448e34a2-c71b-433f-a09e-2fff3b99ef8d": { title: "Wild at Heart", skip: "Not horror — surreal romance/crime. Outside catalog scope." },
  "aea66436-4d29-4deb-859f-1cf630c4ba65": { title: "Zola", skip: "Not horror — crime dramedy. Outside catalog scope." },
  "389272c9-40a8-41cf-a2c0-83849e433454": { title: "Fantastic Planet", skip: "Sci-fi animation, not horror." },
  "f20b1091-09cc-4f4f-ae03-f8ffd05b4f73": { title: "Evil Does Not Exist", skip: "Slow-cinema drama with eco overtones; not horror." },
  "749e3f75-db47-481e-88be-614f6c78bfe6": { title: "Tale of Cinema", skip: "Hong Sang-soo drama; not horror." },
  "7ba67038-2518-4179-a013-2f022851598d": { title: "Polyester", skip: "John Waters camp comedy; not horror." },
  "e6f5a320-a06a-4a2c-810e-0969d10e1d42": { title: "Woodlands Dark and Days Bewitched", skip: "Documentary about folk horror; tag the films it covers, not the doc itself." },

  // ── Skip: insufficient editorial info ────────────────────────────────
  "7b5d12a6-e188-4577-9a2c-e9b2f0e28ba3": { title: "A Midnight Kiss", skip: "Hallmark-style romance; not horror." },
  "19031c88-5e08-4117-a3b1-a29d9b7fa2bc": { title: "Arthur Malediction", skip: "French Arthur-and-the-Minimoys spinoff; needs review — possibly miscategorized in catalog." },
  "78b42f71-2466-446b-901a-d940c17a4b6c": { title: "Call of the Void", skip: "Insufficient editorial info — needs manual review." },
  "227e6ef8-13f0-480f-ae07-b5895d46dd4f": { title: "Consumed (2024)", skip: "Insufficient editorial info — needs manual review." },
  "7538ec47-efb2-4890-a31a-c79c191e24eb": { title: "Curse of the Sin Eater", skip: "Insufficient editorial info — needs manual review." },
  "18cd90e0-7a0a-462c-b17e-8ea1da195314": { title: "Hauntology", skip: "Insufficient editorial info — needs manual review." },
  "80ca566f-9600-4a25-b72f-eb0f8dc19110": { title: "Hell Hole", skip: "Adams/Poser indie horror; needs manual review for specific facets." },
  "9ba9c7aa-809f-443f-98dd-c9cc683ac0cd": { title: "House on Eden", skip: "Insufficient editorial info — needs manual review." },
  "765eb1e4-47e0-4bdc-9641-c5c61f2df8b2": { title: "I'm Sorry If I Took a Toll on You", skip: "Insufficient editorial info — needs manual review." },
  "4d5b874a-43f3-4025-ab7d-0d37b05e52d3": { title: "Modern Folklore", skip: "Insufficient editorial info — needs manual review." },
  "366a36e1-bff5-4aef-bf7c-1750454fb8ef": { title: "Queen of Bones", skip: "Insufficient editorial info — needs manual review." },
  "cf988a1b-8525-4acf-87ff-953a066c1e6a": { title: "The Bride!", skip: "Future release (2026); needs editorial review on confirmation." },
  "2acac6e5-2426-4d51-80fd-89e0d3fcf50b": { title: "The Carpenter's Son", skip: "Insufficient editorial info — needs manual review." },
  "48cd4aac-6590-402f-ac8a-f37ad87bc4d2": { title: "The Deep Dark", skip: "Future release (2026); needs editorial review on confirmation." },
  "67f2a2a9-8b9d-45c7-ae3b-1bd31517fae4": { title: "The Dreadful", skip: "Future release (2026); needs editorial review on confirmation." },
  "949fc13e-3389-40b2-9596-261b96e879d2": { title: "The Healing", skip: "Insufficient editorial info — needs manual review." },
  "719fe2b9-decb-4809-a4a1-dd1783b063f1": { title: "The Housemaid", skip: "Insufficient editorial info — needs manual review." },
  "c3ae8ed0-23dd-497f-bdef-47c4bdd1ee43": { title: "The King Tide", skip: "Insufficient editorial info — needs manual review." },
  "e8bd7321-f468-4f53-91ec-0ac1786a037c": { title: "The Well (2024)", skip: "Italian cursed-painting horror; needs manual review for specifics." },
  "f9954c91-2339-43de-baa7-09328d8a2cf8": { title: "The Whistler", skip: "Future release (2026); needs editorial review on confirmation." },
  "42ff4fce-63c4-4363-b5e1-d4710e1eafa1": { title: "Undertone", skip: "Future release (2026); needs editorial review on confirmation." },
  "2f8ef361-f41b-4282-81c9-34e679553dc1": { title: "Watch If You Dare", skip: "Anthology — needs per-segment review." },
  "469b7c1f-7d5d-4d19-a687-f9bfe405ec68": { title: "Wormtown", skip: "Insufficient editorial info — needs manual review." },
};

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Build (name → {id, type}) map for tag validation.
  const tagsRes = await c.query<{ id: string; name: string; type: string }>(
    "SELECT id, name, type FROM tags",
  );
  const tagByName = new Map(tagsRes.rows.map(r => [r.name, { id: r.id, type: r.type }]));

  // Build (filmId → {title, director, year}) for markdown.
  const filmsRes = await c.query<{ id: string; title: string; director: string; year: number }>(
    "SELECT id, title, director, year FROM films",
  );
  const filmById = new Map(filmsRes.rows.map(r => [r.id, r]));

  const mdLines: string[] = [
    "# Goblin Tagged",
    "",
    "Editorial pass on the FilmGoblin catalog per the v2 staff style guide (`/Users/christophernowacki/Downloads/filmgoblin-tagging-guide-v2.pdf`). Generated by `tag-films.ts`.",
    "",
    "Format per row: `title (year): primary, director, tag1, tag2, …` — visible 5 are slots 1–5 (Primary, Director, then three distinguishing). Hidden tail follows.",
    "",
    "## Tagged films",
    "",
  ];
  const skipLines: string[] = ["", "## Skipped films", ""];

  let appliedCount = 0;
  let skipCount = 0;
  const errors: string[] = [];

  for (const filmId of Object.keys(PLAN)) {
    const plan = PLAN[filmId];
    const film = filmById.get(filmId);
    if (!film) {
      errors.push(`Film not found: ${filmId} (${plan.title})`);
      continue;
    }

    if (plan.skip) {
      skipLines.push(`- **${film.title} (${film.year})** — ${plan.skip}`);
      skipCount++;
      continue;
    }

    if (!plan.primary || !plan.order || !plan.tones || plan.tones.length === 0) {
      errors.push(`${film.title}: missing required fields (primary/order/tones)`);
      continue;
    }

    // Validate every tag name in the plan exists.
    const allFromPlan = [
      plan.primary,
      ...(plan.secondaries ?? []),
      ...(plan.subjects ?? []),
      ...plan.tones,
      ...(plan.themes ?? []),
      ...(plan.settings ?? []),
      ...(plan.content ?? []),
    ];
    const orderSet = new Set(plan.order);
    if (allFromPlan.length !== plan.order.length || allFromPlan.some(n => !orderSet.has(n))) {
      errors.push(`${film.title}: order mismatch — picks=[${allFromPlan.join(", ")}] order=[${plan.order.join(", ")}]`);
      continue;
    }
    for (const n of plan.order) {
      if (!tagByName.has(n)) {
        errors.push(`${film.title}: unknown tag '${n}'`);
        continue;
      }
    }
    if (errors.length > 0 && errors[errors.length - 1].startsWith(film.title)) continue;

    // Slot 1 must be primary.
    if (plan.order[0] !== plan.primary) {
      errors.push(`${film.title}: order[0] is '${plan.order[0]}' but primary is '${plan.primary}'`);
      continue;
    }

    // Secondaries must live at index >= 4 (= film_tags position 5+).
    for (const sec of plan.secondaries ?? []) {
      if (plan.order.indexOf(sec) < 4) {
        errors.push(`${film.title}: secondary '${sec}' is at index ${plan.order.indexOf(sec)}, must be >= 4`);
        continue;
      }
    }
    if (errors.length > 0 && errors[errors.length - 1].startsWith(film.title)) continue;

    // Type-defense: every tag's actual type must match the facet bucket it came from.
    const expectFacet = (n: string, want: string) => {
      const t = tagByName.get(n);
      if (!t) return false;
      return t.type === want;
    };
    let typeOk = expectFacet(plan.primary, "subgenre");
    for (const n of plan.secondaries ?? []) typeOk = typeOk && expectFacet(n, "subgenre");
    for (const n of plan.subjects ?? []) typeOk = typeOk && expectFacet(n, "subject");
    for (const n of plan.tones) typeOk = typeOk && expectFacet(n, "tone");
    for (const n of plan.themes ?? []) typeOk = typeOk && expectFacet(n, "theme");
    for (const n of plan.settings ?? []) typeOk = typeOk && expectFacet(n, "setting");
    for (const n of plan.content ?? []) typeOk = typeOk && expectFacet(n, "content");
    if (!typeOk) {
      errors.push(`${film.title}: type mismatch — one of the tags isn't in its expected facet`);
      continue;
    }

    // Apply: delete-then-insert + horror_adjacent update.
    await c.query("BEGIN");
    try {
      await c.query("DELETE FROM film_tags WHERE film_id = $1", [filmId]);
      for (let i = 0; i < plan.order.length; i++) {
        const tagName = plan.order[i];
        const tag = tagByName.get(tagName)!;
        const isPrimary = tagName === plan.primary;
        await c.query(
          "INSERT INTO film_tags (film_id, tag_id, position, is_primary) VALUES ($1, $2, $3, $4)",
          [filmId, tag.id, i + 1, isPrimary],
        );
      }
      await c.query(
        "UPDATE films SET horror_adjacent = $1 WHERE id = $2",
        [plan.primary === "thriller", filmId],
      );
      await c.query("COMMIT");
      appliedCount++;
    } catch (e) {
      await c.query("ROLLBACK");
      errors.push(`${film.title}: SQL error ${(e as Error).message}`);
      continue;
    }

    // Markdown line.
    const visible = plan.order.slice(0, 4); // first 4 tags = staff visible (Primary + 3 distinguishing). Director rendered virtually at slot 2.
    const visibleLine = [
      `**${visible[0]}**`,                  // Primary in bold
      `_${film.director}_`,                 // Director italics
      ...visible.slice(1).map(t => t),      // distinguishing
    ].join(", ");
    const hidden = plan.order.slice(4);
    const hiddenLine = hidden.length > 0 ? ` _(tail: ${hidden.join(", ")})_` : "";
    const noteLine = plan.note ? `  \n  ↳ ${plan.note}` : "";
    mdLines.push(`- **${film.title} (${film.year})** — ${visibleLine}${hiddenLine}${noteLine}`);
  }

  await c.end();

  // Stats and skip block.
  mdLines.push("");
  mdLines.push("---");
  mdLines.push("");
  mdLines.push(`**Tagged:** ${appliedCount} films · **Skipped:** ${skipCount}`);
  mdLines.push(...skipLines);
  if (errors.length > 0) {
    mdLines.push("", "## Errors", "");
    for (const e of errors) mdLines.push(`- ${e}`);
  }

  writeFileSync("/Users/christophernowacki/film-goblin/goblin_tagged.md", mdLines.join("\n") + "\n");
  console.log(`\nTagged ${appliedCount} films, skipped ${skipCount}, ${errors.length} errors`);
  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const e of errors) console.log("  -", e);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
