# ページの型

1 枚ごとに、下から 1 つ選ぶ。組み合わせの見本は、このスキルの `assets/template.html`（全部の型が 1 枚ずつ入っている）。

どの型も外側は同じ。節の最初のページにだけ `data-section` を付ける（節名が題の上に出て、目次にも入る）。

```html
<section class="slide" data-section="節の名前">
  <h2>題</h2>
  <div class="body">
    …
    <p class="note">下端に出る補足。1〜2 行。</p>
  </div>
</section>
```

## 共通

| 型 | 使うとき | 部品 |
| --- | --- | --- |
| 表紙 | 1 枚目 | `section.slide.title` > `.panel`（資料名・回）＋ `.main`（題・名前） |
| 今日の流れ | 2 枚目 | `<ol class="toc" data-auto>`（節名が自動で入る） |
| ゴール・まとめ | 最大 3 項目 | `<ol class="big-list">` |
| 用語 | 定義を 1〜3 個 | `<dl class="terms" style="--w:200px">`。注意は `.terms.warn` |
| 箇条書き | 3 つまで | `<ul class="dots">` |
| 手順 | 番号付き | `<ol class="steps">` |
| 表 | 比べる・並べる | `<table class="tbl">`。数の表は `.ctr`、合計の行は `tr.sum` |
| 比較（2 列） | A と B を同じ形で | `.grid2`（見出し・図・説明の段がそろう） |
| 流れ | 3〜4 段の順番 | `.flow.same` > `.step` と `.arrow`。今の段は `.step.on` |

```html
<div class="grid2">
  <div class="label">A の見出し</div>      <div class="label">B の見出し</div>
  <div class="win editor">…</div>          <div class="win term">…</div>
  <p class="small">A の説明</p>            <p class="small">B の説明</p>
</div>

<div class="flow same">
  <div class="step"><span class="k">決める</span>何を作るか</div><div class="arrow"></div>
  <div class="step"><span class="k">頼む</span>AI に伝える</div><div class="arrow"></div>
  <div class="step on"><span class="k">確かめる</span>テストを通す</div>
</div>
```

## 数式・グラフ

| 型 | 使うとき | 組み方 |
| --- | --- | --- |
| 式の読み方 | 記号や公式を初めて出す | 主役の式（`.disp`）に役割色、横か下に部品ごとの説明。3 列で下に並べるなら `.parts` |
| 公式 | 定理・公式を示す | `.prob` の中に名前（`.label`）・条件・式。下に「数値で確認」を 1〜2 行、最後に `.terms.warn`（よくある間違い） |
| 例題 | 授業で解く | 上に問題文（`.prob`、小問は `<ol class="qs">`）、下は空ける。ヒントは `.note` |
| 導出 | 式変形を追う | 左に手順（`ol.steps`）、右に並べて見える表。消える項・残る項に赤ペン |
| グラフと読み取り | 増え方・最小点 | 左に SVG（`svg.chart` `.graph`）、右に読み取り 2〜3 点（`ul.dots.small`）。線の色と言葉を役割色でそろえる |
| 数の表 | 計算の経過 | `table.tbl.ctr`。授業で埋める欄は空欄 |
| 演習 | 学生が手を動かす | 問題・データ・提出物。解く場所を空ける |

```html
<!-- 式の読み方 -->
<div class="disp lg">$\displaystyle \ra{c}\,\frac{1-\rb{\delta}^{\rc{t}}}{1-\rb{\delta}}$</div>
<div class="parts">
  <div class="ra"><b>$c$</b><span>初項。毎年預ける額</span></div>
  <div class="rb"><b>$\delta$</b><span>公比。$1 + $ 利子率</span></div>
  <div class="rc"><b>$t$</b><span>項数。預けた回数</span></div>
</div>
```

式は `$…$`（文中）、`$$…$$` か `\[…\]`（別行立て）。赤ペンの丸囲みは `\circled{t-1}`。

## 画面の絵（プログラミング・ツールの説明）

| 型 | 使うとき | 部品 |
| --- | --- | --- |
| Zed の画面 | 画面のどこに何があるか | `.win.zed`。左にエージェント（`.zagent`）、中央にエディタ（`.zmain`）とその下のターミナル（`.zterm`）、右にファイル（`.zfiles`）。注目させる区画に `.on` |
| ターミナル | コマンドと結果 | `.win.term` > `.bar` ＋ `<pre>`。プロンプト `.p`、打つ文字 `.c`、`.ok` `.ng` |
| エディタ | コード | `.win.editor`。行は `<span class="ln">`。色分け `.k .s .n .cm .f .tag` |
| ブラウザ | 公開したページ | `.win.browser` > `.bar .url` ＋ `.page` |
| GitHub の履歴 | commit の並び | `.win.commits` > `.crow`（`.msg` `.hash`） |
| Excel | 表の見た目 | `.win.sheet` > `<table>` |
| AI に頼む | 演習の頼み方 | `.ask` > `.who`（「AI に頼む」）＋ 文。続けて確かめ方を `ol.steps` |
| 画面の読み方 | どこを見るか | 絵に `.circ`（丸囲み）と `.num`（番号）、下の `.terms` に同じ番号 |

絵の中の注記は `<span class="pen">← 初回だけ</span>`。コードの 1 行は折り返さない長さにする。
