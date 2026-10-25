// One entry, read-only, with quick actions (tick questions, reveal the flag, edit, share, delete).

import * as store from '../store.js';
import { confidenceLabel } from '../derive.js';
import { entryToMarkdown } from '../markdown.js';
import { confirmPanel, confidenceDots, copyButton, copyText, emptyState, fmtDate, fmtDateTime, fmtMinutes, h, icon, toast } from '../ui.js';

export const title = 'Entry';

function textBlock(text) {
  return h('div', { class: 'prose' }, text.split(/\n{2,}/).map((p) => h('p', null, p)));
}

export function render(page, id) {
  const e = store.get(id);
  if (!e) {
    page.append(emptyState('Entry not found', 'It may have been deleted, maybe on another device.',
      h('a', { class: 'btn btn-primary', href: '#/journal' }, 'Back to journal')));
    return null;
  }

  page.append(h('a', { class: 'back-link', href: '#/journal' }, icon('back'), 'Journal'));
  page.append(h('div', { class: 'page-head entry-head' },
    h('h1', { tabindex: '-1' }, e.room || 'Untitled session'),
    h('div', { class: 'entry-meta' },
      h('span', { class: 'pill' }, e.platform),
      h('time', { datetime: e.date }, fmtDate(e.date)),
      h('span', null, icon('clock'), fmtMinutes(e.minutes)),
      h('span', { class: 'conf-meta' }, confidenceDots(e.confidence), h('span', null, e.confidence ? `${e.confidence}/5 · ${confidenceLabel(e.confidence)}` : 'Confidence not rated'))),
    e.tags.length ? h('div', { class: 'tag-row' }, e.tags.map((t) => h('span', { class: 'tag' }, t))) : null,
    e.link ? h('a', { class: 'btn btn-ghost btn-small ext-link', href: e.link, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'Open room link') : null));

  page.append(h('section', { class: 'explain-card', 'aria-labelledby': 'explain-view' },
    h('div', { class: 'explain-head' }, icon('message'), h('h2', { id: 'explain-view' }, 'Explain it to a mate')),
    e.explain ? textBlock(e.explain) : h('p', { class: 'muted' }, 'Not explained yet. Explaining it in plain words is the best test of whether it has sunk in. ',
      h('a', { href: `#/edit/${encodeURIComponent(e.id)}` }, 'Add an explanation'))));

  if (e.learned) page.append(h('section', { class: 'card' }, h('h2', null, icon('bulb'), 'What I learned'), textBlock(e.learned)));
  if (e.did) page.append(h('section', { class: 'card' }, h('h2', null, 'What I did'), textBlock(e.did)));

  if (e.commands.length) {
    page.append(h('section', { class: 'card' }, h('h2', null, icon('terminal'), 'Commands I used'),
      h('ul', { class: 'cmd-list' }, e.commands.map((c) => h('li', { class: 'cmd-item' },
        c.cmd ? h('div', { class: 'cmd-line' }, h('pre', { class: 'code' }, h('code', null, c.cmd)), copyButton(() => c.cmd, `Copy command: ${c.cmd.slice(0, 60)}`)) : null,
        c.what ? h('p', null, c.what) : null,
        c.example ? h('div', { class: 'cmd-example' }, h('span', { class: 'label-small' }, 'Example'), h('pre', { class: 'code' }, h('code', null, c.example))) : null)))));
  }

  if (e.questions.length) {
    const items = e.questions.map((q) => {
      const box = h('input', { type: 'checkbox', checked: q.solved, id: `vq-${q.id}` });
      box.addEventListener('change', async () => {
        const current = store.get(e.id);
        if (!current) return;
        const questions = current.questions.map((x) => (x.id === q.id ? { ...x, solved: box.checked } : x));
        try {
          await store.save({ ...current, questions });
          toast(box.checked ? 'Ticked off. Nice one.' : 'Marked as still open.', { type: 'success', timeout: 2500 });
        } catch {
          box.checked = !box.checked;
          toast("Couldn't save that change.", { type: 'error' });
        }
      });
      return h('li', { class: 'q-item' },
        h('label', { class: 'check', for: `vq-${q.id}` }, box, h('span', null, q.q || '(no question written)')),
        q.answer ? h('p', { class: 'q-answer' }, h('strong', null, 'Answer: '), q.answer) : null);
    });
    page.append(h('section', { class: 'card' }, h('h2', null, icon('help'), 'Still confused about'), h('ul', { class: 'q-list' }, items)));
  }

  if (e.flag) {
    const value = h('code', { class: 'flag-value' }, '••••••••••');
    let shown = false;
    const reveal = h('button', { type: 'button', class: 'btn btn-ghost btn-small', 'aria-pressed': 'false' }, icon('eye'), 'Reveal');
    reveal.addEventListener('click', () => {
      shown = !shown;
      value.textContent = shown ? e.flag : '••••••••••';
      reveal.setAttribute('aria-pressed', String(shown));
      reveal.replaceChildren(icon(shown ? 'eyeOff' : 'eye'), shown ? 'Hide' : 'Reveal');
    });
    page.append(h('section', { class: 'card' }, h('h2', null, icon('flag'), 'Level password / flag'),
      h('div', { class: 'flag-row' }, value, reveal, copyButton(() => e.flag, 'Copy level password or flag without showing it'))));
  }

  const confirmSlot = h('div');
  const editBtn = h('a', { class: 'btn btn-primary', href: `#/edit/${encodeURIComponent(e.id)}` }, icon('pen'), 'Edit');
  const deleteBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-danger-text' }, icon('trash'), 'Delete');
  const shareBtn = typeof navigator.share === 'function'
    ? h('button', { type: 'button', class: 'btn btn-ghost' }, icon('share'), 'Share as text')
    : h('button', { type: 'button', class: 'btn btn-ghost' }, icon('copy'), 'Copy as Markdown');
  shareBtn.addEventListener('click', async () => {
    const md = entryToMarkdown(e);
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: e.room || 'Cyber Logbook entry', text: md }); } catch { /* cancelled */ }
    } else {
      const ok = await copyText(md);
      toast(ok ? 'Copied as Markdown (without the flag)' : "Couldn't copy", { type: ok ? 'success' : 'error' });
    }
  });
  deleteBtn.addEventListener('click', () => {
    confirmSlot.replaceChildren(confirmPanel({
      title: 'Delete this entry?',
      message: 'It will also be removed from your other devices the next time they sync. You can undo straight after.',
      confirmLabel: 'Delete entry',
      onConfirm: async () => {
        const removed = await store.remove(e.id);
        location.hash = '#/journal';
        toast('Entry deleted', {
          action: {
            label: 'Undo',
            fn: async () => {
              await store.save({ ...removed });
              toast('Entry restored', { type: 'success' });
              window.dispatchEvent(new HashChangeEvent('hashchange')); // redraw whatever screen you're on
            },
          },
        });
      },
      onCancel: () => { confirmSlot.replaceChildren(); deleteBtn.focus(); },
    }));
  });
  page.append(confirmSlot, h('div', { class: 'btn-row entry-actions' }, editBtn, shareBtn, deleteBtn));
  page.append(h('p', { class: 'muted small' }, `Logged ${fmtDateTime(e.createdAt)} · last changed ${fmtDateTime(e.updatedAt)}`));
  return null;
}
