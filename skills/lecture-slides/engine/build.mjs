// HTML スライドを PDF にし、機械チェックをする（スキル lecture-slides の部品）。
//   node slides/build.mjs <slides.html> [出力.pdf] [--png 画像のフォルダ]
//   出力.pdf を省くと slides.html と同じフォルダに「フォルダ名.pdf」を出す。--png を省くと、OS の一時フォルダに出す。
// ブラウザは Chrome か Microsoft Edge を自動で探す（Windows・macOS・Linux）。見つからなければ環境変数 CHROME_PATH で指定する。
// 数式は KaTeX。deck.js が描き終えると window.__mathDone = true にする。それを待ってから調べる。
// 1 枚ずつ 1280×720 の画面に出して、次のものを一覧にする。
//   1. 画面の外：文字がスライドの外に出ている
//   2. 枠からはみ出し：文字が、それを囲む一番近い枠（背景色かふちのある箱）から出ている
//   3. 隠れている：文字の上に別の部品（背景色・ふちのある箱や画像）が重なっている
//   4. 箱の重なり：親子でない箱どうしが重なっている（図の重なり）
//   5. 文字の重なり：別々の文字どうしが重なっている
//   6. 下にはみ出し：本文（.body）の中身が、本文の高さに入りきっていない
//   7. 1〜2 文字だけの行：折り返しで最後の行に 1〜2 文字だけが落ちている
//   8. 切れている：窓の絵など overflow で隠す枠の外に文字が出て、見えていない
//   9. コードの折り返し：エディタやターミナルの 1 行が幅に収まらず折り返されている
//  10. 数式の描画漏れ：KaTeX のエラーと、描かれずに残った $
//  11. 枠の大きさの不揃い：横に並ぶ枠の高さ・上端、同じ親で縦に積む枠の幅・左端（わざとなら data-size-ok）
//  12. 読めない色：文字と地のコントラスト比が 3 未満（わざとなら data-contrast-ok）
//  13. 小さい文字：14px 未満（わざとなら data-small-ok）
//  14. 役割色の相手がない：.ra .rb .rc が 1 枚に 1 か所だけ
//  15. PDF の半透明の画像：/SMask が残っている（ビューアで灰色の四角になる）
// わざと重ねる部品（矢印の線など）は data-layout-ok を付けると調べない。
// 1 件でも見つかれば終了コード 1（PDF は作る）。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';

const args = process.argv.slice(2);
const pngIdx = args.indexOf('--png');
const pngArg = pngIdx >= 0 ? args[pngIdx + 1] : null;
const [src, outArg] = args.filter((_, i) => pngIdx < 0 || (i !== pngIdx && i !== pngIdx + 1));
if (!src) {
  console.error('使い方: node slides/build.mjs <slides.html> [出力.pdf] [--png 画像のフォルダ]');
  process.exit(2);
}
const dirName = path.basename(path.dirname(path.resolve(src)));
const out = outArg ?? path.join(path.dirname(path.resolve(src)), `${dirName}.pdf`);
const pngDir = pngArg ?? path.join(os.tmpdir(), 'slides_png', dirName);

// Chrome か Edge を探す
const candidates = [
  process.env.CHROME_PATH,
  // Windows
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
  // macOS
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  // Linux
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
].filter(Boolean);
const CHROME = candidates.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!CHROME) {
  console.error('Chrome か Microsoft Edge が見つからない。入れるか、環境変数 CHROME_PATH にブラウザの場所を指定する。');
  process.exit(2);
}

