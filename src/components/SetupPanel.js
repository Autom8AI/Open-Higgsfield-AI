// Shot setup shown at the top of the Video and Image prompt bars:
//   1. Look        - Realistic, UGC, Cartoon... (filters the model list)
//   2. Keep same   - Character and/or Item locks. Turning one on opens a tray
//                    where you add one or more characters/items, each with
//                    one or more photos (saved characters or uploads).
// The studio reads getState() to filter models and build the request.
import { kie } from '../lib/kie.js';
import { listCharacters, compressImage } from '../lib/characters.js';
import { esc } from '../lib/resultCards.js';

const GROUPS = {
    character: { label: 'Character', noun: 'Character', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg>', tip: 'Keeps a face and body the same' },
    item: { label: 'Item', noun: 'Item', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></svg>', tip: 'Keeps a product, outfit or object the same' },
};

let seq = 0;

export function createSetupPanel({ styles, onChange }) {
    const state = {
        style: 'any',
        character: { on: false, entries: [] },
        item: { on: false, entries: [] },
        limit: null, // { max, model } from the studio for the "up to N photos" line
    };

    const el = document.createElement('div');
    el.className = 'flex flex-col gap-3 px-2 pb-4 mb-3 border-b border-white/5';

    const changed = () => { render(); onChange?.(); };

    // ---------- rendering ----------
    function chip(label, active, onClick, title = '') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `px-3 py-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${active ? 'bg-primary text-black border-primary' : 'bg-white/5 text-white/80 border-white/10 hover:border-primary/40 hover:text-white'}`;
        b.textContent = label;
        if (title) b.title = title;
        b.onclick = (e) => { e.stopPropagation(); onClick(); };
        return b;
    }

    function row(labelText) {
        const r = document.createElement('div');
        r.className = 'flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3';
        const l = document.createElement('div');
        l.className = 'sm:w-24 shrink-0 sm:pt-1.5 text-[10px] font-bold uppercase tracking-widest text-secondary';
        l.textContent = labelText;
        const body = document.createElement('div');
        body.className = 'flex flex-wrap items-center gap-1.5 min-w-0 flex-1';
        r.append(l, body);
        return { r, body };
    }

    function render() {
        el.innerHTML = '';

        const look = row('1 · Look');
        styles.forEach(s => look.body.appendChild(chip(s.label, state.style === s.id, () => { state.style = s.id; changed(); }, s.hint)));
        el.appendChild(look.r);

        const keep = row('2 · Keep same');
        for (const [key, g] of Object.entries(GROUPS)) {
            const on = state[key].on;
            const b = chip('', on, () => {
                state[key].on = !on;
                changed();
            }, g.tip);
            b.innerHTML = `<span class="inline-flex items-center gap-1.5">${g.icon}<span>${on ? '✓ ' : '+ '}${g.label}</span></span>`;
            keep.body.appendChild(b);
        }
        if (!state.character.on && !state.item.on) {
            const hint = document.createElement('span');
            hint.className = 'text-[10px] text-muted ml-1';
            hint.textContent = 'Lock a face or a product with photos';
            keep.body.appendChild(hint);
        }
        el.appendChild(keep.r);

        for (const key of ['character', 'item']) if (state[key].on) el.appendChild(tray(key));

        if (state.character.on || state.item.on) {
            const n = refUrls().length;
            const line = document.createElement('div');
            line.className = 'sm:pl-[6.75rem] text-[10px]';
            const over = state.limit && n > state.limit.max;
            line.classList.add(over ? 'text-[#ff6b6b]' : 'text-muted');
            line.textContent = state.limit
                ? `${n} photo${n === 1 ? '' : 's'} · ${state.limit.model} keeps up to ${state.limit.max}${over ? ' — remove some or pick another model' : ''}`
                : `${n} photo${n === 1 ? '' : 's'}`;
            el.appendChild(line);
        }
    }

    function tray(key) {
        const g = GROUPS[key];
        const box = document.createElement('div');
        box.className = 'sm:ml-[6.75rem] flex flex-col gap-2 bg-black/20 border border-white/5 rounded-2xl p-3';
        const entries = state[key].entries;

        entries.forEach((entry, idx) => {
            const line = document.createElement('div');
            line.className = 'flex items-center gap-2 flex-wrap';
            const name = document.createElement('input');
            name.type = 'text';
            name.value = entry.name;
            name.maxLength = 40;
            name.className = 'w-32 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-primary/50';
            name.title = 'Name used in the prompt';
            name.onclick = (e) => e.stopPropagation();
            name.oninput = () => { entry.name = name.value.trim() || `${g.noun} ${idx + 1}`; onChange?.(); };
            line.appendChild(name);
            entry.photos.forEach((p, pi) => {
                const cell = document.createElement('div');
                cell.className = 'relative w-11 h-11 rounded-lg overflow-hidden border border-white/10 bg-white/5';
                cell.innerHTML = p.url ? `<img src="${esc(p.thumb || p.url)}" class="w-full h-full object-cover">` : '<div class="w-full h-full flex items-center justify-center"><div class="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div></div>';
                const x = document.createElement('button');
                x.type = 'button';
                x.className = 'absolute top-0 right-0 w-4 h-4 bg-black/70 text-white text-[10px] leading-none';
                x.textContent = '×';
                x.title = 'Remove photo';
                x.onclick = (e) => {
                    e.stopPropagation();
                    entry.photos.splice(pi, 1);
                    if (!entry.photos.length) entries.splice(idx, 1);
                    changed();
                };
                cell.appendChild(x);
                line.appendChild(cell);
            });
            line.appendChild(uploadButton(key, entry, '+ photo'));
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'text-[10px] text-secondary hover:text-primary ml-1';
            del.textContent = 'Remove';
            del.onclick = (e) => { e.stopPropagation(); entries.splice(idx, 1); changed(); };
            line.appendChild(del);
            box.appendChild(line);
        });

        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-2 flex-wrap';
        if (key === 'character') actions.appendChild(savedCharacterButton());
        actions.appendChild(uploadButton(key, null, entries.length ? `+ Another ${g.noun.toLowerCase()} (upload)` : `Upload ${g.noun.toLowerCase()} photos`));
        if (!entries.length) {
            const tip = document.createElement('span');
            tip.className = 'text-[10px] text-muted';
            tip.textContent = key === 'character' ? 'Clear face photos; several angles help.' : 'Plain-background product photos work best.';
            actions.appendChild(tip);
        }
        box.appendChild(actions);
        return box;
    }

    function smallBtn(text) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'px-2.5 py-1.5 rounded-lg bg-white/5 border border-dashed border-white/20 hover:border-primary/50 text-[11px] font-bold text-white whitespace-nowrap';
        b.textContent = text;
        return b;
    }

    // Upload into an existing entry, or create a new one.
    function uploadButton(key, entry, text) {
        const b = smallBtn(text);
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.multiple = true;
        input.className = 'hidden';
        b.appendChild(input);
        b.onclick = (e) => { e.stopPropagation(); if (e.target !== input) input.click(); };
        input.onclick = (e) => e.stopPropagation();
        input.onchange = async () => {
            const files = Array.from(input.files || []);
            input.value = '';
            if (!files.length) return;
            let target = entry;
            if (!target) {
                const list = state[key].entries;
                target = { id: ++seq, name: `${GROUPS[key].noun} ${list.length + 1}`, photos: [] };
                list.push(target);
            }
            const slots = files.map(f => ({ url: '', thumb: URL.createObjectURL(f), uploading: true }));
            target.photos.push(...slots);
            changed();
            await Promise.all(files.map(async (f, i) => {
                try {
                    const dataUrl = await compressImage(f);
                    const blob = await (await fetch(dataUrl)).blob();
                    slots[i].url = await kie.uploadFile(new File([blob], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
                } catch (err) {
                    console.error('[Setup] upload failed', err);
                    target.photos.splice(target.photos.indexOf(slots[i]), 1);
                    slots[i].failed = err.message;
                }
                slots[i].uploading = false;
            }));
            const lost = slots.filter(s => s.failed);
            state[key].entries = state[key].entries.filter(e => e.photos.length);
            changed();
            if (lost.length) window.dispatchEvent(new CustomEvent('setup-upload-error', { detail: lost[0].failed }));
        };
        return b;
    }

    function savedCharacterButton() {
        const wrap = document.createElement('div');
        wrap.className = 'relative';
        const b = smallBtn('Saved character ▾');
        const pop = document.createElement('div');
        pop.className = 'hidden absolute top-[110%] left-0 z-[70] w-64 max-h-72 overflow-y-auto custom-scrollbar bg-[#111] border border-white/10 rounded-2xl p-2 shadow-3xl';
        wrap.append(b, pop);
        const close = () => pop.classList.add('hidden');
        document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
        b.onclick = async (e) => {
            e.stopPropagation();
            if (!pop.classList.contains('hidden')) return close();
            pop.classList.remove('hidden');
            pop.innerHTML = '<div class="text-xs text-secondary p-3">Loading…</div>';
            try {
                const list = await listCharacters({ fresh: true });
                pop.innerHTML = list.length ? '' : '<div class="text-xs text-secondary p-3">No saved characters yet. Make one in the Characters tab.</div>';
                list.forEach(c => {
                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left';
                    item.innerHTML = `<img src="${esc(c.portraits[0].thumb || c.portraits[0].url)}" class="w-9 h-9 rounded-lg object-cover"><span class="flex flex-col min-w-0"><span class="text-xs font-bold text-white truncate">${esc(c.name)}</span><span class="text-[10px] text-secondary">${c.portraits.length} photo${c.portraits.length === 1 ? '' : 's'}</span></span>`;
                    item.onclick = (ev) => {
                        ev.stopPropagation();
                        close();
                        const list2 = state.character.entries;
                        if (list2.some(x => x.savedId === c.id)) return;
                        list2.push({ id: ++seq, savedId: c.id, name: c.name, photos: c.portraits.map(p => ({ url: p.url, thumb: p.thumb })) });
                        changed();
                    };
                    pop.appendChild(item);
                });
            } catch (err) {
                pop.innerHTML = '';
                const m = document.createElement('div');
                m.className = 'text-xs text-[#ff6b6b] p-3';
                m.textContent = `Could not load: ${err.message}`;
                pop.appendChild(m);
            }
        };
        return wrap;
    }

    // ---------- state out ----------
    const activeEntries = (key) => (state[key].on ? state[key].entries : []);
    function refUrls() {
        return [...activeEntries('character'), ...activeEntries('item')].flatMap(e => e.photos.map(p => p.url).filter(Boolean));
    }

    function getState() {
        const style = styles.find(s => s.id === state.style) || styles[0];
        const summarize = (key) => activeEntries(key).map(e => ({ name: e.name, count: e.photos.filter(p => p.url).length }));
        const refs = refUrls();
        return {
            style: style.id,
            styleLabel: style.label,
            styleHint: style.hint,
            locks: state.character.on || state.item.on,
            characterOn: state.character.on,
            itemOn: state.item.on,
            refs,
            refCount: refs.length,
            characters: summarize('character'),
            items: summarize('item'),
            uploading: [...activeEntries('character'), ...activeEntries('item')].some(e => e.photos.some(p => p.uploading)),
        };
    }

    function setLimit(limit) {
        const same = JSON.stringify(limit) === JSON.stringify(state.limit);
        state.limit = limit;
        if (!same) render();
    }

    render();
    return { element: el, getState, setLimit };
}
