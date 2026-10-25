// Screenshot UI: the redact screen, the full-screen viewer, the list on the log form
// and the gallery on the entry page.

import * as images from './images.js';
import { confirmPanel, h, icon, toast } from './ui.js';

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);

let openDialogs = 0;
export const anyDialogOpen = () => openDialogs > 0;

function showDialog(dlg) {
  document.body.append(dlg);
  openDialogs++;
  dlg.showModal();
}

function closeDialog(dlg, returnFocus) {
  if (!dlg.isConnected) return;
  if (dlg.open) dlg.close();
  dlg.remove();
  openDialogs--;
  if (returnFocus && returnFocus.isConnected) returnFocus.focus();
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ---- Thumbnails ------------------------------------------------------------------------------
// Shows the image once it's on this device; if it's still on its way from the other device,
// shows a placeholder and swaps in the picture when it arrives.
export function thumb(shot, signal, { alt = null } = {}) {
  const img = h('img', { class: 'shot-img', alt: alt ?? (shot.caption || 'Screenshot'), decoding: 'async', draggable: 'false' });
  const missing = h('span', { class: 'shot-missing', hidden: true }, icon('cloudOff'), h('span', null, 'Not on this device yet'));
  const box = h('span', { class: 'shot-thumb is-loading' }, img, missing);
  const load = async () => {
    const url = await images.imageUrl(shot.id).catch(() => null);
    box.classList.remove('is-loading');
    box.classList.toggle('is-missing', !url);
    img.hidden = !url;
    missing.hidden = !!url;
    if (url) img.src = url;
  };
  load();
  images.onImagesChanged((ch) => {
    if (ch.reset || (ch.added && ch.added.includes(shot.id)) || (ch.removed && ch.removed.includes(shot.id))) load();
  }, signal);
  return box;
}

// ---- Redact screen -----------------------------------------------------------------------------
// Resolves { blob, w, h, caption, boxes } with the boxes burned in, or null if discarded.
// The original image never leaves this function: only the redacted, compressed copy is returned.
export async function redact(file, { index = 1, total = 1 } = {}) {
  let decoded;
  try {
    decoded = await images.decodeImage(file);
  } catch (err) {
    toast(err.message, { type: 'error' });
    return null;
  }
  const { w, h: ht } = images.outputSize(decoded.width, decoded.height);
  const base = document.createElement('canvas');
  base.width = w;
  base.height = ht;
  images.paint(base.getContext('2d'), decoded.source, w, ht);
  decoded.close();

  return new Promise((resolve) => {
    const opener = document.activeElement;
    const canvas = h('canvas', { class: 'redact-canvas', width: String(w), height: String(ht), role: 'img', 'aria-label': 'Screenshot preview. Drag across it to draw a black box.' });
    const ctx = canvas.getContext('2d');
    const rects = [];
    let preview = null;
    let start = null;

    const draw = () => {
      ctx.drawImage(base, 0, 0);
      ctx.fillStyle = '#000000';
      for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
      if (preview) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(preview.x, preview.y, preview.w, preview.h);
        ctx.strokeStyle = '#ff3b30';
        ctx.lineWidth = Math.max(2, w / 500);
        ctx.strokeRect(preview.x, preview.y, preview.w, preview.h);
      }
    };
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: clamp(((e.clientX - r.left) * w) / r.width, 0, w), y: clamp(((e.clientY - r.top) * ht) / r.height, 0, ht) };
    };
    // Whole pixels, rounded outwards, so nothing peeks out from under a box.
    const box = (a, b) => {
      const x = Math.floor(Math.min(a.x, b.x)), y = Math.floor(Math.min(a.y, b.y));
      return { x, y, w: Math.ceil(Math.max(a.x, b.x)) - x, h: Math.ceil(Math.max(a.y, b.y)) - y };
    };

    const count = h('span', { class: 'redact-count', 'aria-live': 'polite' });
    const undoBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, icon('undo'), 'Undo');
    const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, icon('x'), 'Clear');
    const tools = () => {
      undoBtn.disabled = clearBtn.disabled = rects.length === 0;
      count.textContent = rects.length ? `${rects.length} black box${rects.length === 1 ? '' : 'es'}` : 'No boxes yet';
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      start = point(e);
      preview = box(start, start);
      draw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!start) return;
      preview = box(start, point(e));
      draw();
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!start) return;
      const r = box(start, point(e));
      const minSize = 3 * (w / canvas.getBoundingClientRect().width); // ignore taps and tiny wobbles
      start = null;
      preview = null;
      if (r.w >= minSize && r.h >= minSize) rects.push(r);
      draw();
      tools();
    });
    canvas.addEventListener('pointercancel', () => {
      start = null;
      preview = null;
      draw();
    });
    undoBtn.addEventListener('click', () => { rects.pop(); draw(); tools(); });
    clearBtn.addEventListener('click', () => { rects.length = 0; draw(); tools(); });

    const titleId = `redact-title-${index}`;
    const caption = h('input', { type: 'text', class: 'input', id: `redact-caption-${index}`, maxlength: '500', autocomplete: 'off', placeholder: 'e.g. nmap results for the target' });
    const saveBtn = h('button', { type: 'button', class: 'btn btn-primary' }, icon('check'), 'Save screenshot');
    const discardBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, total > 1 ? 'Skip this one' : 'Discard');
    const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Discard this screenshot' }, icon('x'));
    const dlg = h('dialog', { class: 'modal redactor', 'aria-labelledby': titleId },
      h('div', { class: 'modal-head' },
        h('h2', { id: titleId }, total > 1 ? `Check screenshot ${index} of ${total}` : 'Check this screenshot'),
        closeBtn),
      h('p', { class: 'hint' }, icon('box'), ' Drag across anything private (passwords, flags, tokens, IP addresses) to cover it with a black box. Only the covered-up version is saved.'),
      h('div', { class: 'redact-stage' }, canvas),
      h('div', { class: 'redact-tools' }, undoBtn, clearBtn, count),
      h('div', { class: 'field' }, h('label', { class: 'label', for: caption.id }, 'Caption (optional)'), caption),
      h('div', { class: 'btn-row modal-actions' }, discardBtn, saveBtn));

    let finished = false;
    const finish = (value) => {
      if (finished) return;
      finished = true;
      closeDialog(dlg, opener);
      resolve(value);
    };
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      preview = null;
      draw();
      try {
        const blob = await images.encodeCanvas(canvas);
        finish({ blob, w, h: ht, caption: caption.value.trim(), boxes: rects.length });
      } catch (err) {
        toast(err.message, { type: 'error' });
        saveBtn.disabled = false;
      }
    });
    caption.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveBtn.click(); }
    });
    discardBtn.addEventListener('click', () => finish(null));
    closeBtn.addEventListener('click', () => finish(null));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });

    draw();
    tools();
    showDialog(dlg);
    saveBtn.focus();
  });
}

