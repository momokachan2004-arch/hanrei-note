// 判例データの入れ物。中身は data/ フォルダに分野ごとに入っている。
//   data/company.js（会社法） data/securities.js（金商法） data/antitrust.js（独禁法）
//   data/privacy.js（個人情報・プライバシー） data/civil.js（民法） data/labor.js（労働法）
//
// 1件の書き方:
// {
//   id: "英数字の短い名前（重複しないように）",
//   title: "事件名", court: "最高裁第一小法廷", date: "平成22年7月15日", source: "民集○巻○号○頁",
//   url: "https://www.courts.go.jp/hanrei/番号/detail2/index.html",   ← 裁判所サイトに掲載がなければ書かない
//   area: "会社法",   ← 新しい分野名を書けば絞り込みボタンが自動で増える
//   topics: ["論点", ...],
//   facts: "事案", holding: "判旨（要約）", commentary: "解説",
//   points: ["実務ポイント", ...], articles: ["関連条文", ...]
// }
// 判旨は原文ではなく要約。裁判所サイトの「裁判要旨」をもとに書いている。
// 追加・修正したら sw.js の VERSION の数字を1つ上げる。
const CASES = [];
