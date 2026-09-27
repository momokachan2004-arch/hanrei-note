// 新着判例ウォッチ：裁判所ウェブサイトの「最近の最高裁判例」「最近の下級裁裁判例」を巡回し、
// data/watch.js を更新する。GitHub Actions（.github/workflows/watch.yml）から毎日実行される。
// 外部ライブラリは使わない（Node.js 20 以上の fetch だけで動く）。

const BASE = "https://www.courts.go.jp";
const LISTS = [
  { kind: "最高裁", url: `${BASE}/hanrei/search2/index.html?courtCaseType=1&filter%5Brecent%5D=1` },
  { kind: "下級審", url: `${BASE}/hanrei/search4/index.html?courtCaseType=3&filter%5Brecent%5D=1` }
];
const UA = "hanrei-note-watch (+https://github.com/momokachan2004-arch/hanrei-note)";
const MAX_ITEMS = 300;        // data/watch.js に残す件数
const MAX_REFRESH = 10;       // 判例集・要旨が未掲載の判例を再確認する1回あたりの上限
const REFRESH_DAYS = 90;      // 何日前に見つけたものまで再確認するか

// 分野の自動判定（事件名・判示事項・裁判要旨・参照法条に含まれる言葉で判定）
const AREA_RULES = [
  ["会社法", /会社法|商法|株主|取締役|監査役|新株|募集株式|株式の|株式譲渡|株式買取|吸収合併|会社分割/],
  ["金商法", /金融商品取引法|証券取引法|有価証券/],
  ["独禁法", /独占禁止|私的独占|不公正な取引方法|公正取引委員会|課徴金/],
  ["下請法・取適法", /下請|中小受託|特定受託/],
  ["景表法・広告", /景品表示|不当景品類|消費者契約法|特定商取引/],
  ["個人情報・プライバシー", /個人情報|プライバシー|発信者情報|名誉毀損|名誉棄損/],
  ["労働法", /労働|賃金|解雇|雇用|労災|遺族補償|休業補償|就業規則|懲戒|地位確認|残業|割増賃金/],
  ["知的財産", /特許|著作権|商標|意匠|不正競争/],
  ["倒産", /破産|民事再生|会社更生/],
  ["租税", /法人税|所得税|消費税|相続税|更正処分|課税/]
];
// 最高裁の刑事事件のうち、これらの分野に当たるものだけ残す
const CRIMINAL_KEEP = new Set(["会社法", "金商法", "独禁法", "租税", "知的財産"]);
// 下級審の民事事件のうち、これらの分野に当たるものも残す（行政事件・労働関係は常に残す）
const LOWER_CIVIL_KEEP = new Set(["会社法", "金商法", "独禁法", "下請法・取適法", "景表法・広告", "個人情報・プライバシー", "倒産"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function decode(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t　]+\n/g, "\n").replace(/\n{2,}/g, "\n")
    .trim();
}

// 一覧ページから判例ページのid（数字）と detail 番号を取り出す
export function parseList(html) {
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(/href="[^"]*?\/(\d+)\/detail(\d)\/index\.html"/g)) {
    const key = `${m[1]}/detail${m[2]}`;
    if (!seen.has(key)) { seen.add(key); out.push({ num: m[1], detail: m[2] }); }
  }
  return out;
}

