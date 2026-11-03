/* ============================================================
   app.js — 启动与路由
   ============================================================ */
(function () {
  'use strict';

  function route() {
    const hash = location.hash || '#/home';
    if (hash.indexOf('#/play') === 0) return;

    Session.teardown();

    const nav = document.querySelector('.nav');
    if (nav) {
      U.$$('a', nav).forEach(function (a) {
        const h = a.getAttribute('href');
        a.classList.toggle('on', hash.indexOf(h) === 0);
      });
    }

    if (hash === '#/home' || hash === '#/' || hash === '#') return Views.home();
    if (hash === '#/years') return Views.years();
    if (hash === '#/subjects') return Views.subjects();
    if (hash.indexOf('#/subject/') === 0) return Views.subject(decodeURIComponent(hash.slice('#/subject/'.length)));
    if (hash === '#/build') return Views.build();
    if (hash === '#/cases') return Views.cases();
    if (hash === '#/maps') return Views.maps();
    if (hash.indexOf('#/maps/') === 0) return Views.maps(+hash.slice(7));
    if (hash === '#/mock') return Views.mock();
    if (hash.indexOf('#/mock/sub/') === 0) return Views.mockSubject(hash.slice('#/mock/sub/'.length));
    if (hash === '#/yicuo') return Views.yicuo();
    if (hash === '#/lists') return Views.lists();
    if (hash === '#/stats') return Views.stats();
    if (hash === '#/keys') return Views.keys();
    if (hash === '#/settings') return Views.settings();
    if (hash.indexOf('#/search/') === 0) return Views.search(decodeURIComponent(hash.slice('#/search/'.length)));
    Views.home();
  }

  function showFatal(msg) {
    let bar = document.getElementById('errbar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'errbar';
      bar.style.cssText = 'position:fixed;left:8px;right:8px;top:64px;z-index:999;background:#fdecea;color:#b3261e;' +
        'border:1px solid #f2c2bd;border-radius:8px;padding:8px 12px;font-size:12.5px;white-space:pre-wrap;';
      bar.addEventListener('click', function () { bar.remove(); });
      document.body.appendChild(bar);
    }
    bar.textContent = '⚠️ ' + msg + '（点此关闭）';
  }
  window.addEventListener('error', function (e) {
    showFatal((e.message || '脚本出错') + ' @' + String(e.filename || '').split('/').pop() + ':' + e.lineno);
  });

  async function boot() {
    try {
      await Store.init();
    } catch (e) {
      console.warn('存储初始化失败，改用内存模式', e);
    }
    document.documentElement.style.setProperty('--fs', (Store.get('fontSize') || 17) + 'px');
    const qsTheme = (location.search.match(/[?&]theme=(dark|light)/) || [])[1];
    U.applyTheme(qsTheme || Store.get('theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'), true);
    const tBtn = document.getElementById('btn-theme');
    if (tBtn) tBtn.addEventListener('click', function () { U.toggleTheme(); });

    try {
      await Bank.init();
    } catch (e) {
      document.getElementById('app').innerHTML = '<div class="empty">题库索引加载失败：' + U.esc(e.message) + '</div>';
      return;
    }
    const ft = document.getElementById('foot-total');
    if (ft) ft.textContent = U.fmtNum(Bank.meta.total);

    // 搜索
    const search = document.getElementById('q-search');
    const doSearch = function () {
      const v = (search && search.value || '').trim();
      if (!v) { if (search) search.focus(); U.toast('输入关键词后再搜索'); return; }
      const target = '#/search/' + encodeURIComponent(v);
      if (location.hash === target) route();     // 同一个词再搜一次也刷新
      else location.hash = target;
    };
    if (search) {
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.keyCode === 13) { e.preventDefault(); doSearch(); }
      });
      search.addEventListener('search', doSearch);
    }
    const btnSearch = document.getElementById('btn-search');
    if (btnSearch) btnSearch.addEventListener('click', doSearch);
    const btnSet = document.getElementById('btn-settings');
    if (btnSet) btnSet.addEventListener('click', function () { location.hash = '#/settings'; });

    // 云端同步：启动时拉一次 + 顶栏状态
    const btnSync = document.getElementById('btn-sync');
    const paintSync = function () {
      if (!btnSync) return;
      const c = Store.cloud;
      btnSync.textContent = c.state === 'ok' ? '☁' : (c.state === 'error' ? '⚠' : '☁');
      btnSync.title = c.label();
      btnSync.classList.toggle('on', c.state === 'ok');
    };
    document.addEventListener('xz-sync', paintSync);
    paintSync();
    if (btnSync) btnSync.addEventListener('click', function () {
      if (!Store.cloud.configured()) { location.hash = '#/settings'; U.toast('先在设置里配置云端同步'); return; }
      Store.cloud.syncNow().then(function (ok) { U.toast(ok ? '已同步' : ('同步失败：' + (Store.cloud.error || ''))); });
    });
    if (Store.cloud.configured()) {
      Store.cloud.syncNow().then(function () { paintSync(); });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Store.cloud.configured()) Store.cloud.syncNow();
    });

    // 点击当前页的导航项时也重新渲染（否则 hash 不变，看起来「没反应」）
    document.addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('a[href^="#/"]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (href === location.hash) { e.preventDefault(); route(); }
    }, true);

    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#/home';
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