// ---- Full-screen viewer -------------------------------------------------------------------------
// Swipe or arrow keys to move, pinch / wheel / buttons to zoom, Esc or ✕ to close.
// onDelete(shot) is optional; when given, a Delete button with an on-page confirm appears.
export function openViewer(shots, startIndex = 0, { onDelete = null } = {}) {
  const list = [...shots];
  if (!list.length) return Promise.resolve();
  const opener = document.activeElement;
  return new Promise((resolve) => {
    let i = clamp(startIndex, 0, list.length - 1);
    let scale = 1, tx = 0, ty = 0;
    const img = h('img', { class: 'viewer-img', alt: '', draggable: 'false' });
    const missing = h('p', { class: 'viewer-missing', hidden: true }, icon('cloudOff'), " This screenshot isn't on this device yet. It will appear once screenshot sync downloads it.");
    const stage = h('div', { class: 'viewer-stage' }, img, missing);
    const counter = h('span', { class: 'viewer-count', 'aria-live': 'polite' });
    const caption = h('p', { class: 'viewer-caption' });
    const prev = h('button', { type: 'button', class: 'icon-btn viewer-nav viewer-prev', 'aria-label': 'Previous screenshot' }, icon('back'));
    const next = h('button', { type: 'button', class: 'icon-btn viewer-nav viewer-next', 'aria-label': 'Next screenshot' }, icon('chevron'));
    const zoomOut = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom out' }, icon('zoomOut'));
    const zoomIn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom in' }, icon('zoomIn'));
    const fit = h('button', { type: 'button', class: 'btn btn-ghost btn-small viewer-fit' }, 'Fit');
    const close = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close viewer' }, icon('x'));
    const del = onDelete ? h('button', { type: 'button', class: 'icon-btn viewer-del', 'aria-label': 'Delete this screenshot' }, icon('trash')) : null;
    const confirmSlot = h('div', { class: 'viewer-confirm' });
    const dlg = h('dialog', { class: 'viewer', 'aria-label': 'Screenshot viewer' },
      h('div', { class: 'viewer-bar' }, counter, h('span', { class: 'viewer-spacer' }), zoomOut, fit, zoomIn, del, close),
      stage, prev, next,
      h('div', { class: 'viewer-foot' }, caption, confirmSlot));

    const apply = () => {
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      stage.classList.toggle('is-zoomed', scale > 1);
      // (Fit stays enabled: disabling the focused button would push keyboard focus out of the viewer.)
      fit.setAttribute('aria-pressed', String(scale === 1));
    };
    const resetZoom = () => { scale = 1; tx = 0; ty = 0; apply(); };
    const zoomAt = (target, cx, cy) => {
      const r = img.getBoundingClientRect();
      const baseLeft = r.left - tx, baseTop = r.top - ty;
      const lx = (cx - r.left) / scale, ly = (cy - r.top) / scale;
      scale = clamp(target, 1, 8);
      if (scale === 1) { tx = 0; ty = 0; } else {
        tx = cx - baseLeft - lx * scale;
        ty = cy - baseTop - ly * scale;
      }
      apply();
    };
    const zoomCentre = (factor) => {
      const r = stage.getBoundingClientRect();
      zoomAt(scale * factor, r.left + r.width / 2, r.top + r.height / 2);
    };

    async function show(n) {
      i = clamp(n, 0, list.length - 1);
      const shot = list[i];
      resetZoom();
      confirmSlot.replaceChildren();
      counter.textContent = `${i + 1} / ${list.length}`;
      caption.textContent = shot.caption || '';
      caption.hidden = !shot.caption;
      img.alt = shot.caption || `Screenshot ${i + 1}`;
      prev.disabled = i === 0;
      next.disabled = i === list.length - 1;
      prev.hidden = next.hidden = list.length < 2;
      const url = await images.imageUrl(shot.id).catch(() => null);
      if (list[i] !== shot) return;
      img.hidden = !url;
      missing.hidden = !!url;
      if (url) img.src = url;
    }
    const go = (d) => { if (i + d >= 0 && i + d < list.length) show(i + d); };

    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    zoomIn.addEventListener('click', () => zoomCentre(1.5));
    zoomOut.addEventListener('click', () => zoomCentre(1 / 1.5));
    fit.addEventListener('click', resetZoom);

    const keys = new AbortController();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      keys.abort();
      closeDialog(dlg, opener);
      resolve();
    };
    close.addEventListener('click', finish);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(); });
    // Listen on the whole document while open, so the keys work wherever focus has ended up.
    document.addEventListener('keydown', (e) => {
      if (e.target instanceof Element && e.target.closest('.viewer-confirm')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === '+' || e.key === '=') zoomCentre(1.5);
      else if (e.key === '-') zoomCentre(1 / 1.5);
      else if (e.key === '0') resetZoom();
    }, { signal: keys.signal });

    if (del) {
      del.addEventListener('click', () => {
        confirmSlot.replaceChildren(confirmPanel({
          title: 'Delete this screenshot?',
          message: 'It is removed from this entry now, and from your other devices at the next sync. You can undo straight after.',
          confirmLabel: 'Delete screenshot',
          onConfirm: async () => {
            const shot = list[i];
            await onDelete(shot);
            list.splice(i, 1);
            if (!list.length) finish();
            else show(Math.min(i, list.length - 1));
          },
          onCancel: () => { confirmSlot.replaceChildren(); del.focus(); },
        }));
      });
    }

    // Wheel to zoom (mouse), pinch to zoom and drag to pan (touch), swipe to change picture.
    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(scale * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    const pointers = new Map();
    let pinch = null;
    let swipe = null;
    let lastTap = 0;
    stage.addEventListener('pointerdown', (e) => {
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale };
        swipe = null;
      } else if (pointers.size === 1) {
        swipe = { x: e.clientX, y: e.clientY, t: Date.now() };
      }
    });
    stage.addEventListener('pointermove', (e) => {
      const before = pointers.get(e.pointerId);
      if (!before) return;
      const now = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, now);
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        zoomAt(pinch.scale * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
      } else if (pointers.size === 1 && scale > 1) {
        tx += now.x - before.x;
        ty += now.y - before.y;
        apply();
      }
    });
    const lift = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (swipe && pointers.size === 0) {
        const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
        const moved = Math.hypot(dx, dy);
        if (scale === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
        else if (moved < 10 && e.pointerType !== 'mouse') {
          // double-tap toggles zoom
          if (Date.now() - lastTap < 320) {
            zoomAt(scale > 1 ? 1 : 2.5, e.clientX, e.clientY);
            lastTap = 0;
          } else lastTap = Date.now();
        }
        swipe = null;
      }
    };
    stage.addEventListener('pointerup', lift);
    stage.addEventListener('pointercancel', lift);
    stage.addEventListener('dblclick', (e) => zoomAt(scale > 1 ? 1 : 2.5, e.clientX, e.clientY));

    showDialog(dlg);
    show(i);
    close.focus();
  });
}

