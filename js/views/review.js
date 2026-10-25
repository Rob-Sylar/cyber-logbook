// Review: a "Revisit" list (confidence 1–2) and flashcards built from your own entries.

import * as store from '../store.js';
import { CONFIDENCE } from '../model.js';
import { buildDeck, byNewest, confidenceLabel } from '../derive.js';
import { chip, confidenceDots, emptyState, fmtDate, h, icon, pageHead, toast } from '../ui.js';

export const title = 'Review';
export const refreshOn = 'none'; // don't reshuffle the deck under you when a sync lands

let kind = 'all';

export function render(page) {
  const entries = store.entries();
  page.append(pageHead('Review'));

  // ---- Revisit list
  const low = entries.filter((e) => e.confidence && e.confidence <= 2).sort((a, b) => a.confidence - b.confidence || byNewest(a, b));
  page.append(h('section', { class: 'card revisit', 'aria-labelledby': 'revisit-h' },
    h('h2', { id: 'revisit-h' }, icon('flame'), `Revisit (${low.length})`),
    low.length
      ? h('ul', { class: 'revisit-list' }, low.map((e) => h('li', null,
        h('a', { href: `#/entry/${encodeURIComponent(e.id)}` },
          h('span', { class: 'revisit-title' }, e.room || 'Untitled session'),
          h('span', { class: 'small muted' }, `${e.platform} · ${fmtDate(e.date, { day: 'numeric', month: 'short' })}`),
          confidenceDots(e.confidence)))))
      : h('p', { class: 'muted' }, 'Nothing rated 1 or 2 right now. Anything you rate low will appear here so you can go back to it.')));

  // ---- Flashcards
  const deckSection = h('section', { class: 'deck-section', 'aria-labelledby': 'deck-h' }, h('h2', { id: 'deck-h' }, 'Flashcards'));
  page.append(deckSection);
  if (!entries.length) {
    deckSection.append(emptyState('No cards yet', 'Cards are made from your takeaways and the commands you log.'));
    return null;
  }

  const kinds = [['all', 'Everything'], ['takeaways', 'Takeaways'], ['commands', 'Commands']];
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Which cards' });
  const shuffleBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, icon('shuffle'), 'Shuffle');
  const progress = h('p', { class: 'deck-progress muted', 'aria-live': 'polite' });
  const stage = h('div', { class: 'card-stage' });
  deckSection.append(h('div', { class: 'deck-controls' }, seg, shuffleBtn), progress, stage);

  let deck = [];
  let pos = 0;
  let again = 0;
  let known = 0;

  function start() {
    deck = buildDeck(store.entries(), kind);
    pos = 0;
    again = 0;
    known = 0;
    seg.replaceChildren(...kinds.map(([k, label]) => {
      const b = h('button', { type: 'button', class: 'seg-btn', 'aria-pressed': String(k === kind) }, label);
      b.addEventListener('click', () => { kind = k; start(); });
      return b;
    }));
    showCard(false);
  }

  function front(card, e) {
    if (card.type === 'learned') {
      return [h('p', { class: 'flash-kicker' }, h('span', { class: 'pill' }, e.platform), confidenceDots(e.confidence)),
        h('p', { class: 'flash-title' }, e.room || 'Untitled session'),
        h('p', { class: 'flash-prompt' }, 'What did you learn?')];
    }
    const c = e.commands.find((x) => x.id === card.cmdId);
    return [h('p', { class: 'flash-kicker' }, h('span', { class: 'pill' }, 'Command'), h('span', { class: 'small muted' }, e.room || e.platform)),
      h('pre', { class: 'code flash-code' }, h('code', null, c ? c.cmd : '')),
      h('p', { class: 'flash-prompt' }, 'What does this command do?')];
  }

  function back(card, e) {
    if (card.type === 'learned') {
      const out = [];
      if (e.learned) out.push(h('h3', { class: 'flash-label' }, 'Takeaway'), h('p', { class: 'flash-answer' }, e.learned));
      if (e.explain) out.push(h('h3', { class: 'flash-label' }, 'Explained to a mate'), h('p', { class: 'flash-answer' }, e.explain));
      const confGroup = h('fieldset', { class: 'fieldset flash-conf' },
        h('legend', { class: 'label-small' }, 'How confident are you now?'),
        h('div', { class: 'chips chips-conf' }, CONFIDENCE.map((c) => chip('radio', `conf-${card.key}`, String(c.value), String(c.value), e.confidence === c.value, { 'aria-label': `${c.value}: ${c.label}` }))));
      confGroup.addEventListener('change', async (ev) => {
        const current = store.get(e.id);
        if (!current) return;
        const n = Number(ev.target.value);
        try {
          await store.save({ ...current, confidence: n });
          toast(`Confidence updated to ${n} (${confidenceLabel(n)})`, { type: 'success', timeout: 2500 });
        } catch {
          toast("Couldn't save that.", { type: 'error' });
        }
      });
      out.push(confGroup);
      return out;
    }
    const c = e.commands.find((x) => x.id === card.cmdId) || {};
    return [
      h('h3', { class: 'flash-label' }, 'What it does'),
      h('p', { class: 'flash-answer' }, c.what || '(no description yet)'),
      c.example ? h('h3', { class: 'flash-label' }, 'Example') : null,
      c.example ? h('pre', { class: 'code' }, h('code', null, c.example)) : null,
    ];
  }

  function showCard(focus = true) {
    shuffleBtn.disabled = !deck.length;
    if (!deck.length) {
      progress.textContent = '';
      stage.replaceChildren(emptyState('No cards of this kind yet',
        kind === 'commands' ? 'Commands need a "what it does" description to become cards.' : 'Add a takeaway or an explanation to an entry.'));
      return;
    }
    if (pos >= deck.length) {
      progress.textContent = '';
      const restart = h('button', { type: 'button', class: 'btn btn-primary' }, icon('shuffle'), 'Go again');
      restart.addEventListener('click', () => { start(); stage.querySelector('button')?.focus(); });
      stage.replaceChildren(h('div', { class: 'flash done' },
        h('p', { class: 'flash-title' }, 'Deck done!'),
        h('p', null, `${known} got it · ${again} to go over again.`),
        restart));
      if (focus) restart.focus();
      return;
    }
    const card = deck[pos];
    const e = store.get(card.entryId);
    if (!e) { pos++; showCard(focus); return; }
    progress.textContent = `Card ${pos + 1} of ${deck.length}`;
    const answerId = `ans-${pos}`;
    const reveal = h('button', { type: 'button', class: 'btn btn-primary btn-big', 'aria-expanded': 'false', 'aria-controls': answerId }, 'Show answer');
    const answer = h('div', { class: 'flash-back', id: answerId, hidden: true, tabindex: '-1' }, back(card, e),
      h('a', { class: 'small', href: `#/entry/${encodeURIComponent(e.id)}` }, 'Open the full entry'));
    const againBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Again');
    const gotBtn = h('button', { type: 'button', class: 'btn btn-primary' }, icon('check'), 'Got it');
    const grade = h('div', { class: 'btn-row flash-grade', hidden: true }, againBtn, gotBtn);
    const flash = h('div', { class: 'flash' }, h('div', { class: 'flash-front' }, front(card, e)), answer, reveal, grade);
    reveal.addEventListener('click', () => {
      answer.hidden = false;
      grade.hidden = false;
      reveal.hidden = true;
      reveal.setAttribute('aria-expanded', 'true');
      flash.classList.add('is-flipped');
      answer.focus();
    });
    againBtn.addEventListener('click', () => {
      again++;
      deck.push({ ...card }); // see it again later in this round
      pos++;
      showCard();
    });
    gotBtn.addEventListener('click', () => {
      known++;
      pos++;
      showCard();
    });
    stage.replaceChildren(flash);
    if (focus) reveal.focus();
  }

  shuffleBtn.addEventListener('click', () => { start(); toast('Shuffled. Lowest confidence still comes first.', { timeout: 2000 }); });
  start();
  return null;
}
