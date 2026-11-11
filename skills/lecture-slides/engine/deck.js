// HTML スライドの共通スクリプト（スキル lecture-slides の部品）。
// ・data-section の節名を、その節の各スライドの題の上に出す（次の data-section まで続く）
// ・各 .slide の下に「資料名・回」とページ番号を足す（表紙は除く）
// ・<ol class="toc" data-auto> に、節名を並べる
// ・KaTeX が読み込まれていれば、$…$・$$…$$・\[…\] を描く。終わると window.__mathDone = true
//   役割色のマクロ: \ra{…} \rb{…} \rc{…}（式の部品と説明を同じ色で結ぶ）。赤ペンの丸囲みは \circled{…}
// 資料名と回は <body data-course="..." data-lecture="..."> から読む（回は省いてよい）。
(() => {
  const slides = [...document.querySelectorAll('.slide')];
  const course = document.body.dataset.course ?? '';
  const lecture = document.body.dataset.lecture ?? '';
  let section = '';
  slides.forEach((s, i) => {
    if (s.dataset.section) section = s.dataset.section;
    if (s.classList.contains('title')) return;
    const h2 = s.querySelector(':scope > h2');
    if (h2 && section && !s.querySelector(':scope > .eyebrow')) {
      const eb = document.createElement('div');
      eb.className = 'eyebrow';
      eb.textContent = section;
      s.insertBefore(eb, h2);
    } else if (h2) {
      h2.style.marginTop = '46px';
    }
    const foot = document.createElement('div');
    foot.className = 'foot';
    foot.innerHTML = `<span><b>${course}</b>　${lecture}</span><span>${i + 1} / ${slides.length}</span>`;
    s.appendChild(foot);
  });
  for (const toc of document.querySelectorAll('ol.toc[data-auto]')) {
    for (const s of slides.filter((s) => s.dataset.section)) {
      const li = document.createElement('li');
      li.textContent = s.dataset.section;
      toc.appendChild(li);
    }
  }
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '\\[', right: '\\]', display: true},
        {left: '$', right: '$', display: false},
      ],
      macros: {
        '\\ra': '\\htmlClass{ra}{#1}',
        '\\rb': '\\htmlClass{rb}{#1}',
        '\\rc': '\\htmlClass{rc}{#1}',
        '\\circled': '\\htmlClass{circ}{#1}',
      },
      trust: (ctx) => ctx.command === '\\htmlClass',
      output: 'html',
      strict: false,
      throwOnError: false,
    });
  }
  window.__mathDone = true;
})();
