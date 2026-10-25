// "Log a session" form (also used to edit an entry). Drafts autosave as you type.

import * as store from '../store.js';
import * as db from '../db.js';
import * as images from '../images.js';
import { CONFIDENCE, MINUTE_PRESETS, PLATFORMS, cleanLine, isValidDateStr, isValidId, localDateISO, newId, normalizeEntry, nowISO, safeUrl } from '../model.js';
import { isStandalone } from '../pwa.js';
import { anyDialogOpen, imageFilesFrom, shotsEditor } from '../shots.js';
import { chip, confirmPanel, debounce, emptyState, field, fmtClock, fmtDateTime, h, icon, lsGet, lsSet, setError, toast, uid } from '../ui.js';

export const title = 'Log a session';
export const refreshOn = 'none';

const MINUTE_LABELS = { 15: '15 min', 30: '30 min', 45: '45 min', 60: '1 hr', 90: '1½ hr' };

function blankDraft() {
  const last = lsGet('cl-last-platform');
  return {
    id: null, date: localDateISO(), minutes: 30, platform: PLATFORMS.includes(last) ? last : '', room: '', link: '', tags: [],
    did: '', learned: '', explain: '', commands: [], shots: [], questions: [], confidence: null, flag: '', quick: lsGet('cl-quick') === '1',
  };
}

function draftFromEntry(e) {
  return {
    id: e.id, date: e.date, minutes: e.minutes, platform: e.platform, room: e.room, link: e.link, tags: [...e.tags],
    did: e.did, learned: e.learned, explain: e.explain,
    commands: e.commands.map((c) => ({ ...c })), shots: e.shots.map((s) => ({ ...s })), questions: e.questions.map((q) => ({ ...q })),
    confidence: e.confidence, flag: e.flag, quick: false,
  };
}

// Images added to a draft that was then thrown away were never saved anywhere else.
function discardDraftImages(draftShots, editing) {
  const saved = new Set(editing ? editing.shots.map((s) => s.id) : []);
  const unsaved = (draftShots || []).map((s) => s && s.id).filter((id) => isValidId(id) && !saved.has(id));
  return images.deleteImages(unsaved).catch(() => {});
}

// Saved drafts get the same validation as imported data.
function draftFromStored(raw, base) {
  if (!raw || typeof raw !== 'object') return base;
  const e = normalizeEntry({ ...raw, id: isValidId(raw.id) ? raw.id : 'draft' });
  if (!e || e.deleted) return base;
  const d = draftFromEntry(e);
  d.id = base.id;
  d.link = typeof raw.link === 'string' ? cleanLine(raw.link, 2048) : '';
  d.platform = typeof raw.platform === 'string' && raw.platform.trim() ? e.platform : '';
  d.quick = raw.quick === true && !base.id;
  if (!isValidDateStr(raw.date)) d.date = base.date;
  return d;
}

const hasContent = (d) => !!(d.room || d.link || d.did || d.learned || d.explain || d.flag || d.tags.length || d.shots.length
  || d.commands.some((c) => c.cmd || c.what || c.example) || d.questions.some((q) => q.q || q.answer));

