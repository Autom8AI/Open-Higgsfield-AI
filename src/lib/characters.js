// Saved characters: a name plus 1-5 reference portraits, stored in the
// backend's Avatars table so they can be reused across studios.

const BASE = '/.netlify/functions/avatars';

async function call(path = '', options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let json = {};
    try { json = await res.json(); } catch { /* empty */ }
    if (!res.ok || json.error) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
}

let cache = null;

export async function listCharacters({ fresh = false } = {}) {
    if (cache && !fresh) return cache;
    const json = await call();
    cache = (json.items || []).filter(c => c.portraits?.length);
    return cache;
}

// Shrink photos before upload so several fit in one request (functions cap
// request size); 1280px JPEG keeps faces sharp for reference use.
export function compressImage(file, maxSide = 1280, quality = 0.88) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not read ${file.name}`)); };
        img.src = url;
    });
}

export async function createCharacter(name, files, description = '') {
    const images = [];
    for (const f of files) images.push(await compressImage(f));
    const json = await call('', { method: 'POST', body: JSON.stringify({ name, description, images }) });
    cache = null;
    return json.avatar;
}

export async function deleteCharacter(id) {
    await call(`?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    cache = null;
}

// "Character" button + popover for the studios. onPick receives the character
// ({ id, name, portraits: [{ url, thumb }] }); portraits are fetched fresh so
// their storage links are current when the job is submitted.
export function createCharacterButton({ onPick, label = 'Character' }) {
    const wrap = document.createElement('div');
    wrap.className = 'relative';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 text-xs font-bold text-white whitespace-nowrap';
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0112 0v1"/></svg><span></span>';
    btn.querySelector('span').textContent = label;
    const pop = document.createElement('div');
    pop.className = 'hidden absolute bottom-[110%] left-0 z-[60] w-72 max-h-80 overflow-y-auto custom-scrollbar bg-[#111] border border-white/10 rounded-2xl p-2 shadow-3xl';
    wrap.append(btn, pop);

    const close = () => pop.classList.add('hidden');
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });

    btn.onclick = async (e) => {
        e.stopPropagation();
        if (!pop.classList.contains('hidden')) { close(); return; }
        pop.classList.remove('hidden');
        pop.innerHTML = '<div class="text-xs text-secondary p-3">Loading characters…</div>';
        try {
            const list = await listCharacters({ fresh: true });
            pop.innerHTML = '';
            if (!list.length) {
                pop.innerHTML = '<div class="text-xs text-secondary p-3 leading-relaxed">No saved characters yet. Create one in the Characters tab.</div>';
                return;
            }
            list.forEach(c => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left';
                const img = document.createElement('img');
                img.src = c.portraits[0].thumb || c.portraits[0].url;
                img.className = 'w-10 h-10 rounded-lg object-cover bg-white/5';
                const text = document.createElement('div');
                text.className = 'flex flex-col min-w-0';
                const n = document.createElement('span');
                n.className = 'text-xs font-bold text-white truncate';
                n.textContent = c.name;
                const m = document.createElement('span');
                m.className = 'text-[10px] text-secondary';
                m.textContent = `${c.portraits.length} photo${c.portraits.length === 1 ? '' : 's'}`;
                text.append(n, m);
                item.append(img, text);
                item.onclick = (ev) => {
                    ev.stopPropagation();
                    close();
                    btn.querySelector('span').textContent = c.name;
                    onPick(c);
                };
                pop.appendChild(item);
            });
        } catch (err) {
            pop.innerHTML = '';
            const msg = document.createElement('div');
            msg.className = 'text-xs text-[#ff6b6b] p-3';
            msg.textContent = `Could not load characters: ${err.message}`;
            pop.appendChild(msg);
        }
    };

    return { element: wrap, reset: () => { btn.querySelector('span').textContent = label; } };
}
