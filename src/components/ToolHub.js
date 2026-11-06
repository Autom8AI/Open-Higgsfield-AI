// One tab per output (Video, Image) with a Tool dropdown at the top. Each tool
// is a full studio, so its own inputs and model choices stay specific to it.
import { esc } from '../lib/resultCards.js';

export const VIDEO_TOOLS = [
    { id: 'create', label: 'Create video', blurb: 'Text or image to video. Pick a look and lock characters or items.', load: () => import('./VideoStudio.js').then(m => m.VideoStudio()) },
    { id: 'motion', label: 'Motion transfer', blurb: 'Your character performs the moves from a source video.', load: () => import('./RemixStudio.js').then(m => m.RemixStudio({ fixedMode: 'motion' })) },
    { id: 'replace', label: 'Character swap', blurb: 'Replace the person in a video with your character.', load: () => import('./RemixStudio.js').then(m => m.RemixStudio({ fixedMode: 'replace' })) },
    { id: 'edit', label: 'Item swap / edit', blurb: 'Swap a product, outfit or place in a video using photos.', load: () => import('./RemixStudio.js').then(m => m.RemixStudio({ fixedMode: 'edit' })) },
    { id: 'lipsync', label: 'Lip sync / talking', blurb: 'Make a photo or video speak your audio.', load: () => import('./LipSyncStudio.js').then(m => m.LipSyncStudio()) },
    { id: 'factory', label: 'Content factory', blurb: 'One brief in, a batch of video scenes out.', load: () => import('./FactoryStudio.js').then(m => m.FactoryStudio()) },
];

export const IMAGE_TOOLS = [
    { id: 'create', label: 'Create image', blurb: 'Text or photos to image. Pick a look and lock characters or items.', load: () => import('./ImageStudio.js').then(m => m.ImageStudio()) },
    { id: 'cinema', label: 'Cinema still', blurb: 'Film-style stills with camera, lens and lighting controls.', load: () => import('./CinemaStudio.js').then(m => m.CinemaStudio()) },
];

function readTool(key, tools) {
    try {
        const id = localStorage.getItem(key);
        return tools.find(t => t.id === id) || tools[0];
    } catch { return tools[0]; }
}

export function ToolHub({ tools, storageKey, initial, label }) {
    const root = document.createElement('div');
    root.className = 'w-full h-full flex flex-col bg-app-bg';

    const bar = document.createElement('div');
    bar.className = 'shrink-0 flex justify-center px-4 pt-4 relative z-[60]';
    const wrap = document.createElement('div');
    wrap.className = 'relative';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-2xl bg-[#111] border border-white/10 hover:border-primary/50 transition-all';
    const menu = document.createElement('div');
    menu.className = 'hidden absolute top-[110%] left-1/2 -translate-x-1/2 w-[min(22rem,calc(100vw-2rem))] bg-[#111] border border-white/10 rounded-2xl p-2 shadow-3xl';
    wrap.append(btn, menu);
    bar.appendChild(wrap);

    const body = document.createElement('div');
    body.className = 'flex-1 min-h-0 relative';
    root.append(bar, body);

    let current = tools.find(t => t.id === initial) || readTool(storageKey, tools);
    let token = 0;

    const paintBtn = () => {
        btn.innerHTML = `<span class="text-[10px] font-bold uppercase tracking-widest text-secondary">${esc(label)}</span><span class="text-sm font-black text-white">${esc(current.label)}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-secondary"><path d="M6 9l6 6 6-6"/></svg>`;
    };
    const paintMenu = () => {
        menu.innerHTML = '';
        tools.forEach(t => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `w-full text-left px-3 py-2.5 rounded-xl transition-all ${t.id === current.id ? 'bg-primary/10' : 'hover:bg-white/5'}`;
            item.innerHTML = `<div class="text-sm font-bold ${t.id === current.id ? 'text-primary' : 'text-white'}">${esc(t.label)}</div><div class="text-[11px] text-secondary mt-0.5">${esc(t.blurb)}</div>`;
            item.onclick = (e) => { e.stopPropagation(); menu.classList.add('hidden'); select(t); };
            menu.appendChild(item);
        });
    };
    btn.onclick = (e) => { e.stopPropagation(); paintMenu(); menu.classList.toggle('hidden'); };
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) menu.classList.add('hidden'); });

    async function select(tool) {
        current = tool;
        try { localStorage.setItem(storageKey, tool.id); } catch { /* storage off */ }
        paintBtn();
        const my = ++token;
        body.innerHTML = '<div class="w-full h-full flex items-center justify-center text-sm text-secondary">Loading…</div>';
        const el = await tool.load();
        if (my !== token) return; // a newer choice won
        body.innerHTML = '';
        body.appendChild(el);
    }

    select(current);
    return root;
}
