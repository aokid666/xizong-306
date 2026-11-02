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
    if (hash === '#/mock') return Views.mock();
    if (hash.indexOf('#/mock/sub/') === 0) return Views.mockSubject(hash.slice('#/mock/sub/'.length));
    if (hash === '#/yicuo') return Views.yicuo();
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

    window.addEventListener('hashchange', route);
    if (!location.hash) location.hash = '#/home';
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
