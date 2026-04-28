// URL router — maps episode page URL to the correct site scraper
import { scrape as scrapeCWT } from './conversations-with-tyler.js';
import { scrape as scrapeDwarkesh } from './dwarkesh.js';
import { scrape as scrapeCheekyPint } from './cheeky-pint.js';
import { scrape as scrapeILTB } from './invest-like-the-best.js';
import { scrape as scrapeLexFridman } from './lex-fridman.js';
import { scrape as scrapeTBPN } from './tbpn.js';
import { scrape as scrapeAcquired } from './acquired.js';
import { scrape as scrapeYouTube } from './youtube.js';

const SUPPORTED = [
  { name: 'Conversations with Tyler', match: u => u.includes('conversationswithtyler.com'), scrape: scrapeCWT },
  { name: 'Dwarkesh Podcast',         match: u => u.includes('dwarkeshpatel.com') || u.includes('dwarkesh.com'), scrape: scrapeDwarkesh },
  { name: 'Cheeky Pint',              match: u => u.includes('cheekypint.com') || u.includes('cheekypint.transistor.fm'), scrape: scrapeCheekyPint },
  { name: 'Invest Like the Best',     match: u => u.includes('joincolossus.com') || u.includes('colossus.com') || u.includes('investlikethebest'), scrape: scrapeILTB },
  { name: 'Lex Fridman Podcast',      match: u => u.includes('lexfridman.com'),              scrape: scrapeLexFridman },
  { name: 'TBPN',                     match: u => u.includes('tbpn.') || u.includes('open.spotify.com'), scrape: scrapeTBPN },
  { name: 'Acquired',                 match: u => u.includes('acquired.fm'),                            scrape: scrapeAcquired },
  { name: 'YouTube',                  match: u => u.includes('youtube.com') || u.includes('youtu.be'),   scrape: scrapeYouTube },
];

export function getSupportedSites() {
  return SUPPORTED.map(s => s.name);
}

export async function scrapeEpisode(url, htmlOverride) {
  const site = SUPPORTED.find(s => s.match(url));
  if (!site) {
    const names = SUPPORTED.map(s => s.name).join(', ');
    throw new Error(
      `Unsupported podcast site.\nSupported: ${names}.\nAdd more with --add-site (V2).`
    );
  }
  return site.scrape(url, htmlOverride);
}
