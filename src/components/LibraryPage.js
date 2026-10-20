// MATAI Library — every generated asset from the content-factory backend.
// All media types in one place (images, videos, talking avatars), sorted with
// the newest first. Requires a backend session; prompts sign-in otherwise.
import { cfBackendEnabled, listLibrary } from '../lib/api.js';
import { BackendModal } from './BackendModal.js';

const state = { items: [], filter: 'all', error: '' };

function timeAgo(iso) {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return '';
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(then).toLocaleDateString('en-CA');
}

function kindLabel(item) {
    const model = String(item.model || '').toLowerCase();
    if (/omnihuman|infinitalk|avatar|lipsync/.test(model)) return 'Talking';
    if (Number(item.duration) > 0 || /kling|seedance|wan|video|happyhorse/.test(model)) return 'Video';
    return 'Image';
}

function groupOf(item) {
    return String(item.kind || '').toLowerCase() === 'videos' ? 'videos' : 'images';
}

function filtered() {
    return state.items
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .filter(it => state.filter === 'all' ? true : groupOf(it) === state.filter);
}

function mediaBody(item) {
    if (item.url && item.thumb && groupOf(item) === 'videos') {
        return `<video src="${item.url}" poster="${item.thumb}" muted playsinline preload="metadata" class="w-full h-full object-cover"></video>`;
    }
    if (item.thumb) return `<img src="${item.thumb}" alt="${item.model} result" loading="lazy" class="w-full h-full object-cover">`;
    if (item.state === 'waiting' || item.state === 'draft') {
        return `<div class="w-full h-full flex flex-col items-center justify-center gap-2 bg-white/5">
            <div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <span class="text-[9px] font-bold uppercase tracking-widest text-secondary">Queued</span>
        </div>`;
    }
    if (item.state === 'failed' || item.status === 'Failed') {
        return `<div class="w-full h-full flex flex-col items-center justify-center gap-2 bg-white/5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
            <span class="text-[9px] font-bold uppercase tracking-widest text-secondary">Failed</span>
        </div>`;
    }
    return `<div class="w-full h-full flex items-center justify-center bg-white/5">
        <span class="text-[9px] font-bold uppercase tracking-widest text-secondary">No preview</span>
    </div>`;
}

function card(item) {
    const openTarget = item.url || (item.state === 'success' ? item.sourceUrl : '') || '';
    const ready = Boolean(item.url);

    const card = document.createElement('div');
    card.className = 'group relative rounded-2xl overflow-hidden bg-card-bg border border-white/10 hover:border-primary/50 transition-all duration-300 hover:shadow-glow cursor-pointer hover:scale-[1.02] active:scale-[0.98]';
    card.innerHTML = `
        <div class="aspect-square w-full overflow-hidden bg-black/40">
            ${mediaBody(item)}
        </div>
        <div class="absolute top-3 left-3 flex gap-2 items-center">
            <span class="px-2 py-1 rounded-md bg-black/70 backdrop-blur text-[9px] font-black uppercase tracking-widest text-white border border-white/10">${kindLabel(item)}</span>
            ${ready ? '' : `<span class="px-2 py-1 rounded-md bg-black/70 backdrop-blur text-[9px] font-black uppercase tracking-widest text-primary border border-primary/30">${(item.status || item.state || 'draft').toUpperCase()}</span>`}
        </div>
        <div class="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/95 via-black/70 to-transparent translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
            <p class="text-[11px] text-white/90 leading-snug line-clamp-2 mb-1">${item.model || 'unknown model'}</p>
            <p class="text-[10px] text-secondary truncate">${item.prompt || ''}</p>
            <div class="mt-2 flex items-center gap-2 text-[10px] text-muted">
                <span>${timeAgo(item.createdAt)}</span>
                ${item.credits ? `<span class="text-primary">${item.credits} cr</span>` : ''}
                ${item.duration ? `<span>${item.duration}s</span>` : ''}
            </div>
        </div>
    `;
    if (openTarget && ready) {
        card.onclick = () => window.open(openTarget, '_blank');
    } else {
        card.style.cursor = 'default';
        card.classList.remove('cursor-pointer', 'hover:scale-[1.02]');
    }
    return card;
}

