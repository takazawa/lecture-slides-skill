// ページ画像を 9 枚ずつ 1 枚の一覧にする（全ページを目で見るため）。
//   node slides/sheet.mjs <ページ画像のフォルダ>   → 同じフォルダに sheet1.png, sheet2.png, …
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(process.argv[2]);
const files = fs.readdirSync(dir).filter((f) => /^p\d+\.png$/.test(f)).sort();
const CHROME = [
  process.env.CHROME_PATH,
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft/Edge/Application/msedge.exe'),
  process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft/Edge/Application/msedge.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
].filter(Boolean).find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
const browser = await puppeteer.launch({executablePath: CHROME, headless: true});
const page = await browser.newPage();
await page.setViewport({width: 2440, height: 1400});
for (let k = 0; k < files.length; k += 9) {
  const imgs = files.slice(k, k + 9).map((f) => `<img src="data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}" style="width:800px;height:450px">`).join('');
  await page.setContent(`<body style="margin:0;background:#555;display:grid;grid-template-columns:repeat(3,800px);gap:10px;padding:10px">${imgs}</body>`, {waitUntil: 'load'});
  const out = path.join(dir, `sheet${k / 9 + 1}.png`);
  await page.screenshot({path: out});
  console.log(out);
}
await browser.close();