export async function render(page, param) {
  const editing = param ? store.get(param) : null;
  if (param && !editing) {
    page.append(emptyState('Entry not found', 'It may have been deleted on another device.', h('a', { class: 'btn btn-primary', href: '#/journal' }, 'Back to journal')));
    return null;
  }
  const draftKey = editing ? `draft:${editing.id}` : 'draft:new';
  const base = editing ? draftFromEntry(editing) : blankDraft();
  let draft = base;
  let restoredAt = null;
  try {
    const stored = await db.kvGet(draftKey);
    if (stored && stored.data && (!editing || stored.base === editing.updatedAt)) {
      draft = draftFromStored(stored.data, base);
      restoredAt = stored.savedAt;
    } else if (stored) {
      await db.kvDel(draftKey); // an old edit draft for a version that has since changed
      await discardDraftImages(stored.data && stored.data.shots, editing);
    }
  } catch { /* drafts are a convenience; carry on without */ }

  const status = h('span', { class: 'draft-status' });
  const persist = debounce(async () => {
    try {
      if (!editing && !hasContent(draft)) {
        await db.kvDel(draftKey);
        status.textContent = '';
        return;
      }
      await db.kvSet(draftKey, { savedAt: nowISO(), base: editing ? editing.updatedAt : null, data: draft });
      status.textContent = `Draft saved ${fmtClock()}`;
    } catch {
      status.textContent = 'Draft could not be saved';
    }
  }, 400);
  const changed = () => persist();

  const form = h('form', { class: 'log-form', novalidate: true, 'aria-labelledby': 'log-title' });

  // ---- header + quick log switch
  const quickToggle = h('input', { type: 'checkbox', role: 'switch', class: 'switch-input', id: 'quick-toggle', checked: draft.quick });
  const head = h('div', { class: 'page-head' },
    h('h1', { id: 'log-title', tabindex: '-1' }, editing ? 'Edit entry' : 'Log a session'),
    editing ? null : h('label', { class: 'switch', for: 'quick-toggle' }, quickToggle, h('span', { class: 'switch-track', 'aria-hidden': 'true' }), h('span', null, 'Quick log')));
  page.append(head);

  if (!editing && !isStandalone() && lsGet('cl-install-hint') !== 'hidden') {
    const hint = h('div', { class: 'notice' }, icon('install'),
      h('p', null, 'Use Cyber Logbook like a normal app, even offline. ', h('a', { href: '#/install' }, 'How to install it')));
    const close = h('button', { type: 'button', class: 'icon-btn icon-btn-small', 'aria-label': 'Hide install tip' }, icon('x'));
    close.addEventListener('click', () => { lsSet('cl-install-hint', 'hidden'); hint.remove(); });
    hint.append(close);
    page.append(hint);
  }

  if (restoredAt) {
    const fresh = h('button', { type: 'button', class: 'btn btn-small btn-ghost' }, editing ? 'Discard my changes' : 'Start fresh');
    fresh.addEventListener('click', async () => {
      persist.cancel();
      await db.kvDel(draftKey).catch(() => {});
      await discardDraftImages(draft.shots, editing);
      rerender();
    });
    page.append(h('div', { class: 'notice notice-info', role: 'status' },
      h('p', null, `Restored your unsaved ${editing ? 'changes' : 'draft'} from ${fmtDateTime(restoredAt)}.`), fresh));
  }
  // Let the router rebuild this screen so listeners are cleaned up properly.
  function rerender() {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  // ---- date + time
  const dateInput = h('input', { type: 'date', class: 'input', id: 'f-date', value: draft.date, required: true });
  dateInput.addEventListener('input', () => { draft.date = dateInput.value; changed(); });

  const isPreset = MINUTE_PRESETS.includes(draft.minutes);
  const custom = h('input', { type: 'number', class: 'input input-narrow', id: 'f-minutes-custom', min: '1', max: '1440', step: '1', inputmode: 'numeric', value: isPreset ? '' : String(draft.minutes || '') });
  const customWrap = h('div', { class: 'custom-minutes', hidden: isPreset },
    h('label', { for: 'f-minutes-custom', class: 'label-inline' }, 'Minutes'), custom);
  const minutesGroup = h('fieldset', { class: 'fieldset', id: 'f-minutes' },
    h('legend', { class: 'label' }, 'Time spent'),
    h('div', { class: 'chips' },
      MINUTE_PRESETS.map((m) => chip('radio', 'minutes', String(m), MINUTE_LABELS[m], isPreset && draft.minutes === m)),
      chip('radio', 'minutes', 'custom', 'Custom', !isPreset)),
    customWrap,
    h('p', { class: 'field-error', id: 'f-minutes-err', hidden: true }));
  minutesGroup.addEventListener('change', (ev) => {
    if (ev.target.name !== 'minutes') return;
    if (ev.target.value === 'custom') {
      customWrap.hidden = false;
      draft.minutes = Number.parseInt(custom.value, 10) || 0;
      custom.focus();
    } else {
      customWrap.hidden = true;
      draft.minutes = Number(ev.target.value);
    }
    changed();
  });
  custom.addEventListener('input', () => { draft.minutes = Number.parseInt(custom.value, 10) || 0; changed(); });

  const dateField = field('Date', dateInput);
  dateField.dataset.full = '';

  // ---- platform
  const platformGroup = h('fieldset', { class: 'fieldset', id: 'f-platform' },
    h('legend', { class: 'label' }, 'Platform'),
    h('div', { class: 'chips' }, PLATFORMS.map((p) => chip('radio', 'platform', p, p, draft.platform === p))),
    h('p', { class: 'field-error', id: 'f-platform-err', hidden: true }));
  if (draft.platform && !PLATFORMS.includes(draft.platform)) {
    platformGroup.querySelector('.chips').append(chip('radio', 'platform', draft.platform, draft.platform, true));
  }
  platformGroup.addEventListener('change', (ev) => {
    if (ev.target.name !== 'platform') return;
    draft.platform = ev.target.value;
    setError(platformGroup, '');
    changed();
  });

  // ---- room + link
  const room = h('input', { type: 'text', class: 'input', id: 'f-room', value: draft.room, maxlength: '300', autocomplete: 'off', placeholder: 'e.g. Bandit Level 4 → 5, or "Linux Fundamentals 1"' });
  room.addEventListener('input', () => { draft.room = room.value; setError(room, ''); changed(); });
  const link = h('input', { type: 'url', class: 'input', id: 'f-link', value: draft.link, inputmode: 'url', autocomplete: 'off', placeholder: 'https://tryhackme.com/room/…' });
  link.addEventListener('input', () => { draft.link = link.value; setError(link, ''); changed(); });
  link.addEventListener('blur', () => {
    if (link.value.trim() && !safeUrl(link.value)) setError(link, 'That link needs to be a normal web address (http:// or https://).');
  });
  const linkField = field('Link (optional)', link);
  linkField.dataset.full = '';

  // ---- tags
  const tagChips = h('div', { class: 'chips' });
  function renderTags() {
    const all = store.allTags();
    for (const t of draft.tags) if (!all.some((x) => x.toLowerCase() === t.toLowerCase())) all.push(t);
    tagChips.replaceChildren(...all.map((t) => chip('checkbox', 'tags', t, t, draft.tags.some((x) => x.toLowerCase() === t.toLowerCase()))));
  }
  renderTags();
  tagChips.addEventListener('change', (ev) => {
    if (ev.target.name !== 'tags') return;
    const v = ev.target.value;
    draft.tags = ev.target.checked ? [...draft.tags, v] : draft.tags.filter((t) => t.toLowerCase() !== v.toLowerCase());
    changed();
  });
  const newTag = h('input', { type: 'text', class: 'input', id: 'f-newtag', maxlength: '40', autocomplete: 'off', placeholder: 'e.g. Privilege escalation', dataset: { enter: 'add' } });
  const addTagBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, icon('plus'), 'Add tag');
  async function addTag() {
    const t = cleanLine(newTag.value, 40);
    if (!t) return;
    const existing = store.allTags().find((x) => x.toLowerCase() === t.toLowerCase());
    if (!existing) await store.updateSettings({ customTags: [...store.getSettings().customTags, t] }).catch(() => {});
    const name = existing || t;
    if (!draft.tags.some((x) => x.toLowerCase() === name.toLowerCase())) draft.tags.push(name);
    newTag.value = '';
    renderTags();
    changed();
    newTag.focus();
  }
  addTagBtn.addEventListener('click', addTag);
  newTag.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); addTag(); }
  });
  const tagsGroup = h('fieldset', { class: 'fieldset', 'data-full': '' },
    h('legend', { class: 'label' }, 'Topic tags'),
    tagChips,
    h('div', { class: 'inline-add' }, h('label', { class: 'visually-hidden', for: 'f-newtag' }, 'New tag name'), newTag, addTagBtn));

  // ---- free text
  function textArea(id, key, rows, placeholder) {
    const el = h('textarea', { class: 'input', id, rows: String(rows), placeholder, value: draft[key] });
    el.addEventListener('input', () => { draft[key] = el.value; setError(el, ''); changed(); });
    return el;
  }
  const did = textArea('f-did', 'did', 4, 'What you worked through, step by step');
  const learned = textArea('f-learned', 'learned', 3, 'The one thing you want to remember');
  const explain = textArea('f-explain', 'explain', 6, 'e.g. "SUID is like a staff badge stuck to a program: whoever runs it gets the badge-owner\'s access…"');
  const didField = field('What I did', did);
  didField.dataset.full = '';
  const learnedField = field('What I learned', learned, { hint: 'The key takeaway.' });

  const explainCard = h('section', { class: 'explain-card', 'data-full': '', 'aria-labelledby': 'explain-heading' },
    h('div', { class: 'explain-head' }, icon('message'),
      h('h2', { id: 'explain-heading' }, h('label', { for: 'f-explain' }, 'Explain it to a mate'))),
    h('p', { class: 'hint', id: 'f-explain-hint' }, 'Plain words, like you\'re telling someone at work over a brew. If you can\'t explain it simply, that\'s the bit to revisit.'),
    explain);
  explain.setAttribute('aria-describedby', 'f-explain-hint');

  // ---- commands
  const cmdList = h('div', { class: 'repeat-list' });
  const addCmd = h('button', { type: 'button', class: 'btn btn-ghost btn-add' }, icon('plus'), 'Add a command');
  function renderCmds(focusIndex = null) {
    cmdList.replaceChildren(...draft.commands.map((row, i) => cmdRow(row, i)));
    if (focusIndex !== null) cmdList.children[focusIndex]?.querySelector('textarea')?.focus();
  }
  function cmdRow(row, i) {
    const n = i + 1;
    const cmd = h('textarea', { class: 'input mono', id: `cmd-${row.id}`, rows: '1', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', placeholder: 'e.g. find / -perm -4000 2>/dev/null', value: row.cmd });
    const what = h('input', { type: 'text', class: 'input', id: `what-${row.id}`, autocomplete: 'off', placeholder: 'e.g. Finds programs with the SUID bit set', value: row.what });
    const example = h('textarea', { class: 'input mono', id: `ex-${row.id}`, rows: '1', spellcheck: 'false', autocapitalize: 'off', placeholder: 'Optional', value: row.example });
    cmd.addEventListener('input', () => { row.cmd = cmd.value; changed(); });
    what.addEventListener('input', () => { row.what = what.value; changed(); });
    example.addEventListener('input', () => { row.example = example.value; changed(); });
    const remove = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove command ${n}` }, icon('trash'));
    remove.addEventListener('click', () => {
      draft.commands.splice(i, 1);
      changed();
      renderCmds();
      (cmdList.children[i]?.querySelector('textarea') || addCmd).focus();
    });
    return h('div', { class: 'repeat-row', role: 'group', 'aria-label': `Command ${n}` },
      h('div', { class: 'repeat-head' }, h('span', { class: 'repeat-num' }, `Command ${n}`), remove),
      field('Command', cmd), field('What it does', what), field('Example (optional)', example));
  }
  addCmd.addEventListener('click', () => {
    draft.commands.push({ id: newId('r'), cmd: '', what: '', example: '' });
    changed();
    renderCmds(draft.commands.length - 1);
  });
  renderCmds();
  const cmdSection = h('section', { class: 'form-section', 'data-full': '', 'aria-labelledby': 'h-cmds' },
    h('h2', { id: 'h-cmds' }, 'Commands I used'),
    h('p', { class: 'hint' }, 'These build your personal cheat sheet.'),
    cmdList, addCmd);

  // ---- screenshots
  const pageLife = new AbortController();
  const shotUi = shotsEditor({
    shots: draft.shots,
    onChange: () => { applyQuick(); changed(); },
    savedIds: new Set(editing ? editing.shots.map((s) => s.id) : []),
    signal: pageLife.signal,
  });

  // ---- questions
  const qList = h('div', { class: 'repeat-list' });
  const addQ = h('button', { type: 'button', class: 'btn btn-ghost btn-add' }, icon('plus'), 'Add a question');
  function renderQs(focusIndex = null) {
    qList.replaceChildren(...draft.questions.map((row, i) => qRow(row, i)));
    if (focusIndex !== null) qList.children[focusIndex]?.querySelector('textarea')?.focus();
  }
  function qRow(row, i) {
    const n = i + 1;
    const q = h('textarea', { class: 'input', id: `q-${row.id}`, rows: '2', placeholder: 'e.g. Why does sudo -l show (ALL) NOPASSWD?', value: row.q });
    const solvedId = uid('solved');
    const solved = h('input', { type: 'checkbox', id: solvedId, checked: row.solved });
    const answer = h('textarea', { class: 'input', id: `a-${row.id}`, rows: '2', placeholder: 'When you work it out, write the answer here', value: row.answer });
    q.addEventListener('input', () => { row.q = q.value; changed(); });
    solved.addEventListener('change', () => { row.solved = solved.checked; changed(); });
    answer.addEventListener('input', () => { row.answer = answer.value; changed(); });
    const remove = h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Remove question ${n}` }, icon('trash'));
    remove.addEventListener('click', () => {
      draft.questions.splice(i, 1);
      changed();
      renderQs();
      (qList.children[i]?.querySelector('textarea') || addQ).focus();
    });
    return h('div', { class: 'repeat-row', role: 'group', 'aria-label': `Question ${n}` },
      h('div', { class: 'repeat-head' }, h('span', { class: 'repeat-num' }, `Question ${n}`), remove),
      field('What confuses me', q),
      h('label', { class: 'check', for: solvedId }, solved, h('span', null, 'Figured it out')),
      field('Answer', answer));
  }
  addQ.addEventListener('click', () => {
    draft.questions.push({ id: newId('r'), q: '', solved: false, answer: '' });
    changed();
    renderQs(draft.questions.length - 1);
  });
  renderQs();
  const qSection = h('section', { class: 'form-section', 'data-full': '', 'aria-labelledby': 'h-qs' },
    h('h2', { id: 'h-qs' }, 'Still confused about'),
    h('p', { class: 'hint' }, 'Open questions show up on the Questions screen until you tick them off.'),
    qList, addQ);

  // ---- confidence
  const confDesc = h('p', { class: 'hint conf-desc', id: 'f-conf-desc' });
  const setConfDesc = () => {
    confDesc.textContent = draft.confidence ? `${draft.confidence} – ${CONFIDENCE[draft.confidence - 1].label}` : 'Not rated yet. 1 = needed lots of help, 5 = could teach it.';
  };
  setConfDesc();
  const confGroup = h('fieldset', { class: 'fieldset', 'data-full': '', 'aria-describedby': 'f-conf-desc' },
    h('legend', { class: 'label' }, 'Confidence: could you do this again without help?'),
    h('div', { class: 'chips chips-conf' }, CONFIDENCE.map((c) => chip('radio', 'confidence', String(c.value), String(c.value), draft.confidence === c.value, { 'aria-label': `${c.value}: ${c.label}` }))),
    confDesc);
  confGroup.addEventListener('change', (ev) => {
    if (ev.target.name !== 'confidence') return;
    draft.confidence = Number(ev.target.value);
    setConfDesc();
    changed();
  });

  // ---- flag / password
  const flag = h('input', { type: 'text', class: 'input mono masked', id: 'f-flag', value: draft.flag, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'data-lpignore': 'true' });
  flag.addEventListener('input', () => { draft.flag = flag.value; changed(); });
  const reveal = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-pressed': 'false', 'aria-controls': 'f-flag' }, icon('eye'), h('span', null, 'Show'));
  reveal.addEventListener('click', () => {
    const show = flag.classList.toggle('masked') === false;
    reveal.setAttribute('aria-pressed', String(show));
    reveal.replaceChildren(icon(show ? 'eyeOff' : 'eye'), h('span', null, show ? 'Hide' : 'Show'));
  });
  const flagField = h('div', { class: 'field', 'data-full': '' },
    h('label', { class: 'label', for: 'f-flag' }, 'Level password / flag (private)'),
    h('p', { class: 'hint', id: 'f-flag-hint' }, 'Hidden unless you tap Show. Kept on this device and in your synced Gist, so never put a real-life password here.'),
    h('div', { class: 'input-with-btn' }, flag, reveal));
  flag.setAttribute('aria-describedby', 'f-flag-hint');

  // ---- actions
  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-big' }, icon('check'), editing ? 'Save changes' : 'Save entry');
  const secondary = h('button', { type: 'button', class: 'btn btn-ghost' }, editing ? 'Cancel' : 'Clear form');
  const confirmSlot = h('div');
  secondary.addEventListener('click', async () => {
    if (editing) {
      persist.cancel();
      await db.kvDel(draftKey).catch(() => {});
      await discardDraftImages(draft.shots, editing);
      location.hash = `#/entry/${editing.id}`;
      return;
    }
    if (!hasContent(draft)) return;
    confirmSlot.replaceChildren(confirmPanel({
      title: 'Clear this form?',
      message: 'Everything you have typed here will be thrown away.',
      confirmLabel: 'Clear form',
      onConfirm: async () => {
        persist.cancel();
        await db.kvDel(draftKey).catch(() => {});
        await discardDraftImages(draft.shots, editing);
        rerender();
      },
      onCancel: () => { confirmSlot.replaceChildren(); secondary.focus(); },
    }));
  });
  const actions = h('div', { class: 'form-actions' }, h('div', { class: 'btn-row' }, saveBtn, secondary), status);

  form.append(
    h('div', { class: 'form-grid' }, dateField, minutesGroup),
    platformGroup,
    h('div', { class: 'form-grid' }, field('Room, level or lab name', room), linkField),
    tagsGroup,
    didField,
    learnedField,
    explainCard,
    cmdSection,
    shotUi.el,
    qSection,
    confGroup,
    flagField,
    confirmSlot,
    actions,
  );
  page.append(form);

  function applyQuick() {
    form.classList.toggle('is-quick', !!draft.quick);
    form.querySelectorAll('[data-full]').forEach((el) => { el.hidden = !!draft.quick; });
    // Quick log hides the Screenshots section until you paste or drop one in.
    shotUi.el.hidden = !!draft.quick && draft.shots.length === 0;
  }
  applyQuick();
  quickToggle.addEventListener('change', () => {
    draft.quick = quickToggle.checked;
    lsSet('cl-quick', draft.quick ? '1' : null);
    applyQuick();
    changed();
  });

  // Enter in a one-line box shouldn't save the whole form by accident.
  form.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (ev.key === 'Enter' && t instanceof HTMLInputElement && !['checkbox', 'radio', 'submit', 'button'].includes(t.type)) ev.preventDefault();
  });

  function validate() {
    const problems = [];
    if (!draft.platform) {
      setError(platformGroup, 'Pick a platform.');
      problems.push(platformGroup.querySelector('input'));
    }
    if (!draft.room.trim() && !draft.learned.trim()) {
      setError(room, 'Add a room, level or lab name (or a takeaway).');
      problems.push(room);
    }
    if (draft.link.trim() && !safeUrl(draft.link)) {
      setError(link, 'That link needs to be a normal web address (http:// or https://).');
      if (!draft.quick) problems.push(link);
    }
    if (!Number.isFinite(draft.minutes) || draft.minutes < 1 || draft.minutes > 1440) {
      setError(minutesGroup, 'Enter the time spent, between 1 and 1440 minutes.');
      problems.push(customWrap.hidden ? minutesGroup.querySelector('input') : custom);
    } else setError(minutesGroup, '');
    if (!isValidDateStr(draft.date)) {
      setError(dateInput, 'Pick a valid date.');
      if (!draft.quick) problems.push(dateInput);
      else draft.date = localDateISO();
    } else setError(dateInput, '');
    const visible = problems.filter((el) => el && !el.closest('[hidden]'));
    if (visible.length) {
      visible[0].focus();
      toast('Some details need fixing before saving.', { type: 'error' });
      return false;
    }
    return true;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    saveBtn.disabled = true;
    try {
      persist.cancel();
      const saved = await store.save({
        ...draft,
        id: editing ? editing.id : undefined,
        link: safeUrl(draft.link),
        quick: !editing && !!draft.quick,
        confidence: draft.confidence,
      });
      await db.kvDel(draftKey).catch(() => {});
      lsSet('cl-last-platform', saved.platform);
      toast(editing ? 'Changes saved' : 'Session logged', { type: 'success' });
      location.hash = `#/entry/${saved.id}`;
    } catch (err) {
      toast(`Couldn't save: ${err && err.message ? err.message : 'storage error'}`, { type: 'error' });
      saveBtn.disabled = false;
    }
  });

  // Ctrl+V anywhere on the form adds a screenshot (Win+Shift+S puts one on the clipboard).
  // Ordinary text pastes into a text box are left alone.
  document.addEventListener('paste', (e) => {
    if (anyDialogOpen()) return;
    const files = imageFilesFrom(e.clipboardData);
    if (!files.length) return;
    const t = e.target;
    const inTextBox = t instanceof HTMLElement && t.matches('input, textarea, [contenteditable]');
    if (inTextBox && e.clipboardData.types.includes('text/plain')) return;
    e.preventDefault();
    shotUi.el.hidden = false;
    shotUi.addFiles(files);
  }, { signal: pageLife.signal });
  // Image files dropped anywhere on the page go to Screenshots (instead of the browser opening them).
  const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, { signal: pageLife.signal });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (anyDialogOpen()) return;
    const files = imageFilesFrom(e.dataTransfer);
    if (!files.length) {
      toast('Only image files can be added as screenshots.', { type: 'error' });
      return;
    }
    shotUi.el.hidden = false;
    shotUi.addFiles(files);
  }, { signal: pageLife.signal });

  const onHide = () => { if (document.visibilityState === 'hidden') persist.flush(); };
  document.addEventListener('visibilitychange', onHide);
  return () => {
    document.removeEventListener('visibilitychange', onHide);
    pageLife.abort();
    persist.flush();
  };
}