// ---- The list on the log form ---------------------------------------------------------------------
// shots is the draft's array and is changed in place. savedIds: images already saved on the entry,
// which stay in storage until the entry is saved (so Cancel doesn't lose them).
export function shotsEditor({ shots, onChange, savedIds = new Set(), signal }) {
  const touch = isTouchDevice();
  const list = h('ol', { class: 'shot-list' });
  const status = h('p', { class: 'hint shot-status', 'aria-live': 'polite' });
  const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'file-hidden', tabindex: '-1', 'aria-hidden': 'true', id: 'shot-files' });
  const cameraInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'file-hidden', tabindex: '-1', 'aria-hidden': 'true', id: 'shot-camera' });
  const choose = h('button', { type: 'button', class: 'btn btn-ghost' }, icon('image'), touch ? 'Gallery or camera' : 'Choose images');
  const camera = touch ? h('button', { type: 'button', class: 'btn btn-ghost' }, icon('camera'), 'Take a photo') : null;
  const drop = h('div', { class: 'dropzone' },
    h('p', { class: 'dropzone-text' }, touch
      ? 'Add screenshots from your gallery, or take a photo of the screen.'
      : 'Paste a screenshot with Ctrl+V (snip one with Win+Shift+S), drag image files here, or choose files.'),
    h('div', { class: 'btn-row' }, choose, camera),
    fileInput, cameraInput);
  let dragFrom = null;
  let queue = Promise.resolve();
  let pending = 0;

  choose.addEventListener('click', () => fileInput.click());
  camera?.addEventListener('click', () => cameraInput.click());
  for (const input of [fileInput, cameraInput]) {
    input.addEventListener('change', () => {
      const files = [...(input.files || [])];
      input.value = '';
      if (files.length) addFiles(files);
    });
  }

  // Files dragged onto the box (the log form also forwards drops from anywhere on the page).
  drop.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault();
    drop.classList.add('is-over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', () => drop.classList.remove('is-over'));

  function move(from, to) {
    if (to < 0 || to >= shots.length || from === to) return;
    const [s] = shots.splice(from, 1);
    shots.splice(to, 0, s);
    onChange();
    render();
    status.textContent = `Moved to position ${to + 1} of ${shots.length}.`;
  }

  function remove(i) {
    const [s] = shots.splice(i, 1);
    if (s && !savedIds.has(s.id)) images.deleteImages([s.id]).catch(() => {}); // never saved: free the space now
    onChange();
    render();
    status.textContent = 'Screenshot removed.';
    const rows = list.querySelectorAll('.shot-row');
    (rows[Math.min(i, rows.length - 1)]?.querySelector('.shot-open') || choose).focus();
  }

  function row(shot, i) {
    const n = i + 1;
    const open = h('button', { type: 'button', class: 'shot-open', 'aria-label': `View screenshot ${n} full screen` }, thumb(shot, signal, { alt: '' }));
    open.addEventListener('click', () => openViewer(shots, i));
    const cap = h('input', { type: 'text', class: 'input', id: `cap-${shot.id}`, value: shot.caption, maxlength: '500', autocomplete: 'off', placeholder: 'e.g. nmap results for the target' });
    cap.addEventListener('input', () => { shot.caption = cap.value; onChange(); });
    const up = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move screenshot ${n} up`, disabled: i === 0 }, icon('up'));
    const down = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Move screenshot ${n} down`, disabled: i === shots.length - 1 }, icon('down'));
    const del = h('button', { type: 'button', class: 'icon-btn btn-danger-text', 'aria-label': `Delete screenshot ${n}` }, icon('trash'));
    const confirmSlot = h('div', { class: 'shot-confirm' });
    // Keep focus on the moved screenshot's arrow so pressing it again keeps moving it.
    const refocus = (idx, prefer) => {
      const btns = list.children[idx]?.querySelectorAll('.shot-actions .icon-btn');
      if (!btns) return;
      const [upBtn, downBtn] = btns;
      const target = prefer === 'up' ? upBtn : downBtn;
      (target && !target.disabled ? target : (prefer === 'up' ? downBtn : upBtn))?.focus();
    };
    up.addEventListener('click', () => { move(i, i - 1); refocus(i - 1, 'up'); });
    down.addEventListener('click', () => { move(i, i + 1); refocus(i + 1, 'down'); });
    del.addEventListener('click', () => {
      confirmSlot.replaceChildren(confirmPanel({
        title: 'Delete this screenshot?',
        message: savedIds.has(shot.id) ? 'It is removed when you save the entry.' : 'It hasn\'t been saved yet, so it is gone for good.',
        confirmLabel: 'Delete screenshot',
        onConfirm: () => remove(i),
        onCancel: () => { confirmSlot.replaceChildren(); del.focus(); },
      }));
    });

    const handle = h('span', { class: 'drag-handle', draggable: 'true', title: 'Drag to reorder', 'aria-hidden': 'true' }, icon('grip'));
    const li = h('li', { class: 'shot-row' },
      handle,
      open,
      h('div', { class: 'shot-fields' },
        h('label', { class: 'label', for: cap.id }, 'Caption', h('span', { class: 'visually-hidden' }, ` for screenshot ${n}`), h('span', { class: 'muted' }, ' (optional)')),
        cap,
        h('div', { class: 'shot-actions' }, up, down, del)),
      confirmSlot);
    handle.addEventListener('dragstart', (e) => {
      dragFrom = i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-cyber-logbook-shot', String(i));
      try { e.dataTransfer.setDragImage(li, 24, 24); } catch { /* optional */ }
      li.classList.add('is-dragging');
    });
    handle.addEventListener('dragend', () => { dragFrom = null; li.classList.remove('is-dragging'); });
    li.addEventListener('dragover', (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      li.classList.add('is-drop-target');
    });
    li.addEventListener('dragleave', () => li.classList.remove('is-drop-target'));
    li.addEventListener('drop', (e) => {
      if (dragFrom === null) return;
      e.preventDefault();
      e.stopPropagation();
      li.classList.remove('is-drop-target');
      const from = dragFrom;
      dragFrom = null;
      move(from, i);
    });
    return li;
  }

  function render() {
    list.replaceChildren(...shots.map(row));
    section.dataset.count = String(shots.length);
  }

  // Each file goes through the redact screen one at a time.
  function addFiles(files) {
    const picked = [...files].filter(images.looksLikeImage);
    if (!picked.length) {
      toast('Only image files can be added as screenshots.', { type: 'error' });
      return queue;
    }
    picked.forEach((file, n) => {
      queue = queue.then(async () => {
        pending++;
        status.textContent = 'Opening screenshot…';
        try {
          const res = await redact(file, { index: n + 1, total: picked.length });
          if (!res) return;
          const rec = await images.storeImage(res.blob, res.w, res.h);
          shots.push({ id: rec.id, caption: res.caption, w: res.w, h: res.h });
          onChange();
          render();
          status.textContent = `Screenshot added (${Math.round(rec.size / 1024)} KB${res.boxes ? `, ${res.boxes} area${res.boxes === 1 ? '' : 's'} blacked out` : ''}).`;
        } catch (err) {
          toast(`Couldn't add that screenshot: ${err.message}`, { type: 'error' });
        } finally {
          pending--;
          if (!pending && status.textContent === 'Opening screenshot…') status.textContent = '';
        }
      });
    });
    return queue;
  }

  const section = h('section', { class: 'form-section shots-section', 'aria-labelledby': 'h-shots' },
    h('h2', { id: 'h-shots' }, icon('image'), 'Screenshots'),
    h('p', { class: 'hint' }, 'You can black out passwords, flags and IP addresses before each one is saved.'),
    list, drop, status);
  render();
  return { el: section, addFiles, dropzone: drop };
}

// ---- The gallery on the entry page -----------------------------------------------------------------
export function shotsGallery(shots, { signal, onDelete, onClose } = {}) {
  return h('ul', { class: 'gallery' }, shots.map((s, i) => {
    const btn = h('button', { type: 'button', class: 'gallery-item', 'aria-label': `Open screenshot ${i + 1}${s.caption ? `: ${s.caption}` : ''} full screen` }, thumb(s, signal, { alt: '' }));
    btn.addEventListener('click', () => openViewer(shots, i, { onDelete }).then(() => onClose && onClose()));
    return h('li', null, btn, s.caption ? h('p', { class: 'gallery-caption' }, s.caption) : null);
  }));
}

// Pulls image files out of a paste or drop. Returns [] if there are none.
export function imageFilesFrom(dataTransfer) {
  if (!dataTransfer) return [];
  const files = [...(dataTransfer.files || [])].filter(images.looksLikeImage);
  if (files.length) return files;
  const out = [];
  for (const item of dataTransfer.items || []) {
    if (item.kind === 'file' && /^image\//.test(item.type)) {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}