const browser = await puppeteer.launch({executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb']});
const page = await browser.newPage();
await page.setViewport({width: 1280, height: 720, deviceScaleFactor: 1.5});
await page.goto(pathToFileURL(path.resolve(src)).href, {waitUntil: 'networkidle0'});
// KaTeX の描画と、その字体の読み込みを待つ
await page.waitForFunction(() => window.__mathDone === true || !document.querySelector('script[src*="katex"]'), {timeout: 30000});
await page.evaluate(async () => { document.body.getBoundingClientRect(); await document.fonts.ready; });

// 1 枚だけを画面の左上に出すための CSS
await page.addStyleTag({content: `
  body.probe { background:#fff; }
  body.probe .slide { display:none; margin:0; }
  body.probe .slide.current { display:flex; }
`});

const count = await page.evaluate(() => document.querySelectorAll('.slide').length);
fs.mkdirSync(pngDir, {recursive: true});

const all = [];
for (let i = 0; i < count; i++) {
  const issues = await page.evaluate((i) => {
    document.body.classList.add('probe');
    const slides = [...document.querySelectorAll('.slide')];
    slides.forEach((s, j) => s.classList.toggle('current', j === i));
    const slide = slides[i];
    const W = 1280, H = 720, TOL = 3;
    const S = slide.getBoundingClientRect();
    const out = [];
    const box = (r) => `${Math.round(r.left)},${Math.round(r.top)}〜${Math.round(r.right)},${Math.round(r.bottom)}`;
    const visibility = (el) => {
      let v = 1;
      for (let e = el; e && e instanceof Element; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
        v *= Number(cs.opacity);
      }
      return v;
    };
    const style = (el) => {
      const cs = getComputedStyle(el);
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
      const alpha = m ? Number(m[1].split(',')[3] ?? 1) : 0;
      const border = ['top', 'right', 'bottom', 'left'].some((s) => parseFloat(cs.getPropertyValue(`border-${s}-width`)) > 0);
      return {alpha, border};
    };
    const isFull = (r) => r.width >= W * 0.95 && r.height >= H * 0.95;
    // 枠：背景色かふちのある要素（スライドそのものは除く）
    const isBox = (el) => {
      if (!(el instanceof HTMLElement) || el === slide) return false;
      // KaTeX の中の部品（分数の横線など）は枠とみなさない
      if (el.closest('.katex')) return false;
      const r = el.getBoundingClientRect();
      // 線（矢印の軸など）は枠とみなさない。文中の inline の要素（code など）は折り返しで矩形が広がるので除く
      if (r.width < 8 || r.height < 8 || getComputedStyle(el).display === 'inline') return false;
      const {alpha, border} = style(el);
      return (alpha > 0 || border) && !isFull(r);
    };
    const covers = (el) => {
      if (!(el instanceof HTMLElement || el instanceof SVGElement) || visibility(el) < 0.5) return false;
      if (el === slide || el.contains(slide)) return false;
      if (el instanceof HTMLImageElement) return true;
      if (!(el instanceof HTMLElement)) return false;
      const {alpha, border} = style(el);
      return alpha > 0.5 || border;
    };
    const textRects = [];
    const seenBase = new Set();
    const blocks = new Map();
    const walker = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const raw = node.textContent ?? '';
      const text = raw.trim();
      const parent = node.parentElement;
      // KaTeX の読み上げ用の MathML（見えない）は調べない
      if (!text || !parent || visibility(parent) < 0.2 || parent.closest('[data-layout-ok], .katex-mathml')) continue;
      // 見える字だけの範囲（空白は数えない）。行ごとの矩形も取る
      const range = document.createRange();
      let r = null;
      const lines = [];
      for (let k = 0; k < raw.length; k++) {
        if (/\s/.test(raw[k])) continue;
        range.setStart(node, k); range.setEnd(node, k + 1);
        const c = range.getBoundingClientRect();
        if (c.width === 0 && c.height === 0) continue;
        r = r ? new DOMRect(Math.min(r.left, c.left), Math.min(r.top, c.top), Math.max(r.right, c.right) - Math.min(r.left, c.left), Math.max(r.bottom, c.bottom) - Math.min(r.top, c.top)) : c;
        const last = lines[lines.length - 1];
        if (last && Math.min(last.bottom, c.bottom) - Math.max(last.top, c.top) > Math.min(last.bottom - last.top, c.height) / 2) {
          last.right = Math.max(last.right, c.right); last.bottom = Math.max(last.bottom, c.bottom); last.left = Math.min(last.left, c.left);
        } else lines.push({left: c.left, top: c.top, right: c.right, bottom: c.bottom});
      }
      if (!r) continue;
      const label = text.slice(0, 24);
      // 1. 画面の外
      const outside = Math.max(S.left - r.left, S.top - r.top, r.right - S.right, r.bottom - S.bottom);
      if (outside > TOL) out.push({kind: '画面の外', text: label, over: Math.round(outside), where: `文字 ${box(r)}`});
      // 3. 隠れている
      for (const ln of lines) {
        const y = (ln.top + ln.bottom) / 2;
        let hit = null;
        for (const x of [ln.left + (ln.right - ln.left) * 0.15, (ln.left + ln.right) / 2, ln.right - (ln.right - ln.left) * 0.15]) {
          if (x < 0 || y < 0 || x > W || y > H) continue;
          for (const el of document.elementsFromPoint(x, y)) {
            if (el === parent || parent.contains(el) || el.contains(parent)) break;
            if (!el.closest('[data-layout-ok]') && covers(el)) { hit = el; break; }
          }
          if (hit) break;
        }
        if (hit) { out.push({kind: '隠れている', text: label, over: 0, where: `文字 ${box(r)} ／ 上の部品 ${box(hit.getBoundingClientRect())}（${(hit.textContent ?? '').trim().slice(0, 12) || hit.tagName.toLowerCase()}）`}); break; }
      }
      // 8. 切れている：overflow で隠れる祖先（窓の絵など）の外に文字が出ていて、見えていない
      for (let e = parent; e && e !== slide; e = e.parentElement) {
        const ov = getComputedStyle(e).overflow;
        if (!/hidden|clip/.test(ov)) continue;
        const b = e.getBoundingClientRect();
        const over = Math.max(b.left - r.left, b.top - r.top, r.right - b.right, r.bottom - b.bottom);
        if (over > TOL) out.push({kind: '切れている', text: label, over: Math.round(over), where: `文字 ${box(r)} ／ 窓 ${box(b)}`});
        break;
      }
      // 9. コードの折り返し：pre の中の 1 行が窓の幅で折り返されている
      const pre = parent.closest('pre');
      const own = raw.split('\n').filter((x) => x.trim()).length;
      if (pre && lines.length > own && !pre.dataset.wrapOk) out.push({kind: 'コードの折り返し', text: label, over: 0, where: `${own} 行のはずが ${lines.length} 行`});
      // 2. 一番近い枠からはみ出し
      for (let e = parent; e && e !== slide; e = e.parentElement) {
        if (!isBox(e)) continue;
        const b = e.getBoundingClientRect();
        const over = Math.max(b.left - r.left, b.top - r.top, r.right - b.right, r.bottom - b.bottom);
        if (over > TOL) out.push({kind: '枠からはみ出し', text: label, over: Math.round(over), where: `文字 ${box(r)} ／ 枠 ${box(b)}`});
        break;
      }
      // 7 のために、文字の矩形を、それを含む段落（一番近い block の要素）ごとに集める
      let blk = parent;
      while (blk !== slide && getComputedStyle(blk).display.startsWith('inline')) blk = blk.parentElement;
      // 数式の中の字は、分数・添え字で行が分かれて見えるので、7 では数式の折り返さない 1 かたまり（.katex-base。別行立ての式は全体）ごとに 1 つの矩形として数える
      const kb = parent.closest('.katex-display') ?? parent.closest('.katex-base, .katex .base');
      if (kb) {
        if (!seenBase.has(kb)) {
          seenBase.add(kb);
          let kblk = kb.closest('.katex-display') ?? kb.closest('.katex').parentElement;
          while (kblk !== slide && getComputedStyle(kblk).display.startsWith('inline')) kblk = kblk.parentElement;
          const br = kb.getBoundingClientRect();
          if (!blocks.has(kblk)) blocks.set(kblk, {label, lines: []});
          const bl = blocks.get(kblk).lines;
          const ln = {left: br.left, top: br.top, right: br.right, bottom: br.bottom};
          const last = bl[bl.length - 1];
          if (last && Math.min(last.bottom, ln.bottom) - Math.max(last.top, ln.top) > Math.min(last.bottom - last.top, ln.bottom - ln.top) / 2) { last.left = Math.min(last.left, ln.left); last.right = Math.max(last.right, ln.right); }
          else bl.push(ln);
        }
      } else if (!parent.closest('pre, .katex')) {
        if (!blocks.has(blk)) blocks.set(blk, {label, lines: []});
        const bl = blocks.get(blk).lines;
        for (const ln of lines) {
          const last = bl[bl.length - 1];
          if (last && Math.min(last.bottom, ln.bottom) - Math.max(last.top, ln.top) > Math.min(last.bottom - last.top, ln.bottom - ln.top) / 2) { last.left = Math.min(last.left, ln.left); last.right = Math.max(last.right, ln.right); }
          else bl.push({...ln});
        }
      }
      for (const ln of lines) textRects.push({node, label, ...ln});
    }
    // 7. 折り返した段落の最後の行が 1〜2 文字だけ（「と」「る」が次の行に落ちる）
    for (const {label, lines} of blocks.values()) {
      if (lines.length < 2) continue;
      const last = lines[lines.length - 1];
      if (last.right - last.left < (last.bottom - last.top) * 2.2) out.push({kind: '1〜2 文字だけの行', text: label, over: 0, where: `最後の行 ${box(last)}`});
    }
    // 5. 文字の重なり（別々の文字どうし）
    const inter = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOL && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOL;
    for (let a = 0; a < textRects.length; a++) for (let b = a + 1; b < textRects.length; b++) {
      const A = textRects[a], B = textRects[b];
      // 同じ数式の中の字どうし（添え字・分数など）は KaTeX が組んだものなので除く
      const kA = A.node.parentElement?.closest('.katex'), kB = B.node.parentElement?.closest('.katex');
      if (kA && kA === kB) continue;
      if (A.node !== B.node && inter(A, B)) out.push({kind: '文字の重なり', text: `${A.label} ／ ${B.label}`, over: 0, where: `${box(A)} ／ ${box(B)}`});
    }
    // 4. 箱の重なり（親子でない箱どうし）
    const boxes = [...slide.querySelectorAll('*')].filter((el) => isBox(el) && visibility(el) > 0.2 && !el.closest('[data-layout-ok]') && !el.closest('.foot'));
    for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
      const A = boxes[a], B = boxes[b];
      if (A.contains(B) || B.contains(A)) continue;
      const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
      if (inter(ra, rb)) out.push({kind: '箱の重なり', text: `${(A.textContent ?? '').trim().slice(0, 12)} ／ ${(B.textContent ?? '').trim().slice(0, 12)}`, over: 0, where: `${box(ra)} ／ ${box(rb)}`});
    }
    // 11. 枠の大きさの不揃い：ほかの枠に入っていない大きな枠どうしで、横に並ぶなら高さ、縦に積むなら幅と左端をそろえる
    const isFrame = (el) => {
      if (/^(TD|TH|TR|DT|DD|LI|TABLE|TBODY|THEAD)$/.test(el.tagName)) return false;
      const cs = getComputedStyle(el);
      const sides = ['top', 'right', 'bottom', 'left'].filter((x) => parseFloat(cs.getPropertyValue(`border-${x}-width`)) > 0).length;
      const bg = cs.backgroundColor.replace(/\s/g, '');
      const filled = style(el).alpha > 0 && !/^rgba?\(255,255,255/.test(bg);
      return sides >= 3 || filled || /\b(win|term|editor|browser|sheet)\b/.test(el.className);
    };
    const frames = boxes.filter(isFrame);
    const outer = frames.filter((el) => { const r = el.getBoundingClientRect(); return r.width >= 100 && r.height >= 40 && !frames.some((o) => o !== el && o.contains(el)) && !el.closest('[data-size-ok]'); });
    for (let a = 0; a < outer.length; a++) for (let b = a + 1; b < outer.length; b++) {
      const ra = outer[a].getBoundingClientRect(), rb = outer[b].getBoundingClientRect();
      const name = `${(outer[a].textContent ?? '').trim().slice(0, 10)} ／ ${(outer[b].textContent ?? '').trim().slice(0, 10)}`;
      const vOver = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      const hOver = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      if (vOver > Math.min(ra.height, rb.height) * 0.5 && hOver <= 0) {
        if (Math.abs(ra.height - rb.height) > 6 || Math.abs(ra.top - rb.top) > 6) out.push({kind: '横に並ぶ枠の高さ・上端の不揃い', text: name, over: Math.round(Math.max(Math.abs(ra.height - rb.height), Math.abs(ra.top - rb.top))), where: `${box(ra)} ／ ${box(rb)}`});
      } else if (hOver > Math.min(ra.width, rb.width) * 0.5 && vOver <= 0 && outer[a].parentElement === outer[b].parentElement) {
        if (Math.abs(ra.width - rb.width) > 6 || Math.abs(ra.left - rb.left) > 6) out.push({kind: '縦に積む枠の幅・左端の不揃い', text: name, over: Math.round(Math.max(Math.abs(ra.width - rb.width), Math.abs(ra.left - rb.left))), where: `${box(ra)} ／ ${box(rb)}`});
      }
    }
    // 12. 読めない色：文字と、その下の地の色の差が小さい（白地に白など。コントラスト比 3 未満）
    // 13. 小さい文字：14px 未満（投影しても印刷しても読めない）
    {
      const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number); return {r: p[0], g: p[1], b: p[2], a: p[3] ?? 1}; };
      const lum = ({r, g, b}) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c; } return {r: 255, g: 255, b: 255, a: 1}; };
      const seen = new Set();
      const w = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const p = n.parentElement; const t = (n.textContent ?? '').trim();
        if (!t || !p || seen.has(p) || visibility(p) < 0.2 || p.closest('.katex-mathml, [data-layout-ok], svg, script, style')) continue;
        seen.add(p);
        const cs = getComputedStyle(p); const fg = rgb(cs.color); if (!fg) continue;
        const L1 = lum(fg), L2 = lum(bgOf(p)); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (ratio < 3 && !p.closest('[data-contrast-ok]')) out.push({kind: '読めない色', text: t.slice(0, 24), over: 0, where: `コントラスト比 ${ratio.toFixed(1)}（3 以上にする）`});
        const fs = parseFloat(cs.fontSize);
        if (fs < 14 && !p.closest('.katex, [data-small-ok]')) out.push({kind: '小さい文字', text: t.slice(0, 24), over: 0, where: `${fs}px（14px 以上にする）`});
      }
    }
    // 14. 役割色の相手がない：役割色（.ra .rb .rc）は「式の部品」と「その説明」を同じ色で結ぶもの。1 枚に 1 か所だけなら、結ぶ相手がない
    for (const k of ['ra', 'rb', 'rc']) {
      const n = slide.querySelectorAll('.' + k).length;
      if (n === 1) out.push({kind: '役割色の相手がない', text: (slide.querySelector('.' + k).textContent ?? '').trim().slice(0, 16), over: 0, where: `.${k} が 1 か所だけ。式と説明の両方に付けるか、やめる`});
    }
    // 10. 数式の描画漏れ
    for (const e of slide.querySelectorAll('.katex-error')) out.push({kind: '数式のエラー', text: (e.textContent ?? '').slice(0, 24), over: 0, where: e.getAttribute('title') ?? ''});
    {
      const w = document.createTreeWalker(slide, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!window.renderMathInElement || n.parentElement?.closest('.katex, script, style, code, pre')) continue;
        if (/\$|\\\(|\\\[/.test(n.textContent ?? '')) out.push({kind: '数式の描画漏れ', text: (n.textContent ?? '').trim().slice(0, 24), over: 0, where: 'KaTeX で描かれずに残った記号'});
      }
    }
    // 6. 本文が入りきっていない
    const body = slide.querySelector(':scope > .body');
    if (body && body.scrollHeight > body.clientHeight + TOL) out.push({kind: '下にはみ出し', text: '本文', over: body.scrollHeight - body.clientHeight, where: `本文の高さ ${body.clientHeight}px に対し中身 ${body.scrollHeight}px`});
    return out;
  }, i);
  const title = await page.evaluate((i) => document.querySelectorAll('.slide')[i].querySelector('h2, h1')?.textContent?.trim() ?? '', i);
  for (const it of issues) all.push({page: i + 1, title, ...it});
  await page.screenshot({path: path.join(pngDir, `p${String(i + 1).padStart(2, '0')}.png`)});
}

