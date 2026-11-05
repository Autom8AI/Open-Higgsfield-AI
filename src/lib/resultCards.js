// Result grid shared by Factory and Remix: pending (spinner) cards and finished
// video cards with prompt, model, length, ratio, credits and a Download button.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function downloadFile(url, filename) {
    try {
        const blob = await (await fetch(url)).blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { window.open(url, '_blank'); }
}

export function renderResultGrid(grid, entries, { prefix = 'clip' } = {}) {
    grid.innerHTML = '';
    entries.forEach((entry, idx) => {
        const card = document.createElement('div');
        card.className = 'rounded-2xl overflow-hidden bg-card-bg border border-white/10 flex flex-col';
        const credits = entry.credits != null ? `${entry.creditsEstimated === false ? '' : '≈'}${entry.credits} cr` : '';
        const meta = `<div class="px-3 py-2.5 flex flex-col gap-1">
            <p class="text-[11px] text-white/90 leading-snug line-clamp-2">${esc(entry.prompt)}</p>
            <div class="flex items-center gap-2 flex-wrap text-[10px] text-muted">
                <span>${esc(entry.modelName || entry.model)}</span>
                ${entry.duration ? `<span>${esc(entry.duration)}s</span>` : ''}
                ${entry.aspect_ratio ? `<span>${esc(entry.aspect_ratio)}</span>` : ''}
                ${entry.resolution ? `<span>${esc(entry.resolution)}</span>` : ''}
                ${credits ? `<span class="text-primary font-bold">${credits}</span>` : ''}
            </div>
        </div>`;
        if (entry.pending) {
            card.innerHTML = `<div class="aspect-[9/16] max-h-80 w-full flex flex-col items-center justify-center gap-2 bg-white/5">
                <div class="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span class="text-[9px] font-bold uppercase tracking-widest text-secondary">Generating</span></div>${meta}`;
        } else {
            card.innerHTML = `<video src="${esc(entry.url)}" muted loop playsinline controls preload="metadata" class="w-full max-h-80 object-cover bg-black"></video>${meta}`;
            const dl = document.createElement('button');
            dl.className = 'mx-3 mb-3 px-3 py-2 rounded-xl bg-primary text-black text-[11px] font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all';
            dl.textContent = 'Download';
            dl.onclick = () => downloadFile(entry.url, `${prefix}-${entry.id || idx}.mp4`);
            card.appendChild(dl);
        }
        grid.appendChild(card);
    });
}
