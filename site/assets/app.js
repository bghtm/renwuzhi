/* ==========================================================================
   跨圈人物志 · 极速版 — front-end
   Hash routes:  #/                home (ordered list + extras + resources)
                 #/ep/<id>         episode page (player + deck viewer)
                 #/ep/<id>/s/<n>   same, opened at slide n
   ========================================================================== */
(function () {
  'use strict';

  var viewHome = document.getElementById('view-home');
  var viewEp = document.getElementById('view-ep');
  var topbarProgress = document.getElementById('topbarProgress');
  var footerNote = document.getElementById('footerNote');

  var state = {
    data: null,
    route: { name: 'home' },
    slide: 1,
    autoplay: false,
    homeScroll: 0,
    detail: null
  };

  var PROGRESS_KEY = 'kw-progress-v1';
  var syncNavRaf = 0;

  /* ------------------------------------------------------------------ utils */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function byId(id) {
    if (!state.data) return null;
    var all = state.data.episodes.concat(state.data.extras);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  function nextOf(item) {
    if (!item || item.kind !== 'episode') return null;
    var list = state.data.episodes;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === item.id) return list[i + 1] || null;
    }
    return null;
  }

  /* progress memory ------------------------------------------------------- */
  function readProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeProgress(p) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
  }
  function savedTime(id) {
    var p = readProgress()[id];
    return p && p.t > 5 ? p.t : 0;
  }
  function saveTime(id, t, d) {
    var p = readProgress();
    if (!t || t < 5 || (d && t > d - 15)) delete p[id];
    else p[id] = { t: Math.round(t), d: Math.round(d || 0), at: Date.now() };
    writeProgress(p);
  }

  /* ------------------------------------------------------------------ icons */
  var ICO = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.4 0-1.8L9.6 4.3C8.9 3.9 8 4.4 8 5.2z"/></svg>',
    deck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M12 16.5V21M8 21h8"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v11m0 0 4.2-4.2M12 14.5 7.8 10.3"/><path d="M4.5 19.5h15"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5V4h5.5M20 14.5V20h-5.5M20 9.5V4h-5.5M4 14.5V20h5.5"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 11l6-3.2v8.4l-6-3.2z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5h7l5 5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M13 3.5V9h5"/></svg>'
  };

  /* --------------------------------------------------------------- home view */
  function cardHTML(item) {
    var isEp = item.kind === 'episode';
    var badge = isEp
      ? '<span class="card-num">第 ' + item.numText + ' 期</span>'
      : '<span class="card-num is-tag">' + esc(item.tag) + '</span>';
    var topic = item.topic
      ? '<p class="card-topic">' + esc(item.topic) + '</p>'
      : '<p class="card-topic is-empty">' + esc(item.summary) + '</p>';

    var chips = '';
    var shown = item.guests.slice(0, 4);
    for (var i = 0; i < shown.length; i++) chips += '<li class="chip">' + esc(shown[i]) + '</li>';
    if (item.guests.length > shown.length) {
      chips += '<li class="chip chip-more">+' + (item.guests.length - shown.length) + '</li>';
    }

    var t = savedTime(item.id);
    var prog = t && item.video && item.video.duration
      ? '<span class="card-progress" style="width:' + clamp((t / item.video.duration) * 100, 2, 100).toFixed(1) + '%"></span>'
      : '';

    var deckBtn = item.slides && item.slides.length
      ? '<a class="mini" href="#/ep/' + item.id + '/s/1">' + ICO.deck + ' 幻灯片 ' + item.slides.length + ' 页</a>'
      : '';
    var dlBtn = '<a class="mini icon" href="' + (item.ppt ? item.ppt.download : item.video.download) +
      '" download title="下载' + (item.ppt ? ' PPT' : '视频') + '" aria-label="下载' + (item.ppt ? ' PPT' : '视频') + '">' +
      ICO.down + '</a>';

    return '' +
      '<article class="card" data-id="' + item.id + '">' +
        '<div class="card-cover">' +
          '<a class="cover-link" href="#/ep/' + item.id + '" aria-label="打开 ' + esc(item.title) + '">' +
            '<img src="' + item.coverThumb + '" alt="' + esc(item.title) + ' 封面" loading="lazy" width="560" height="315">' +
          '</a>' +
          badge +
          '<button class="card-play" type="button" data-play="' + item.id + '" aria-label="播放 ' + esc(item.title) + '">' + ICO.play + '</button>' +
          '<span class="card-dur">' + esc(item.video ? item.video.durationText : '') + '</span>' +
          prog +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title"><a href="#/ep/' + item.id + '">' + esc(item.title) + '</a></h3>' +
          topic +
          (chips ? '<ul class="chips">' + chips + '</ul>' : '') +
          '<div class="card-actions">' +
            '<a class="mini primary" href="#/ep/' + item.id + '" data-play="' + item.id + '">' + ICO.play + ' 播放</a>' +
            deckBtn + dlBtn +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function resHTML(r) {
    return '' +
      '<article class="res">' +
        '<a class="res-thumb" href="' + r.ppt.download + '" download aria-label="下载 ' + esc(r.title) + '">' +
          '<img src="' + r.thumb + '" alt="' + esc(r.title) + ' 预览" loading="lazy">' +
        '</a>' +
        '<div class="res-body">' +
          '<h3>' + esc(r.title) + '</h3>' +
          '<p class="res-note">' + esc(r.note) + '</p>' +
          '<div class="res-foot">' +
            '<span class="res-meta">' + (r.ppt ? r.ppt.slides + ' 页 · ' + r.ppt.sizeText : '') + '</span>' +
            '<a class="mini" href="' + r.ppt.download + '" download>' + ICO.down + ' 下载 PPT</a>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function seriesById(id) {
    var list = state.data.series || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function bySeries(id, kind) {
    var all = state.data.episodes.concat(state.data.extras);
    return all.filter(function (e) {
      return e.series === id && (!kind || e.kind === kind);
    });
  }

  function tileHTML(s) {
    var eps = bySeries(s.id, 'episode');
    var collections = bySeries(s.id, 'extra');
    var dark = s.accent === 'dark';
    var covers = eps.filter(function (i) { return i.coverThumb; }).slice(0, 3);
    var coverHtml = covers.map(function (i) { return '<img src="' + i.coverThumb + '" alt="">'; }).join('');
    return '' +
      '<a class="tile ' + (dark ? 'tile-dark' : 'tile-light') + '" href="#/" data-scroll="series-' + s.id + '">' +
        '<span class="tile-kicker">' + esc(s.kicker) + '</span>' +
        '<h3>' + esc(s.name) + '<em>' + esc(s.suffix) + '</em></h3>' +
        '<p class="tile-desc">' + esc(s.tagline) + '</p>' +
        '<div class="tile-covers' + (covers.length === 1 ? ' tile-covers-single' : '') + '">' +
          (coverHtml || '<span class="tile-empty">更新中</span>') + '</div>' +
        '<div class="tile-foot">' +
          '<span class="tile-count"><b>' + s.count + '</b> 期正片' +
            (collections.length ? ' · <b>' + collections.length + '</b> 个合集' : '') +
            ' · <b>' + s.slides + '</b> 页幻灯片</span>' +
          '<span class="tile-go">进入 →</span>' +
        '</div>' +
      '</a>';
  }

  function ghostCardHTML(s) {
    return '' +
      '<article class="card card-ghost">' +
        '<div class="ghost-top"><span class="ghost-badge">NEXT</span></div>' +
        '<div class="ghost-body">' +
          '<h3>下一期正在整理</h3>' +
          '<p>欢迎在评论区补充' + esc(s.short) + '人物与可核实的公开资料；投稿不代表一定收录。</p>' +
          '<a class="mini" href="#/" data-scroll="about">投稿与说明</a>' +
        '</div>' +
      '</article>';
  }

  function seriesSectionHTML(s) {
    var eps = bySeries(s.id, 'episode');
    var collections = bySeries(s.id, 'extra');
    return '' +
      '<section class="section series-section" id="series-' + s.id + '" data-series="' + s.id + '">' +
        '<div class="section-head series-head">' +
          '<div>' +
            '<p class="kicker">' + esc(s.kicker) + '</p>' +
            '<h2><span class="series-dot ' + (s.accent === 'dark' ? 'dot-dark' : 'dot-pink') + '"></span>' +
              esc(s.name) + '<span class="series-suffix">' + esc(s.suffix) + '</span></h2>' +
            '<p class="sub">' + esc(s.blurb) + '</p>' +
          '</div>' +
          '<span class="count">' + s.count + ' 期 · ' + s.slides + ' 页幻灯片</span>' +
        '</div>' +
        '<div class="grid">' +
          eps.map(cardHTML).join('') +
          (eps.length < 2 ? ghostCardHTML(s) : '') +
        '</div>' +
        (collections.length ?
          '<div class="subhead"><h3>合集与补充</h3><span>共 ' + collections.length + ' 个</span></div>' +
          '<div class="grid">' + collections.map(cardHTML).join('') + '</div>' : '') +
      '</section>';
  }

  function renderHome() {
    var d = state.data;
    var site = d.site;
    var list = d.episodes;
    var odFirst = bySeries('od', 'episode')[0];
    var fan = [list[4], list[10], odFirst || list[1]];
    var lastKuake = bySeries('kuake', 'episode');
    lastKuake = lastKuake[lastKuake.length - 1];

    var html = '' +
      '<div class="wrap">' +
        '<section class="hero">' +
          '<div class="hero-copy">' +
            '<p class="kicker">PERSONA ARCHIVE</p>' +
            '<h1><span class="hl">人物志档案</span></h1>' +
            '<p class="lede">跨圈人物志 · 药圈人物志 —— 两套各自独立的档案，记录人物行为中的成就与争议。</p>' +
            '<div class="pills">' +
              '<span class="pill pill-series"><b>2</b> 个系列</span>' +
              '<span class="pill"><b>' + site.stats.episodes + '</b> 期正片</span>' +
              '<span class="pill"><b>' + site.stats.slides + '</b> 张幻灯片</span>' +
              '<span class="pill"><b>' + site.stats.videos + '</b> 个视频</span>' +
              '<span class="pill pill-author">Made by ' + esc(site.author) + '</span>' +
            '</div>' +
            '<div class="hero-actions">' +
              '<a class="btn btn-primary" href="#/" data-scroll="series-kuake">' + ICO.play + ' 看跨圈人物志</a>' +
              '<a class="btn btn-ghost" href="#/" data-scroll="series-od">' + ICO.video + ' 看药圈人物志</a>' +
            '</div>' +
          '</div>' +
          (fan[0] ? '<div class="hero-stack" aria-hidden="true">' +
            '<figure class="hero-card hero-card-1"><img src="' + fan[0].coverThumb + '" alt=""></figure>' +
            '<figure class="hero-card hero-card-2"><img src="' + fan[1].coverThumb + '" alt=""></figure>' +
            '<figure class="hero-card hero-card-3"><img src="' + fan[2].coverThumb + '" alt=""></figure>' +
            '<span class="hero-note">共 ' + site.stats.episodes + ' 期 · ' + site.stats.videos + ' 个视频</span>' +
          '</div>' : '') +
        '</section>' +

        '<section class="section" id="catalogues">' +
          '<div class="section-head">' +
            '<div><h2><span class="mark"></span>两个大分类</h2>' +
            '<p class="sub">跨圈与药圈是两套独立的档案系列：不同的人物、不同的版式，各自按期数排列。点开任一分类即可直达它的期列表。</p></div>' +
            '<span class="count">共 ' + d.series.length + ' 个系列</span>' +
          '</div>' +
          '<div class="tiles">' + d.series.map(tileHTML).join('') + '</div>' +
        '</section>' +

        d.series.map(seriesSectionHTML).join('') +

        '<section class="section" id="resources">' +
          '<div class="section-head">' +
            '<div><h2><span class="mark"></span>资料与模板</h2>' +
            '<p class="sub">蓝粉白鱼板风格模板与说明页，原始 .pptx 可直接下载取用。</p></div>' +
            '<span class="count">共 ' + d.resources.length + ' 份</span>' +
          '</div>' +
          '<div class="res-grid">' + d.resources.map(resHTML).join('') + '</div>' +
        '</section>' +

        '<section class="section" id="about">' +
          '<div class="about">' +
            '<div class="about-main">' +
              '<h2>关于这两套档案</h2>' +
              '<p>《跨圈人物志》与《药圈人物志》都以公开资料为依据，记录人物行为中的成就与争议，尽量完整、克制地呈现每一种声音。' +
              '两者是彼此独立的系列：各自的人物名单、期数编号与配套 PPT 都不相同。</p>' +
              '<p class="about-rank">' + esc(site.rankNote) + '</p>' +
              '<p>' + esc(site.notice) + '</p>' +
              '<p>站内共 <strong>2 个系列</strong>、<strong>' + site.stats.episodes + ' 期正文视频</strong>、' +
              '<strong>' + site.stats.videos + ' 个视频文件</strong>（含第 1 期补充）与 ' +
              '<strong>' + site.stats.slides + ' 张幻灯片</strong>，全部可在线播放与下载。</p>' +
            '</div>' +
            '<div class="about-meta">' +
              '<span class="about-badge">开放投稿 · 欢迎在评论区补充</span>' +
              '<dl>' +
                '<dt>制作</dt><dd>' + esc(site.author) + '</dd>' +
                '<dt>账号</dt><dd>' + esc(site.handle) + '</dd>' +
                '<dt>跨圈</dt><dd>更新至第 ' + lastKuake.numText + ' 期</dd>' +
                '<dt>药圈</dt><dd>更新至第 ' + (odFirst ? odFirst.numText : '—') + ' 期</dd>' +
                '<dt>幻灯片</dt><dd>AI 生成 · 原版 .pptx</dd>' +
              '</dl>' +
              '<a class="btn btn-ghost btn-sm" href="#/ep/' + list[0].id + '">' + ICO.play + ' 从跨圈第 1 期开始</a>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>';

    viewHome.innerHTML = html;
    footerNote.textContent = site.rankNote + site.notice;
  }

  /* ------------------------------------------------------------- detail view */
  function deckHTML(item) {
    var slides = item.slides;
    if (!slides || !slides.length) return '';
    var thumbs = '';
    for (var i = 0; i < slides.length; i++) {
      thumbs += '<button class="thumb" type="button" data-i="' + (i + 1) + '" aria-label="第 ' + (i + 1) + ' 页">' +
        '<img src="' + slides[i] + '" alt="" loading="lazy"><span class="n">' + (i + 1) + '</span></button>';
    }
    return '' +
      '<section class="deck" id="deck">' +
        '<div class="deck-head">' +
          '<h2><span class="mark"></span>幻灯片<span class="pages">' + slides.length + ' 页</span></h2>' +
          '<div class="deck-tools">' +
            '<span class="hint"><kbd>←</kbd> <kbd>→</kbd> 翻页</span>' +
            '<button class="mini" type="button" id="fsBtn">' + ICO.expand + ' 全屏</button>' +
            (item.ppt ? '<a class="mini" href="' + item.ppt.download + '" download>' + ICO.down + ' 下载 PPT · ' + item.ppt.sizeText + '</a>' : '') +
          '</div>' +
        '</div>' +
        '<div class="stage" id="stage">' +
          '<div class="stage-frame" id="frame">' +
            '<img id="slideImg" alt="" draggable="false">' +
            '<button class="stage-nav prev" type="button" id="prevBtn" aria-label="上一页">' + ICO.chevL + '</button>' +
            '<button class="stage-nav next" type="button" id="nextBtn" aria-label="下一页">' + ICO.chevR + '</button>' +
            '<span class="stage-count" id="stageCount">1 / ' + slides.length + '</span>' +
            '<span class="stage-hint">点击画面翻页</span>' +
          '</div>' +
          '<div class="stage-track"><i id="stageTrack"></i></div>' +
        '</div>' +
        '<div class="thumbs" id="thumbs">' + thumbs + '</div>' +
      '</section>';
  }

  function versionSelectHTML(item) {
    if (!item.variants || !item.variants.length) return '';
    var opts = '<option value="0">标准版 · ' + item.video.durationText + '</option>';
    for (var i = 0; i < item.variants.length; i++) {
      opts += '<option value="' + (i + 1) + '">' + esc(item.variants[i].label) + '</option>';
    }
    return '<span class="version"><label for="verSel">版本</label>' +
      '<select class="select" id="verSel">' + opts + '</select></span>';
  }

  function renderDetail(item) {
    var isEp = item.kind === 'episode';
    var v = item.video;
    var next = nextOf(item);
    var s = seriesById(item.series);
    var seriesChip = s
      ? '<span class="series-chip ' + (s.accent === 'dark' ? 'chip-dark' : 'chip-pink') + '">' + esc(s.short) + '</span>'
      : '';
    var numBadge = isEp
      ? '<span class="detail-num">第 ' + item.numText + ' 期</span>'
      : '<span class="detail-num">' + esc(item.tag) + '</span>';

    var chips = '';
    for (var i = 0; i < item.guests.length; i++) chips += '<li class="chip">' + esc(item.guests[i]) + '</li>';

    var pagesMode = siteMode() === 'pages';
    // 线上播的是预转的 MP4；规格按它显示（本地则显示原片规格）
    var spec = (pagesMode && v.mp4) ? v.mp4 : null;
    var shownW = (spec && spec.width) ? spec.width : v.width;
    var shownH = (spec && spec.height) ? spec.height : v.height;
    var dlSize = (v.mp4 && v.mp4.bytes) ? humanBytes(v.mp4.bytes) : v.sizeText;
    var shownSize = spec && spec.bytes ? humanBytes(spec.bytes) : dlSize;

    var allFiles = '';
    allFiles += '<a class="file-row" href="' + v.download + '" download>' + ICO.video +
      '<span>视频 MP4</span><span class="size">' + dlSize + '</span></a>';
    for (var j = 0; j < item.variants.length; j++) {
      var vv = item.variants[j];
      if (!vv.download) continue;
      allFiles += '<a class="file-row" href="' + vv.download + '" download>' + ICO.video +
        '<span>' + esc(vv.label) + '</span><span class="size">' + vv.sizeText + '</span></a>';
    }
    if (item.ppt) {
      allFiles += '<a class="file-row" href="' + item.ppt.download + '" download>' + ICO.file +
        '<span>配套 PPT</span><span class="size">' + item.ppt.sizeText + '</span></a>';
    }
    var videoDlBtn = v.download
      ? '<a class="btn btn-primary btn-block" id="dlVideo" href="' + v.download + '" download>' + ICO.down + ' 下载视频 MP4 · ' + dlSize + '</a>'
      : '<p class="dl-note">这一期还没有可下载的 MP4（先跑 tools/make-mp4.py）。</p>';

    var navPrev = '', navNext = '';
    if (isEp) {
      var sibs = state.data.episodes.filter(function (e) { return e.series === item.series; });
      var idx = sibs.map(function (e) { return e.id; }).indexOf(item.id);
      var prev = sibs[idx - 1];
      navPrev = prev
        ? '<a class="btn btn-ghost" href="#/ep/' + prev.id + '">← 第 ' + prev.numText + ' 期</a>'
        : '<a class="btn btn-ghost" href="#/" aria-disabled="true">← 已是第一期</a>';
      navNext = next
        ? '<a class="btn btn-ghost" href="#/ep/' + next.id + '" data-play="' + next.id + '">第 ' + next.numText + ' 期 →</a>'
        : '<a class="btn btn-ghost" href="#/" aria-disabled="true">已是最后一期</a>';
    }

    viewEp.innerHTML = '' +
      '<div class="wrap detail">' +
        '<a class="back" href="#/">' + ICO.back + ' 返回列表</a>' +
        '<header class="detail-head">' +
          '<div class="detail-kicker">' + seriesChip + numBadge +
            '<span class="detail-kind">' + (isEp ? 'EPISODE' : 'EXTRA') + '</span>' +
          '</div>' +
          '<h1>' + esc(item.title) + '</h1>' +
          (item.topic ? '<p class="topic">' + esc(item.topic) + '</p>' : '') +
        '</header>' +

        '<div class="studio">' +
          '<div class="player-shell">' +
            '<div class="player">' +
              '<video id="vid" controls playsinline preload="metadata" poster="' + item.cover + '"></video>' +
              (next ? '<button class="player-next" type="button" id="nextEpBtn" hidden>下一期：' + esc(next.title) + ' →</button>' : '') +
            '</div>' +
            '<div class="player-bar">' +
              '<div class="player-meta">' +
                '<span>' + v.durationText + '</span><span class="dot"></span>' +
                '<span>' + shownW + ' × ' + shownH + '</span><span class="dot"></span>' +
                '<span>' + shownSize + '</span>' +
                '<span id="resumeNote" class="chip" hidden></span>' +
              '</div>' +
              versionSelectHTML(item) +
            '</div>' +
          '</div>' +

          '<aside class="info">' +
            '<h2>本期内容</h2>' +
            '<p class="summary">' + esc(item.summary) + '</p>' +
            (chips ? '<ul class="chips">' + chips + '</ul>' : '') +
            '<p class="info-sub">下载</p>' +
            videoDlBtn +
            (item.ppt ? '<a class="btn btn-ghost btn-block" href="' + item.ppt.download + '" download>' + ICO.deck + ' 幻灯片 PPT · ' + item.ppt.sizeText + '</a>' : '') +
            '<p class="info-sub">全部文件</p>' +
            '<div class="file-list">' + allFiles + '</div>' +
            '<div class="ep-nav">' + navPrev + navNext + '</div>' +
          '</aside>' +
        '</div>' +

        deckHTML(item) +
      '</div>';

    bindDetail(item);
  }

  /* ------------------------------------------------------------ video source */
  /* local 模式：/v/ 直接串流原片（画质最好；本地不在意单文件大小）
     pages 模式：用预转的 MP4（faststart + HTTP Range），浏览器原生播放，也能直接下载 */
  var hlsInstance = null;

  function siteMode() {
    return (state.data && state.data.site && state.data.site.mode) || 'local';
  }

  function destroyHls() {
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch (e) {}
      hlsInstance = null;
    }
  }

  function attachSource(vid, entry) {
    destroyHls();
    entry = entry || {};
    var pages = siteMode() === 'pages';
    var hasMp4 = !!(entry.mp4 && entry.mp4.src);
    var kind = 'none';

    if (pages) {
      if (hasMp4) { vid.src = entry.mp4.src; kind = 'mp4'; }
      else if (entry.hls) { return attachHls(vid, entry.hls.src); }
      else { showVideoError(); return 'none'; }
    } else if (entry.src) {
      vid.src = entry.src;
      kind = 'original';
    } else if (hasMp4) {
      vid.src = entry.mp4.src;
      kind = 'mp4';
    } else if (entry.hls) {
      return attachHls(vid, entry.hls.src);
    } else {
      showVideoError();
      return 'none';
    }

    vid.addEventListener('error', function onErr() {
      vid.removeEventListener('error', onErr);
      if (kind !== 'mp4' && hasMp4) { vid.src = entry.mp4.src; return; }
      if (entry.hls) { attachHls(vid, entry.hls.src); return; }
      showVideoError();
    });
    return kind;
  }

  function attachHls(vid, src) {
    var Hls = window.Hls;
    if (Hls && Hls.isSupported()) {
      hlsInstance = new Hls({ maxBufferLength: 40, backBufferLength: 30, enableWorker: true });
      hlsInstance.loadSource(src);
      hlsInstance.attachMedia(vid);
      hlsInstance.on(Hls.Events.ERROR, function (_e, data) {
        if (data && data.fatal) showVideoError();
      });
      return 'hls';
    }
    if (vid.canPlayType('application/vnd.apple.mpegurl')) {
      vid.src = src;
      return 'hls-native';
    }
    showVideoError();
    return 'none';
  }

  function bindDetail(item) {
    var vid = document.getElementById('vid');
    var verSel = document.getElementById('verSel');
    var dlVideo = document.getElementById('dlVideo');
    var resumeNote = document.getElementById('resumeNote');
    var nextEpBtn = document.getElementById('nextEpBtn');

    var current = item.video;
    vid.poster = item.cover;
    attachSource(vid, current);

    var restore = savedTime(item.id);
    var restored = false;

    function applyResume(t) {
      if (restored || !t) return;
      if (!vid.duration || t > vid.duration - 10) return;
      restored = true;
      vid.currentTime = t;
      if (resumeNote) {
        resumeNote.hidden = false;
        resumeNote.textContent = '从 ' + clock(t) + ' 继续';
        setTimeout(function () { resumeNote.hidden = true; }, 6000);
      }
    }

    vid.addEventListener('loadedmetadata', function () { applyResume(restore); });

    vid.addEventListener('timeupdate', function () {
      if (!vid.duration) return;
      if (!vid.dataset.t || Date.now() - Number(vid.dataset.t) > 5000) {
        vid.dataset.t = Date.now();
        saveTime(item.id, vid.currentTime, vid.duration);
      }
    });

    vid.addEventListener('pause', function () { saveTime(item.id, vid.currentTime, vid.duration); });
    vid.addEventListener('ended', function () {
      saveTime(item.id, 0);
      if (nextEpBtn) nextEpBtn.hidden = false;
    });

    if (nextEpBtn) {
      nextEpBtn.addEventListener('click', function () {
        var n = nextOf(item);
        if (n) { state.autoplay = true; location.hash = '#/ep/' + n.id; }
      });
    }

    if (verSel) {
      verSel.addEventListener('change', function () {
        var i = Number(verSel.value);
        var target = i === 0 ? item.video : item.variants[i - 1];
        if (!target) return;
        var t = vid.currentTime;
        var playing = !vid.paused;
        current = target;
        attachSource(vid, target);
        var seekBack = function () {
          if (t > 1) { try { vid.currentTime = t; } catch (e) {} }
          if (playing) vid.play().catch(function () {});
        };
        if (vid.readyState >= 2) setTimeout(seekBack, 60);
        else vid.addEventListener('loadeddata', seekBack, { once: true });
        if (dlVideo) {
          dlVideo.href = target.download;
          dlVideo.innerHTML = ICO.down + ' 视频 · ' + target.sizeText;
        }
      });
    }

    if (state.autoplay) {
      state.autoplay = false;
      var tryPlay = function () { vid.play().catch(function () {}); };
      if (vid.readyState >= 1) tryPlay();
      else vid.addEventListener('loadedmetadata', tryPlay, { once: true });
    }

    state.detail = { item: item, vid: vid };

    bindDeck(item);
  }

  function showVideoError() {
    var player = document.querySelector('.player');
    if (!player || player.querySelector('.player-error')) return;
    var n = document.createElement('div');
    n.className = 'player-error';
    n.style.cssText = 'position:absolute;inset:0;display:grid;place-content:center;gap:6px;text-align:center;color:#dbe6f5;font-size:13.5px;padding:20px;background:#0c1526';
    n.innerHTML = '<strong style="font-size:15px;color:#fff">视频暂时无法播放</strong><span>文件可能被移动或正在同步中，可直接下载后本地观看。</span>';
    player.appendChild(n);
  }

  function humanBytes(b) {
    if (!b) return '';
    if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
    return Math.max(1, Math.round(b / 1024)) + ' KB';
  }

  function clock(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }

  /* -------------------------------------------------------------------- deck */
  function bindDeck(item) {
    var slides = item.slides || [];
    if (!slides.length) return;

    var stage = document.getElementById('stage');
    var frame = document.getElementById('frame');
    var img = document.getElementById('slideImg');
    var count = document.getElementById('stageCount');
    var track = document.getElementById('stageTrack');
    var thumbs = Array.prototype.slice.call(document.querySelectorAll('#thumbs .thumb'));
    var prevBtn = document.getElementById('prevBtn');
    var nextBtn = document.getElementById('nextBtn');
    var fsBtn = document.getElementById('fsBtn');
    var total = slides.length;

    function render(n, opts) {
      opts = opts || {};
      n = clamp(n, 1, total);
      var changed = String(img.dataset.i) !== String(n);
      state.slide = n;

      if (changed) {
        frame.classList.add('is-loading');
        img.dataset.i = String(n);
        img.src = slides[n - 1];
        img.alt = item.title + ' 第 ' + n + ' 页（共 ' + total + ' 页）';
        img.onload = function () { frame.classList.remove('is-loading'); };
        img.onerror = function () {
          frame.classList.remove('is-loading');
          img.alt = '第 ' + n + ' 页加载失败';
        };
        preload(n + 1);
        preload(n - 1);
      }

      count.textContent = n + ' / ' + total;
      track.style.width = ((n / total) * 100).toFixed(2) + '%';
      prevBtn.disabled = n <= 1;
      nextBtn.disabled = n >= total;

      for (var i = 0; i < thumbs.length; i++) {
        var on = i + 1 === n;
        thumbs[i].classList.toggle('is-active', on);
        thumbs[i].setAttribute('aria-current', on ? 'true' : 'false');
      }
      var active = thumbs[n - 1];
      if (active && opts.scrollThumb !== false) {
        var box = document.getElementById('thumbs');
        var left = active.offsetLeft - box.clientWidth / 2 + active.clientWidth / 2;
        box.scrollTo({ left: Math.max(0, left), behavior: opts.instant ? 'auto' : 'smooth' });
      }

      if (opts.syncHash !== false) {
        try { history.replaceState(null, '', '#/ep/' + item.id + '/s/' + n); } catch (e) {}
      }
    }

    var preloaded = {};
    function preload(n) {
      if (n < 1 || n > total || preloaded[n]) return;
      preloaded[n] = true;
      var im = new Image();
      im.src = slides[n - 1];
    }

    prevBtn.addEventListener('click', function () { render(state.slide - 1); });
    nextBtn.addEventListener('click', function () { render(state.slide + 1); });
    thumbs.forEach(function (btn) {
      btn.addEventListener('click', function () { render(Number(btn.dataset.i)); });
    });

    frame.addEventListener('click', function (e) {
      if (e.target.closest('.stage-nav')) return;
      if (state.slide < total) render(state.slide + 1);
    });

    // swipe
    var startX = null;
    frame.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      startX = e.clientX;
    });
    frame.addEventListener('pointerup', function (e) {
      if (startX == null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) < 40) return;
      render(state.slide + (dx < 0 ? 1 : -1));
    });

    if (fsBtn) {
      fsBtn.addEventListener('click', function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (stage.requestFullscreen) stage.requestFullscreen().catch(function () {});
      });
    }

    render(state.slide || 1, { instant: true });
  }

  /* ----------------------------------------------------------------- routing */
  function parseRoute() {
    var raw = location.hash.replace(/^#\/?/, '');
    var seg = raw.split('/').filter(Boolean);
    if (seg[0] === 'ep' && seg[1]) {
      var n = seg[2] === 's' ? parseInt(seg[3], 10) : null;
      return { name: 'ep', id: seg[1], slide: isFinite(n) && n > 0 ? n : null };
    }
    return { name: 'home' };
  }

  function teardown() {
    var d = state.detail;
    if (d && d.vid) {
      try {
        saveTime(d.item.id, d.vid.currentTime, d.vid.duration);
        d.vid.pause();
        d.vid.removeAttribute('src');
        d.vid.load();
      } catch (e) {}
    }
    state.detail = null;
  }

  function route() {
    var r = parseRoute();
    var prev = state.route;
    if (r.name === 'home') {
      if (prev.name !== 'home') {
        teardown();
        viewEp.hidden = true;
        viewEp.innerHTML = '';
      }
      viewHome.hidden = false;
      if (prev.name !== 'home') {
        window.scrollTo({ top: state.homeScroll || 0, behavior: 'auto' });
      }
      collectNavTargets();
      syncNavToScroll();
    } else {
      var item = byId(r.id);
      if (!item) { location.replace('#/'); return; }
      if (prev.name === 'home') state.homeScroll = window.scrollY;
      if (prev.name === 'ep' && prev.id !== r.id) teardown();
      state.slide = r.slide || (prev.name === 'ep' && prev.id === r.id ? state.slide : 1) || 1;
      viewHome.hidden = true;
      viewEp.hidden = false;
      if (prev.name !== 'ep' || prev.id !== r.id) {
        renderDetail(item);
        if (r.slide && r.slide > 1) {
          var jumpDeck = function () {
            var deck = document.getElementById('deck');
            if (deck) deck.scrollIntoView({ behavior: 'auto', block: 'start' });
          };
          requestAnimationFrame(jumpDeck);
          setTimeout(jumpDeck, 220);
        } else {
          window.scrollTo({ top: 0, behavior: 'auto' });
        }
      }
      setActiveNav(null);
    }
    state.route = r;
    updateProgressBar();
  }

  function setActiveNav(kind) {
    var links = document.querySelectorAll('.nav a');
    for (var i = 0; i < links.length; i++) links[i].classList.remove('is-active');
    if (kind === 'home') syncNavToScroll();
  }

  /* 滚动时高亮对应的导航项（跨圈 / 药圈 / 资料 / 关于） */
  var navTargets = [];

  function collectNavTargets() {
    navTargets = [];
    var links = document.querySelectorAll('.nav a');
    for (var i = 0; i < links.length; i++) {
      var id = links[i].dataset.scroll;
      var el = id && document.getElementById(id);
      if (el) navTargets.push({ link: links[i], el: el });
    }
  }

  function markNav(link) {
    var links = document.querySelectorAll('.nav a');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('is-active', links[i] === link);
    }
  }

  function syncNavToScroll() {
    if (state.route.name !== 'home' || !navTargets.length) return;
    var line = window.scrollY + 140; // 视口上方往下一点的位置
    var active = null;
    for (var i = 0; i < navTargets.length; i++) {
      var top = navTargets[i].el.offsetTop;
      if (top <= line) active = navTargets[i];
    }
    if (!active) active = navTargets[0];
    // 到底部时高亮最后一项（「关于」在页面最下方，不容易顶到基准线）
    var doc = document.documentElement;
    if (window.scrollY + window.innerHeight >= doc.scrollHeight - 4) {
      active = navTargets[navTargets.length - 1];
    }
    for (var j = 0; j < navTargets.length; j++) {
      navTargets[j].link.classList.toggle('is-active', navTargets[j] === active);
    }
  }

  function updateProgressBar() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 40 ? clamp(window.scrollY / max, 0, 1) : 0;
    if (!topbarProgress) return;
    topbarProgress.hidden = p <= 0.01;
    var bar = topbarProgress.firstElementChild;
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
  }

  /* ------------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    var play = e.target.closest('[data-play]');
    if (play) {
      var id = play.dataset.play;
      var target = '#/ep/' + id;
      e.preventDefault();
      if (location.hash !== target) {
        state.autoplay = true;
        location.hash = target;
      } else if (state.detail && state.detail.item.id === id) {
        state.autoplay = false;
        state.detail.vid.play().catch(function () {});
      }
      return;
    }
    var scrollLink = e.target.closest('[data-scroll]');
    if (scrollLink) {
      e.preventDefault();
      var target = scrollLink.dataset.scroll;
      markNav(scrollLink); // 先亮起来，滚动结束后由滚动监听校正
      var jump = function () {
        var node = document.getElementById(target);
        if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      if (state.route.name !== 'home') {
        location.hash = '#/';
        setTimeout(jump, 60);
      } else {
        jump();
      }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && document.fullscreenElement) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'video') return;
    if (state.route.name !== 'ep' || !state.detail) return;
    var total = (state.detail.item.slides || []).length;
    if (!total) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      var nextBtn = document.getElementById('nextBtn');
      if (nextBtn && !nextBtn.disabled) { e.preventDefault(); nextBtn.click(); }
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      var prevBtn = document.getElementById('prevBtn');
      if (prevBtn && !prevBtn.disabled) { e.preventDefault(); prevBtn.click(); }
    } else if (e.key === 'Home') {
      e.preventDefault();
      var p = document.getElementById('prevBtn');
      if (p) { while (!p.disabled) p.click(); }
    } else if (e.key === 'End') {
      e.preventDefault();
      var n = document.getElementById('nextBtn');
      if (n) { while (!n.disabled) n.click(); }
    }
  });

  window.addEventListener('scroll', function () {
    updateProgressBar();
    if (!syncNavRaf) {
      syncNavRaf = requestAnimationFrame(function () {
        syncNavRaf = 0;
        syncNavToScroll();
      });
    }
  }, { passive: true });
  window.addEventListener('resize', updateProgressBar);
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', function () {
    if (state.detail && state.detail.vid) {
      saveTime(state.detail.item.id, state.detail.vid.currentTime, state.detail.vid.duration);
    }
  });

  /* --------------------------------------------------------------------- boot */
  fetch('data/episodes.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      state.data = data;
      document.title = data.site.title + ' · 记录人物行为成就与争议';
      renderHome();
      collectNavTargets();
      route();
    })
    .catch(function (err) {
      viewHome.innerHTML = '<div class="wrap" style="padding:80px 0;text-align:center">' +
        '<h2 style="font-size:20px">数据加载失败</h2>' +
        '<p style="margin-top:10px;color:#4b6788">请确认站点通过本地服务器打开（start.cmd），而不是直接双击 index.html。</p>' +
        '<p style="margin-top:6px;color:#7e94ae;font-size:13px">' + esc(err.message) + '</p></div>';
    });
})();
