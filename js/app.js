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
    if (hash === '#/lists') return Views.lists();
    if (hash === '#/stats') return Views.stats();
    if (hash === '#/settings') return Views.settings();
    if (hash.indexOf('#/search/') === 0) return Views.search(decodeURIComponent(hash.slice('#/search/'.length)));
    Views.home();
  }

  async function boot() {
    try {
      await Store.init();
    } catch (e) {
      console.warn('存储初始化失败，改用内存模式', e);
    }
    document.documentElement.style.setProperty('--fs', (Store.get('fontSize') || 17) + 'px');

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
    if (search) {
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        const v = search.value.trim();
        if (v) location.hash = '#/search/' + encodeURIComponent(v);
      });
    }
    const btnSet = document.getElementById('btn-settings');
    if (btnSet) btnSet.addEventListener('click', function () { location.hash = '#/settings'; });

    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#/home';
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