export function LibraryPage() {
    const page = document.createElement('div');
    page.className = 'flex-1 w-full h-full overflow-y-auto px-4 md:px-10 py-8';

    const headerRow = document.createElement('div');
    headerRow.className = 'flex items-end justify-between mb-6 flex-wrap gap-4';
    headerRow.innerHTML = `
        <div>
            <h1 class="text-3xl font-black tracking-tight text-white mb-1">Library</h1>
            <p class="text-xs text-secondary">All media types, newest first.</p>
        </div>
        <div id="lib-count" class="text-[10px] font-bold uppercase tracking-widest text-muted"></div>
    `;
    page.appendChild(headerRow);
    const countEl = headerRow.querySelector('#lib-count');

    const filters = document.createElement('div');
    filters.className = 'flex items-center gap-2 mb-8 flex-wrap';
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-16';
    page.appendChild(filters);
    page.appendChild(grid);

    let authNote = null;

    const renderGrid = () => {
        const items = filtered();
        countEl.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
        grid.innerHTML = '';
        if (!items.length) {
            grid.innerHTML = `<div class="col-span-full flex flex-col items-center justify-center py-24 gap-3 text-center">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                <p class="text-sm text-secondary">${state.filter === 'all' ? 'Nothing generated yet — your creations land here.' : `No ${state.filter} yet.`}</p>
            </div>`;
        } else {
            items.forEach(item => grid.appendChild(card(item)));
        }
    };

    const showAuthNeeded = () => {
        filters.style.display = 'none';
        grid.innerHTML = '';
        countEl.textContent = '0 items';
        if (authNote) { authNote.remove(); authNote = null; }
        const note = document.createElement('div');
        note.className = 'mx-auto max-w-md text-center mt-16 flex flex-col items-center gap-4';
        note.innerHTML = `
            <div class="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-glow mb-2">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/></svg>
            </div>
            <p class="text-sm text-secondary leading-relaxed">Sign in to your content-factory account to browse the shared library.</p>
            <button id="lib-signin-btn" class="px-6 py-3 rounded-xl bg-primary text-black text-[11px] font-black uppercase tracking-widest shadow-glow hover:scale-105 active:scale-95 transition-all">Sign in</button>
        `;
        page.appendChild(note);
        note.querySelector('#lib-signin-btn').onclick = () => {
            BackendModal(async () => {
                if (authNote) { authNote.remove(); authNote = null; }
                filters.style.display = 'flex';
                page.$pageRefresh?.();
            });
        };
        authNote = note;
    };

    // Filter chips
    const buttons = {};
    const defs = [
        { key: 'all', label: 'All' },
        { key: 'images', label: 'Images' },
        { key: 'videos', label: 'Videos' },
    ];
    const select = (key) => {
        state.filter = key;
        Object.entries(buttons).forEach(([k, b]) => {
            b.className = k === key
                ? 'px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-primary text-black shadow-glow transition-all'
                : 'px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-white/5 text-secondary hover:text-white hover:bg-white/10 transition-all';
        });
        renderGrid();
    };
    defs.forEach(({ key, label }) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.onclick = () => select(key);
        buttons[key] = b;
        filters.appendChild(b);
    });

    const load = async () => {
        if (!cfBackendEnabled()) { showAuthNeeded(); return; }
        try {
            const items = await listLibrary();
            state.items = items || [];
            renderGrid();
        } catch (err) {
            grid.innerHTML = `<div class="col-span-full text-center py-16 text-sm text-secondary">${err.message || 'Failed to load the library.'}</div>`;
            countEl.textContent = '0 items';
        }
    };

    page.$pageRefresh = load;
    select('all');
    load();
    return page;
}