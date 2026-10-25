// Every "still confused about" item across all entries, so you can come back and tick them off.

import * as store from '../store.js';
import { collectQuestions } from '../derive.js';
import { debounce, emptyState, field, fmtDate, h, pageHead, toast } from '../ui.js';

export const title = 'Questions';
export const wide = true;

let tab = 'open';

async function updateQuestion(entryId, qId, patch) {
  const e = store.get(entryId);
  if (!e) return;
  const questions = e.questions.map((q) => (q.id === qId ? { ...q, ...patch } : q));
  await store.save({ ...e, questions });
}

export function render(page) {
  const items = collectQuestions(store.entries());
  const open = items.filter((i) => !i.q.solved);
  const done = items.filter((i) => i.q.solved);
  page.append(pageHead('Questions'));

  if (!items.length) {
    page.append(emptyState('No questions logged', 'When something confuses you, add it under "Still confused about" in an entry. It will wait here until you work it out.'));
    return null;
  }

  const openBtn = h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(tab === 'open') }, `Open (${open.length})`);
  const doneBtn = h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(tab === 'done') }, `Figured out (${done.length})`);
  const list = h('ul', { class: 'q-cards' });
  const counts = () => {
    const all = collectQuestions(store.entries());
    const o = all.filter((i) => !i.q.solved).length;
    openBtn.textContent = `Open (${o})`;
    doneBtn.textContent = `Figured out (${all.length - o})`;
  };

  function card({ entry, q }) {
    const boxId = `qq-${entry.id}-${q.id}`;
    const box = h('input', { type: 'checkbox', id: boxId, checked: q.solved });
    const answer = h('textarea', { class: 'input', rows: '2', value: q.answer, placeholder: 'Write the answer when you work it out' });
    const li = h('li', { class: `q-card ${q.solved ? 'is-solved' : ''}` },
      h('p', { class: 'q-text' }, q.q || '(no question written)'),
      h('p', { class: 'small muted' }, 'From ', h('a', { href: `#/entry/${encodeURIComponent(entry.id)}` }, `${entry.platform} · ${entry.room || 'Untitled'}`), ` · ${fmtDate(entry.date, { day: 'numeric', month: 'short', year: 'numeric' })}`),
      h('label', { class: 'check', for: boxId }, box, h('span', null, 'Figured it out')),
      field('Answer', answer));
    box.addEventListener('change', async () => {
      try {
        await updateQuestion(entry.id, q.id, { solved: box.checked, answer: answer.value });
        li.classList.toggle('is-solved', box.checked);
        counts();
        toast(box.checked ? 'Nice one. Moved to "Figured out".' : 'Moved back to open questions.', { type: 'success', timeout: 2500 });
      } catch {
        box.checked = !box.checked;
        toast("Couldn't save that change.", { type: 'error' });
      }
    });
    const saveAnswer = debounce(() => {
      updateQuestion(entry.id, q.id, { answer: answer.value }).catch(() => toast("Couldn't save the answer.", { type: 'error' }));
    }, 700);
    answer.addEventListener('input', saveAnswer);
    answer.addEventListener('blur', () => saveAnswer.flush());
    return li;
  }

  function show() {
    openBtn.setAttribute('aria-pressed', String(tab === 'open'));
    doneBtn.setAttribute('aria-pressed', String(tab === 'done'));
    const fresh = collectQuestions(store.entries()).filter((i) => (tab === 'open' ? !i.q.solved : i.q.solved));
    if (!fresh.length) {
      list.replaceChildren(h('li', { class: 'q-empty' }, emptyState(tab === 'open' ? 'No open questions' : 'Nothing ticked off yet', tab === 'open' ? 'Everything you were confused about is figured out. Good going.' : '')));
      return;
    }
    list.replaceChildren(...fresh.map(card));
  }
  openBtn.addEventListener('click', () => { tab = 'open'; show(); });
  doneBtn.addEventListener('click', () => { tab = 'done'; show(); });

  page.append(h('div', { class: 'segmented', role: 'group', 'aria-label': 'Which questions' }, openBtn, doneBtn), list);
  show();
  return null;
}
