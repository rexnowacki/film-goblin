import type { ITunesResult } from "../../src/types.js";

export const midsommarResult: ITunesResult = {
  wrapperType: "track",
  kind: "feature-movie",
  trackId: 1468845007,
  trackName: "Midsommar",
  artistName: "Ari Aster",
  releaseDate: "2019-07-03T07:00:00Z",
  trackTimeMillis: 8820000,
  primaryGenreName: "Horror",
  longDescription: "A grief-stricken couple travels to Sweden...",
  shortDescription: "A couple travels to Sweden.",
  contentAdvisoryRating: "R",
  artworkUrl100: "https://is1-ssl.mzstatic.com/image/thumb/Video/mid/100x100bb.jpg",
  trackViewUrl: "https://tv.apple.com/us/movie/midsommar/umc.cmc.abc",
  trackPrice: 4.99,
  trackHdPrice: 4.99,
  trackRentalPrice: 3.99,
};

export const invalidPriceResult: ITunesResult = {
  ...midsommarResult,
  trackId: 9999999,
  trackName: "Invalid Price Film",
  trackPrice: 0,
};

export const nullPriceResult: ITunesResult = {
  ...midsommarResult,
  trackId: 9999998,
  trackName: "Null Price Film",
  trackPrice: null,
};

export const wrongKindResult: ITunesResult = {
  ...midsommarResult,
  trackId: 9999997,
  kind: "music-video",
  trackName: "Music Video",
};

export const missingArtworkResult: ITunesResult = {
  ...midsommarResult,
  trackId: 9999996,
  artworkUrl100: undefined,
};