// 判例ページの <dt>項目名</dt><dd>値</dd> を全部取り出す
export function parseDetail(html) {
  const f = {};
  for (const m of html.matchAll(/<dt>\s*([^<]+?)\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    f[m[1].trim()] = decode(m[2]);
  }
  return f;
}

// 和暦の日付 → YYYY-MM-DD（並べ替え用）
export function toISO(wareki) {
  const m = (wareki || "").match(/(令和|平成|昭和)(元|\d+)年(\d+)月(\d+)日/);
  if (!m) return "";
  const y = (m[2] === "元" ? 1 : +m[2]) + { 令和: 2018, 平成: 1988, 昭和: 1925 }[m[1]];
  return `${y}-${String(m[3]).padStart(2, "0")}-${String(m[4]).padStart(2, "0")}`;
}

export function guessAreas(text) {
  const areas = AREA_RULES.filter(([, re]) => re.test(text)).map(([a]) => a);
  return areas.length ? areas : ["その他"];
}

// 事件番号の符号がひらがななら刑事事件（例：令和5(あ)395）
export const isCriminal = (caseNo) => /\([ぁ-ん]/.test(caseNo || "");

export function toItem(kind, num, detail, f, firstSeen) {
  const caseNo = f["事件番号"] || "";
  const text = [f["事件名"], f["判示事項"], f["裁判要旨"], f["判示事項の要旨"], f["参照法条"]].join(" ");
  const areas = guessAreas(text);
  return {
    id: num,
    url: `${BASE}/hanrei/${num}/detail${detail}/index.html`,
    kind,
    caseNo,
    name: f["事件名"] || "",
    date: f["裁判年月日"] || "",
    dateISO: toISO(f["裁判年月日"]),
    court: (f["法廷名"] || f["裁判所名・部"] || f["裁判所名"] || "").replace(/\s+/g, " ").trim(),
    type: f["裁判種別"] || "",
    result: f["結果"] || "",
    source: f["判例集等巻・号・頁"] || "",
    gensin: [f["原審裁判所名"], f["原審事件番号"]].filter(Boolean).join(" ").replace(/\s+/g, " "),
    point: f["判示事項"] || f["判示事項の要旨"] || "",
    summary: f["裁判要旨"] || "",
    refs: f["参照法条"] || "",
    areas,
    criminal: isCriminal(caseNo),
    firstSeen
  };
}

// 集める対象かどうか
//   最高裁：刑事以外は全部。刑事は企業関連だけ。
//   下級審：刑事は除く。行政事件・労働関係と、企業法務の分野に当たる民事事件。
export function wanted(item) {
  if (item.kind === "最高裁") return !item.criminal || item.areas.some((a) => CRIMINAL_KEEP.has(a));
  if (item.criminal) return false;
  return /\(行/.test(item.caseNo) || item.areas.includes("労働法") || item.areas.some((a) => LOWER_CIVIL_KEEP.has(a));
}

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function main() {
  const fs = await import("node:fs");
  const path = new URL("../data/watch.js", import.meta.url);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 日本時間の日付

  let data = { updated: "", items: [], skipped: [] };
  if (fs.existsSync(path)) {
    const txt = fs.readFileSync(path, "utf8");
    data = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
    data.skipped ||= [];
  }
  const known = new Set([...data.items.map((i) => i.id), ...data.skipped]);
  let changed = false;
  let added = 0;

  // 1. 新着一覧を巡回して、まだ見ていない判例を取得する
  for (const list of LISTS) {
    for (let offset = 0; offset < 90; offset += 30) {
      const html = await get(offset ? `${list.url}&offset=${offset}` : list.url);
      const entries = parseList(html);
      for (const { num, detail } of entries) {
        if (known.has(num)) continue;
        known.add(num);
        await sleep(1000);
        const f = parseDetail(await get(`${BASE}/hanrei/${num}/detail${detail}/index.html`));
        const item = toItem(list.kind, num, detail, f, today);
        if (wanted(item)) { data.items.push(item); added++; }
        else data.skipped.push(num);
        changed = true;
      }
      if (entries.length < 30) break;
      await sleep(1000);
    }
  }

  // 2. 最近見つけた判例で、判例集・裁判要旨がまだ空のものを再確認する（後から掲載されることがある）
  const limit = new Date(Date.now() - REFRESH_DAYS * 86400e3).toISOString().slice(0, 10);
  const pending = data.items.filter((i) => i.firstSeen >= limit && !i.source && !i.summary).slice(0, MAX_REFRESH);
  for (const old of pending) {
    await sleep(1000);
    const detail = old.url.match(/detail(\d)/)[1];
    const f = parseDetail(await get(old.url));
    const fresh = toItem(old.kind, old.id, detail, f, old.firstSeen);
    if (fresh.source !== old.source || fresh.summary !== old.summary || fresh.point !== old.point) {
      Object.assign(old, fresh);
      changed = true;
    }
  }

  if (!changed) { console.log("新着なし"); return; }
  data.items.sort((a, b) => (b.firstSeen + b.dateISO).localeCompare(a.firstSeen + a.dateISO));
  data.items = data.items.slice(0, MAX_ITEMS);
  data.skipped = data.skipped.slice(-2000);
  data.updated = today;
  const body = "// 自動生成（automation/watch.mjs）。手で編集しない。\nconst WATCH = " + JSON.stringify(data, null, 1) + ";\n";
  fs.writeFileSync(path, body);
  console.log(`追加 ${added} 件 / 合計 ${data.items.length} 件`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `added=${added}\n`);
}

if (typeof process !== "undefined" && process.argv?.[1]?.endsWith("watch.mjs")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
