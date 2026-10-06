import { contrastRatio } from "./color";

// How a site is shown: a proper name and a coloured letter badge. Everything is computed here, so no
// visited domain is ever sent to a third party (a favicon service would see every site you browse).

/** Well-known sites: proper capitalisation the domain alone cannot give, and a brand colour for the badge. */
const KNOWN: Record<string, [name: string, color: string]> = {
  "youtube.com": ["YouTube", "#ff0000"],
  "youtu.be": ["YouTube", "#ff0000"],
  "reddit.com": ["Reddit", "#ff4500"],
  "x.com": ["X (Twitter)", "#1d9bf0"],
  "twitter.com": ["X (Twitter)", "#1d9bf0"],
  "facebook.com": ["Facebook", "#1877f2"],
  "instagram.com": ["Instagram", "#e4405f"],
  "tiktok.com": ["TikTok", "#fe2c55"],
  "snapchat.com": ["Snapchat", "#fffc00"],
  "pinterest.com": ["Pinterest", "#e60023"],
  "linkedin.com": ["LinkedIn", "#0a66c2"],
  "discord.com": ["Discord", "#5865f2"],
  "whatsapp.com": ["WhatsApp", "#25d366"],
  "telegram.org": ["Telegram", "#26a5e4"],
  "t.me": ["Telegram", "#26a5e4"],
  "quora.com": ["Quora", "#b92b27"],
  "medium.com": ["Medium", "#292929"],
  "tumblr.com": ["Tumblr", "#35465c"],
  "imgur.com": ["Imgur", "#1bb76e"],
  "news.ycombinator.com": ["Hacker News", "#ff6600"],
  "netflix.com": ["Netflix", "#e50914"],
  "twitch.tv": ["Twitch", "#9146ff"],
  "primevideo.com": ["Prime Video", "#00a8e1"],
  "hotstar.com": ["Hotstar", "#1f80e0"],
  "disneyplus.com": ["Disney+", "#113ccf"],
  "hulu.com": ["Hulu", "#1ce783"],
  "crunchyroll.com": ["Crunchyroll", "#f47521"],
  "spotify.com": ["Spotify", "#1db954"],
  "amazon.com": ["Amazon", "#ff9900"],
  "amazon.in": ["Amazon", "#ff9900"],
  "flipkart.com": ["Flipkart", "#2874f0"],
  "ebay.com": ["eBay", "#e53238"],
  "zomato.com": ["Zomato", "#e23744"],
  "swiggy.com": ["Swiggy", "#fc8019"],
  "google.com": ["Google", "#4285f4"],
  "mail.google.com": ["Gmail", "#ea4335"],
  "docs.google.com": ["Google Docs", "#4285f4"],
  "drive.google.com": ["Google Drive", "#0f9d58"],
  "meet.google.com": ["Google Meet", "#00897b"],
  "calendar.google.com": ["Google Calendar", "#4285f4"],
  "maps.google.com": ["Google Maps", "#34a853"],
  "bing.com": ["Bing", "#008373"],
  "duckduckgo.com": ["DuckDuckGo", "#de5833"],
  "wikipedia.org": ["Wikipedia", "#636466"],
  "github.com": ["GitHub", "#30363d"],
  "stackoverflow.com": ["Stack Overflow", "#f48024"],
  "chatgpt.com": ["ChatGPT", "#10a37f"],
  "openai.com": ["OpenAI", "#10a37f"],
  "claude.ai": ["Claude", "#d97757"],
  "notion.so": ["Notion", "#2f3437"],
  "figma.com": ["Figma", "#f24e1e"],
  "slack.com": ["Slack", "#4a154b"],
  "zoom.us": ["Zoom", "#0b5cff"],
  "outlook.com": ["Outlook", "#0078d4"],
  "yahoo.com": ["Yahoo", "#6001d2"],
  "bbc.co.uk": ["BBC", "#bb1919"],
  "bbc.com": ["BBC", "#bb1919"],
  "cnn.com": ["CNN", "#cc0000"],
  "nytimes.com": ["The New York Times", "#333333"],
  "theguardian.com": ["The Guardian", "#052962"],
  "cricbuzz.com": ["Cricbuzz", "#00a651"],
};

/** Second-level public suffixes, so "bbc.co.uk" reads as "Bbc" and not "Co". A short list, not the whole public suffix list. */
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.in", "net.in", "org.in",
  "co.jp", "co.nz", "com.br", "com.cn", "com.mx", "co.za", "com.sg", "com.hk",
]);

export interface SiteInfo {
  name: string;
  /** Badge background, #rrggbb. */
  color: string;
  /** Text colour that is readable on `color`. */
  textColor: string;
  letter: string;
}

const NOT_A_NAME = /^(\d{1,3}(\.\d{1,3}){3}|localhost|\[.*\])$/;

/** "news.example.co.uk" -> "example". */
function mainLabel(labels: string[]): string {
  if (labels.length < 2) return labels[0] ?? "";
  const suffixLength = TWO_LEVEL_SUFFIXES.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels[Math.max(0, labels.length - suffixLength)];
}

const titleCase = (text: string) =>
  text
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** The same name always gets the same colour. */
function colorFor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hslToHex(hash % 360, 0.5, 0.42);
}

const readableText = (background: string) => (contrastRatio(background, "#ffffff") >= contrastRatio(background, "#101123") ? "#ffffff" : "#101123");

/** A friendly name and badge colours for a (lower-case, www-less) domain. Unknown sites get a tidied name and a stable colour. */
export function siteInfo(domain: string): SiteInfo {
  const host = domain.trim().toLowerCase();
  const labels = host.split(".");

  // m.youtube.com -> youtube.com: look for the domain itself, then each parent, so specific entries (mail.google.com) win.
  let known: [string, string] | undefined;
  for (let i = 0; i < labels.length - 1 && !known; i++) known = KNOWN[labels.slice(i).join(".")];

  const name = known?.[0] ?? (NOT_A_NAME.test(host) || !host ? host : titleCase(mainLabel(labels)) || host);
  const color = known?.[1] ?? colorFor(name);
  const letter = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "?").toUpperCase();
  return { name, color, textColor: readableText(color), letter };
}
