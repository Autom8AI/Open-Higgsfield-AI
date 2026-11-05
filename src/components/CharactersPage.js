// Characters: save a person, mascot or product once (name + 1-5 photos) and
// reuse it in Video, Image and Remix via the "Character" button.
import { listCharacters, createCharacter, deleteCharacter } from '../lib/characters.js';

const MAX_PHOTOS = 5;

export function CharactersPage() {
    const page = document.createElement('div');
    page.className = 'flex-1 w-full h-full overflow-y-auto custom-scrollbar px-4 md:px-10 py-8';

    const head = document.createElement('div');
    head.className = 'max-w-5xl mx-auto mb-8';
    head.innerHTML = `
        <h1 class="text-3xl md:text-5xl font-black tracking-tight text-white mb-2">Characters</h1>
        <p class="text-sm text-secondary">Save a person, mascot or product once, then pick it with the Character button in Video, Image and Remix to keep it consistent.</p>`;
    page.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = 'max-w-5xl mx-auto flex flex-col gap-8 pb-24';
    page.appendChild(wrap);

    // ---- Create form ----
    const form = document.createElement('section');
    form.className = 'bg-[#111]/90 border border-white/10 rounded-3xl p-5 md:p-7 flex flex-col gap-4';
    form.innerHTML = '<h2 class="text-lg font-black text-white">New character</h2>';
    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 60;
    name.placeholder = 'Name, e.g. Remy';
    name.className = 'w-full md:w-80 bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-primary/50';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.multiple = true;
    fileInput.className = 'hidden';
    const pickBtn = document.createElement('button');
    pickBtn.type = 'button';
    pickBtn.className = 'w-fit px-4 py-2.5 rounded-xl bg-white/5 border border-dashed border-white/20 hover:border-primary/50 text-xs font-bold text-white transition-all';
    pickBtn.textContent = `Add photos (1–${MAX_PHOTOS})`;
    pickBtn.onclick = () => fileInput.click();
    const previews = document.createElement('div');
    previews.className = 'flex flex-wrap gap-2';
    const tip = document.createElement('p');
    tip.className = 'text-[11px] text-secondary';
    tip.textContent = 'Clear, well-lit photos work best. For motion transfer include one showing head, shoulders and torso.';

    const actions = document.createElement('div');
    actions.className = 'flex items-center gap-4 flex-wrap';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'px-6 py-2.5 bg-primary text-black font-black text-sm rounded-2xl hover:shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed';
    saveBtn.textContent = 'Save character';
    const status = document.createElement('span');
    status.className = 'text-xs text-secondary';
    actions.append(saveBtn, status);
    form.append(name, fileInput, pickBtn, previews, tip, actions);
    wrap.appendChild(form);

    let files = [];
    const refreshForm = () => {
        previews.innerHTML = '';
        files.forEach((f, i) => {
            const cell = document.createElement('div');
            cell.className = 'relative w-20 h-20 rounded-xl overflow-hidden border border-white/10';
            const img = document.createElement('img');
            img.src = URL.createObjectURL(f);
            img.className = 'w-full h-full object-cover';
            const x = document.createElement('button');
            x.type = 'button';
            x.className = 'absolute top-1 right-1 w-5 h-5 rounded-full bg-[#ff2d2d] text-white text-[10px] font-black';
            x.textContent = '×';
            x.onclick = () => { files.splice(i, 1); refreshForm(); };
            cell.append(img, x);
            previews.appendChild(cell);
        });
        pickBtn.style.display = files.length >= MAX_PHOTOS ? 'none' : '';
        saveBtn.disabled = !name.value.trim() || !files.length;
    };
    name.oninput = refreshForm;
    fileInput.onchange = () => {
        files = [...files, ...Array.from(fileInput.files)].slice(0, MAX_PHOTOS);
        fileInput.value = '';
        refreshForm();
    };
    saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        status.className = 'text-xs text-secondary';
        status.textContent = 'Saving…';
        try {
            await createCharacter(name.value.trim(), files);
            name.value = '';
            files = [];
            refreshForm();
            status.textContent = 'Saved.';
            await load();
        } catch (e) {
            status.className = 'text-xs text-[#ff6b6b]';
            status.textContent = `Could not save: ${e.message}`;
            saveBtn.disabled = false;
        }
    };
    refreshForm();

    // ---- List ----
    const listSection = document.createElement('section');
    listSection.className = 'flex flex-col gap-4';
    listSection.innerHTML = '<h2 class="text-lg font-black text-white">Saved</h2>';
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4';
    listSection.appendChild(grid);
    wrap.appendChild(listSection);

    async function load() {
        grid.innerHTML = '<p class="text-sm text-secondary col-span-full">Loading…</p>';
        try {
            const list = await listCharacters({ fresh: true });
            grid.innerHTML = '';
            if (!list.length) {
                grid.innerHTML = '<p class="text-sm text-secondary col-span-full">No characters yet.</p>';
                return;
            }
            list.forEach(c => grid.appendChild(card(c)));
        } catch (e) {
            grid.innerHTML = '';
            const p = document.createElement('p');
            p.className = 'text-sm text-[#ff6b6b] col-span-full';
            p.textContent = `Could not load characters: ${e.message}`;
            grid.appendChild(p);
        }
    }

    function card(c) {
        const el = document.createElement('div');
        el.className = 'rounded-2xl overflow-hidden bg-card-bg border border-white/10 flex flex-col';
        const img = document.createElement('img');
        img.src = c.portraits[0].thumb || c.portraits[0].url;
        img.className = 'w-full aspect-square object-cover bg-white/5';
        const strip = document.createElement('div');
        strip.className = 'flex gap-1 px-3 pt-2';
        c.portraits.slice(1, 5).forEach(p => {
            const t = document.createElement('img');
            t.src = p.thumb || p.url;
            t.className = 'w-8 h-8 rounded-md object-cover';
            strip.appendChild(t);
        });
        const foot = document.createElement('div');
        foot.className = 'flex items-center justify-between gap-2 px-3 py-3';
        const n = document.createElement('div');
        n.className = 'min-w-0';
        const nm = document.createElement('div');
        nm.className = 'text-sm font-black text-white truncate';
        nm.textContent = c.name;
        const meta = document.createElement('div');
        meta.className = 'text-[10px] text-secondary';
        meta.textContent = `${c.portraits.length} photo${c.portraits.length === 1 ? '' : 's'}`;
        n.append(nm, meta);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-primary transition-colors';
        del.textContent = 'Delete';
        // Two-step delete in the page (no browser dialog).
        del.onclick = async () => {
            if (del.dataset.armed !== '1') {
                del.dataset.armed = '1';
                del.textContent = 'Confirm?';
                del.classList.add('text-primary');
                setTimeout(() => { del.dataset.armed = ''; del.textContent = 'Delete'; del.classList.remove('text-primary'); }, 3000);
                return;
            }
            del.textContent = 'Deleting…';
            try { await deleteCharacter(c.id); el.remove(); } catch (e) { del.textContent = 'Failed'; }
        };
        foot.append(n, del);
        el.append(img, strip, foot);
        return el;
    }

    load();
    return page;
}
