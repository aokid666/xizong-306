/* Editable handwriting for note blocks. Coordinates are in paper pixels. */
(function () {
  'use strict';

  const colors = [
    { value: '#242322', name: '黑色' },
    { value: '#b52e25', name: '红色' },
    { value: '#265baa', name: '蓝色' }
  ];
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function copyInk(ink) {
    ink = ink || {};
    const size = (n, fallback) => Number.isFinite(n) && n > 0 ? clamp(Math.round(n), 1, 2048) : fallback;
    const strokes = Array.isArray(ink.strokes) ? ink.strokes : [];
    return {
      w: size(ink.w, 960),
      h: size(ink.h, 640),
      strokes: strokes.filter(function (stroke) {
        const points = stroke && stroke.points;
        return Array.isArray(points) && points.length >= 2 && points.length % 2 === 0 && points.every(Number.isFinite);
      }).map(function (stroke) {
        return {
          tool: stroke.tool === 'eraser' ? 'eraser' : 'pen',
          color: /^#[0-9a-f]{6}$/i.test(stroke.color) ? stroke.color : colors[0].value,
          width: Number.isFinite(stroke.width) ? clamp(stroke.width, 0.3, 128) : 4,
          points: stroke.points.slice()
        };
      })
    };
  }

  function drawStroke(ctx, stroke) {
    const points = stroke.points;
    ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    if (points.length === 2) {
      ctx.fillStyle = stroke.color;
      ctx.arc(points[0], points[1], stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = stroke.color;
      ctx.moveTo(points[0], points[1]);
      for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
      ctx.stroke();
    }
  }

  function drawInk(ctx, ink, draft) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, ink.w, ink.h);
    ctx.clip();
    ink.strokes.forEach(stroke => drawStroke(ctx, stroke));
    if (draft) drawStroke(ctx, draft);
    ctx.restore();
  }

  function previewImage(ink) {
    const bitmap = document.createElement('canvas');
    bitmap.width = ink.w;
    bitmap.height = ink.h;
    const ctx = bitmap.getContext('2d');
    drawInk(ctx, ink);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, ink.w, ink.h);
    return bitmap.toDataURL('image/png');
  }

  function mount(host, initialInk, onSave, onCancel) {
    const ink = copyInk(initialInk);
    const editor = U.el('div', { class: 'note-ink-editor', role: 'group', 'aria-label': '手写笔记编辑器' });
    editor.innerHTML =
      '<div class="note-ink-bar" role="toolbar" aria-label="手写工具">' +
        '<div class="note-ink-tools">' +
          '<button type="button" class="btn sm" data-tool="pen" aria-pressed="true">画笔</button>' +
          '<button type="button" class="btn sm" data-tool="eraser" aria-pressed="false">橡皮</button>' +
          '<button type="button" class="btn sm" data-tool="pan" aria-pressed="false">拖动画布</button>' +
        '</div>' +
        '<div class="note-ink-colors" role="group" aria-label="笔迹颜色"></div>' +
        '<button type="button" class="btn ghost sm" data-action="undo">撤销</button>' +
        '<div class="note-ink-zoom" role="group" aria-label="画布缩放">' +
          '<button type="button" class="btn ghost sm" data-action="out" aria-label="缩小画布">−</button>' +
          '<button type="button" class="btn ghost sm" data-action="fit" title="恢复适合窗口大小" aria-label="适应窗口">100%</button>' +
          '<button type="button" class="btn ghost sm" data-action="in" aria-label="放大画布">＋</button>' +
        '</div>' +
      '</div>' +
      '<div class="note-ink-stage" data-tool="pen" aria-label="手写画布">' +
        '<div class="note-ink-sheet" aria-hidden="true"></div><canvas aria-hidden="true"></canvas>' +
      '</div>' +
      '<div class="note-ink-footer">' +
        '<span class="note-ink-status hint" role="status">双指缩放或拖动，鼠标滚轮可缩放</span>' +
        '<button type="button" class="btn ghost sm" data-action="cancel">取消</button>' +
        '<button type="button" class="btn primary sm" data-action="save">保存手写</button>' +
      '</div>';

    const stage = editor.querySelector('.note-ink-stage');
    const sheet = editor.querySelector('.note-ink-sheet');
    const canvas = stage.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const status = editor.querySelector('.note-ink-status');
    const zoomLabel = editor.querySelector('[data-action="fit"]');
    const saveButton = editor.querySelector('[data-action="save"]');
    const undoButton = editor.querySelector('[data-action="undo"]');
    const colorBar = editor.querySelector('.note-ink-colors');
    colors.forEach(function (color, i) {
      const button = U.el('button', {
        type: 'button', class: 'note-ink-color', 'data-color': color.value,
        title: color.name, 'aria-label': color.name, 'aria-pressed': i === 0 ? 'true' : 'false'
      });
      button.style.setProperty('--pen-color', color.value);
      colorBar.appendChild(button);
    });

    const view = { w: 0, h: 0, x: 0, y: 0, scale: 1, fit: 1, ratio: 1 };
    const pointers = new Map();
    let tool = 'pen', color = colors[0].value;
    let gesture = null, draft = null, frame = 0, saving = false, disposed = false;
    sheet.style.width = ink.w + 'px';
    sheet.style.height = ink.h + 'px';
    host.replaceChildren(editor);

    function updateActions() {
      undoButton.disabled = saving || !ink.strokes.length;
      saveButton.disabled = saving || !ink.strokes.length;
    }

    function render() {
      frame = 0;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.setTransform(dpr * view.scale, 0, 0, dpr * view.scale, dpr * view.x, dpr * view.y);
      drawInk(ctx, ink, draft);
      sheet.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
      zoomLabel.textContent = Math.round(view.ratio * 100) + '%';
    }

    function redraw() {
      if (!frame && !disposed) frame = requestAnimationFrame(render);
    }

    function onPaper(x, y) {
      return { x: (x - view.x) / view.scale, y: (y - view.y) / view.scale };
    }

    function position(point, x, y, ratio) {
      view.ratio = clamp(ratio, 0.5, 8);
      view.scale = view.fit * view.ratio;
      const paperWidth = ink.w * view.scale;
      const paperHeight = ink.h * view.scale;
      const visibleX = Math.min(48, paperWidth / 2, view.w / 2);
      const visibleY = Math.min(48, paperHeight / 2, view.h / 2);
      view.x = clamp(x - point.x * view.scale, visibleX - paperWidth, view.w - visibleX);
      view.y = clamp(y - point.y * view.scale, visibleY - paperHeight, view.h - visibleY);
      redraw();
    }

    function resize() {
      if (!stage.clientWidth || !stage.clientHeight || disposed) return;
      const center = view.w ? onPaper(view.w / 2, view.h / 2) : { x: ink.w / 2, y: ink.h / 2 };
      view.w = stage.clientWidth;
      view.h = stage.clientHeight;
      view.fit = Math.max(0.01, Math.min((view.w - 12) / ink.w, (view.h - 12) / ink.h));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(view.w * dpr);
      canvas.height = Math.round(view.h * dpr);
      position(center, view.w / 2, view.h / 2, view.ratio);
    }

    function viewPoint(e, rect) {
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, type: e.pointerType };
    }

    function pair() {
      const [a, b] = pointers.values();
      return {
        x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        distance: Math.max(8, Math.hypot(a.x - b.x, a.y - b.y))
      };
    }

    function panGesture(id, point) {
      gesture = { kind: 'pan', id: id, paper: onPaper(point.x, point.y) };
    }

    stage.addEventListener('pointerdown', function (e) {
      if (saving || pointers.size >= 2 || (e.pointerType === 'mouse' && e.button > 1)) return;
      if (pointers.size && (e.pointerType !== 'touch' || pointers.values().next().value.type !== 'touch')) return;
      e.preventDefault();
      try { stage.setPointerCapture(e.pointerId); } catch (err) { }
      const point = viewPoint(e, stage.getBoundingClientRect());
      pointers.set(e.pointerId, point);
      if (pointers.size === 2) {
        const two = pair();
        gesture = { kind: 'pinch', paper: onPaper(two.x, two.y), ratio: view.ratio, distance: two.distance };
        draft = null;
        redraw();
      } else if (tool === 'pan' || e.button === 1) {
        panGesture(e.pointerId, point);
      } else {
        const p = onPaper(point.x, point.y);
        if (p.x < 0 || p.y < 0 || p.x > ink.w || p.y > ink.h) return;
        gesture = { kind: 'draw', id: e.pointerId };
        draft = { tool: tool, color: color, width: tool === 'eraser' ? clamp(22 / view.scale, 7, 128) : 4, points: [p.x, p.y] };
        redraw();
      }
    });

    function addPoint(point) {
      const p = onPaper(point.x, point.y);
      const list = draft.points;
      if (Math.hypot(p.x - list[list.length - 2], p.y - list[list.length - 1]) >= 0.6) list.push(p.x, p.y);
    }

    stage.addEventListener('pointermove', function (e) {
      if (!pointers.has(e.pointerId) || !gesture) return;
      const rect = stage.getBoundingClientRect();
      const point = viewPoint(e, rect);
      pointers.set(e.pointerId, point);
      if (gesture.kind === 'pinch') {
        const two = pair();
        position(gesture.paper, two.x, two.y, gesture.ratio * two.distance / gesture.distance);
      } else if (gesture.kind === 'pan') {
        position(gesture.paper, point.x, point.y, view.ratio);
      } else if (draft) {
        const samples = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        if (samples.length) samples.forEach(sample => addPoint(viewPoint(sample, rect)));
        else addPoint(point);
        redraw();
      }
    });

    function endPointer(e) {
      if (!pointers.delete(e.pointerId)) return;
      if (draft && gesture && gesture.kind === 'draw' && gesture.id === e.pointerId) {
        if (e.type === 'pointerup') {
          addPoint(viewPoint(e, stage.getBoundingClientRect()));
          if (draft.tool !== 'eraser' || ink.strokes.length) ink.strokes.push(draft);
        }
        draft = null;
        updateActions();
        redraw();
      }
      if (pointers.size) {
        const [id, point] = pointers.entries().next().value;
        panGesture(id, point);
      } else {
        gesture = null;
      }
    }

    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(name => stage.addEventListener(name, endPointer));
    stage.addEventListener('wheel', function (e) {
      if (saving || pointers.size || !e.deltaY) return;
      e.preventDefault();
      const p = viewPoint(e, stage.getBoundingClientRect());
      position(onPaper(p.x, p.y), p.x, p.y, view.ratio * (e.deltaY < 0 ? 1.17 : 1 / 1.17));
    }, { passive: false });

    function chooseTool(next) {
      tool = next;
      stage.dataset.tool = tool;
      editor.querySelectorAll('.note-ink-tools button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      });
    }

    async function save() {
      saving = true;
      editor.setAttribute('aria-busy', 'true');
      status.textContent = '正在保存手写…';
      updateActions();
      try {
        const payload = copyInk(ink);
        await onSave(payload, previewImage(payload));
      } catch (err) {
        status.textContent = '未能保存手写，请重试';
      } finally {
        saving = false;
        editor.removeAttribute('aria-busy');
        updateActions();
      }
    }

    editor.addEventListener('click', function (e) {
      const button = e.target.closest('button');
      if (!button || saving || pointers.size) return;
      if (button.dataset.tool) chooseTool(button.dataset.tool);
      if (button.dataset.color) {
        color = button.dataset.color;
        colorBar.querySelectorAll('button').forEach(choice => {
          choice.setAttribute('aria-pressed', String(choice === button));
        });
        chooseTool('pen');
      }
      const action = button.dataset.action;
      if (action === 'undo') {
        ink.strokes.pop();
        updateActions();
        redraw();
      } else if (action === 'fit') {
        position({ x: ink.w / 2, y: ink.h / 2 }, view.w / 2, view.h / 2, 1);
      } else if (action === 'in' || action === 'out') {
        const x = view.w / 2, y = view.h / 2;
        position(onPaper(x, y), x, y, view.ratio * (action === 'in' ? 1.25 : 0.8));
      } else if (action === 'cancel') {
        onCancel();
      } else if (action === 'save') {
        save();
      }
    });

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(stage);
    else window.addEventListener('resize', resize);
    resize();
    updateActions();
    return function dispose() {
      disposed = true;
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', resize);
      if (frame) cancelAnimationFrame(frame);
      editor.remove();
    };
  }

  window.NoteInk = {
    mount: mount,
    preview: function (ink) { return previewImage(copyInk(ink)); }
  };
})();