// PDF は全部を元の並びに戻して出す
await page.evaluate(() => {
  document.body.classList.remove('probe');
  document.querySelectorAll('.slide').forEach((s) => s.classList.remove('current'));
});
await page.emulateMediaType('print');
await page.pdf({path: out, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true});
await browser.close();

console.log(`${count} 枚 → ${out}`);
console.log(`ページ画像 → ${pngDir}（node slides/sheet.mjs で 9 枚ずつの一覧にできる）`);
// 15. PDF の半透明の画像：影・模様・絵文字などは、PDF で半透明の画像（/SMask）になり、ビューアによっては灰色の四角に化ける
{
  const smask = (fs.readFileSync(out).toString('latin1').match(/\/SMask/g) ?? []).length;
  if (smask) all.push({page: 0, title: 'PDF 全体', kind: 'PDF の半透明の画像', text: `${smask} 個`, over: 0, where: '影（box-shadow）・SVG の pattern・絵文字・半透明の画像を使っていないか'});
}
if (all.length) {
  console.log(`\n機械チェック ${all.length} 件`);
  for (const a of all) console.log(`  p${a.page}「${a.title}」${a.kind}${a.over ? `（${a.over}px）` : ''}：${a.text}（${a.where}）`);
  process.exit(1);
}
console.log('機械チェック 0 件');
