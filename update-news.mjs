// Fetches the latest NEWS from each AKB48 solo fan club site and updates index.html in place.
// Run with: node update-news.mjs

import { readFile, writeFile } from "node:fs/promises";

const MEMBERS = [
  ["福岡聖菜", "https://seinafukuoka.officialfc.jp"],
  ["千葉恵里", "https://chibaerii-fc.jp"],
  ["岩立沙穂", "https://iwatatesaho-fc.jp"],
  ["山内瑞葵", "https://yamauchimizuki-fc.jp"],
  ["長友彩海", "https://nagatomoayami-fc.jp"],
  ["髙橋彩音", "https://takahashiayane-fc.jp"],
  ["永野芹佳", "https://naganoserika-fc.jp"],
  ["徳永羚海", "https://tokunagaremi.official-fc.site"],
  ["布袋百椛", "https://hoteimoka.officialfc.jp"],
  ["山﨑空", "https://yamazakisora.officialfc.jp"],
  ["水島美結", "https://mizushimamiyuu.officialfc.jp"],
  ["畠山希美", "https://henyorinntonozomi.officialfc.jp"],
  ["佐藤綺星", "https://airisato.officialfc.jp"],
  ["平田侑希", "https://hiratayuki.officialfc.jp"],
  ["正鋳真優", "https://masaimayuu.official-fc.site"],
  ["坂川陽香", "https://hiyukasakagawa.officialfc.jp"],
  ["太田有紀", "https://yukiota.officialfc.jp"],
  ["橋本恵理子", "https://erikohashimoto.officialfc.jp"],
  ["武藤小麟", "https://mutoorin.official-fc.site"],
  ["工藤華純", "https://kasumikudo.officialfc.jp"],
  ["新井彩永", "https://araisae.officialfc.jp"],
  ["山口結愛", "https://yamaguchiyui.officialfc.jp"],
  ["八木愛月", "https://yagiazuki.officialfc.jp"],
  ["迫由芽実", "https://yumemi.officialfc.jp"],
  ["久保姫菜乃", "https://kubohinano.22.officialfc.jp"],
  ["秋山由奈", "https://akiyamayuna.officialfc.jp"],
  ["成田香姫奈", "https://kohinanarita.officialfc.jp"],
  ["下尾みう", "https://miumiuhouse.officialfc.jp"],
];

const MAX_ITEMS_PER_MEMBER = 20;
const UA = "Mozilla/5.0 (compatible; akb-solofc-news-bot/1.0; +https://github.com/)";

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

async function fetchMemberNews(origin) {
  const url = `${origin}/news/all/pages/1`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const items = [];
  const blocks = html.split('<a href="/news/detail/').slice(1);
  for (const block of blocks) {
    const idMatch = block.match(/^([^"]+)"/);
    if (!idMatch) continue;
    const path = `/news/detail/${idMatch[1]}`;

    const dateMatch = block.match(/text-textSecondary[^>]*>([^<]+)</);
    const titleMatch = block.match(/text-textPrimaryBgNon[^>]*>([^<]+)</);
    if (!dateMatch || !titleMatch) continue;

    const date = decodeEntities(dateMatch[1]).trim();
    const title = decodeEntities(titleMatch[1]).trim();
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(date)) continue;

    items.push([date, title, path]);
    if (items.length >= MAX_ITEMS_PER_MEMBER) break;
  }
  return items;
}

function jsStringLiteral(str) {
  return JSON.stringify(str);
}

function buildMembersLiteral(results) {
  const lines = results.map(({ name, origin, news, failed }) => {
    const newsLines = news
      .map(([date, title, path]) => `      [${jsStringLiteral(date)}, ${jsStringLiteral(title)}, ${jsStringLiteral(path)}]`)
      .join(",\n");
    const newsBlock = news.length ? `[\n${newsLines}\n    ]` : "[]";
    return `    { name: ${jsStringLiteral(name)}, origin: ${jsStringLiteral(origin)}, news: ${newsBlock} }`;
  });
  return `  var MEMBERS = [\n${lines.join(",\n")}\n  ];`;
}

async function main() {
  const filePath = new URL("./index.html", import.meta.url);
  let html = await readFile(filePath, "utf8");

  // Parse the currently-published MEMBERS array as a fallback for members whose fetch fails.
  const existingMatch = html.match(/var MEMBERS = (\[[\s\S]*?\n  \]);/);
  let existing = {};
  if (existingMatch) {
    try {
      // eslint-disable-next-line no-new-func
      const arr = new Function(`return ${existingMatch[1]};`)();
      for (const m of arr) existing[m.name] = m;
    } catch {
      // ignore parse failure, fall back to empty news per member
    }
  }

  const results = [];
  const failed = [];
  for (const [name, origin] of MEMBERS) {
    try {
      const news = await fetchMemberNews(origin);
      if (news.length === 0) throw new Error("no items parsed");
      results.push({ name, origin, news, failed: false });
    } catch (err) {
      const fallback = existing[name]?.news ?? [];
      results.push({ name, origin, news: fallback, failed: true });
      failed.push(`${name} (${err.message})`);
    }
  }

  const membersLiteral = buildMembersLiteral(results);
  if (!/var MEMBERS = \[[\s\S]*?\n  \];/.test(html)) {
    throw new Error("Could not locate MEMBERS array in index.html — aborting to avoid corrupting the file.");
  }
  html = html.replace(/var MEMBERS = \[[\s\S]*?\n  \];/, membersLiteral);

  const today = new Date();
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  const jst = new Date(today.getTime() + jstOffsetMs);
  const yyyy = jst.getUTCFullYear();
  const mm = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jst.getUTCDate()).padStart(2, "0");
  const isoDate = `${yyyy}-${mm}-${dd}`;
  const dotDate = `${yyyy}.${mm}.${dd}`;

  html = html.replace(/var TODAY = new Date\("[^"]*"\);/, `var TODAY = new Date("${isoDate}");`);
  html = html.replace(/(<b>)\d{4}\.\d{2}\.\d{2}(<\/b><span>最終取得日<\/span>)/, `$1${dotDate}$2`);

  await writeFile(filePath, html, "utf8");

  const okCount = results.filter((r) => !r.failed).length;
  console.log(`Updated ${okCount}/${MEMBERS.length} members.`);
  if (failed.length) {
    console.log(`Failed (kept previous data): ${failed.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
