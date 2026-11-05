// Shared helpers for the creation studios' History sidebars.
//
// Generate is non-blocking: the moment a valid request is submitted the studio
// adds a "pending" thumbnail to History (a spinner card), clears its inputs and
// is ready for the next prompt. When the provider finishes, the pending card is
// swapped for the real result; on failure it is removed.
//
// `history` is the studio's own array (newest first). Pending cards are never
// written to localStorage; a reload re-creates them from the pending-jobs store.

import { estimateCredits } from './modelSort.js';

let counter = 0;

export function createQueueHistory({ history, storageKey, limit = 50, render, reveal }) {
    const persist = () => {
        try {
            const real = history.filter(e => !e.pending);
            localStorage.setItem(storageKey, JSON.stringify(real.slice(0, limit)));
        } catch { /* storage full or blocked */ }
    };
    const refresh = () => { reveal?.(); render(); };

    return {
        // Insert a pending card; returns its temp id.
        addPending(meta) {
            const tempId = `pending-${Date.now()}-${++counter}`;
            history.unshift({ ...meta, pending: true, tempId, timestamp: new Date().toISOString() });
            refresh();
            return tempId;
        },
        // Replace a pending card with the finished entry (or add it if the card is gone).
        resolve(tempId, entry) {
            const i = history.findIndex(e => e.tempId === tempId);
            if (i >= 0) history[i] = entry; else history.unshift(entry);
            persist();
            refresh();
        },
        // Drop a pending card (generation failed or never queued).
        fail(tempId) {
            const i = history.findIndex(e => e.tempId === tempId);
            if (i >= 0) { history.splice(i, 1); refresh(); }
        },
        persist,
    };
}

// Placeholder shown in a History thumb while a generation is running.
export function pendingThumbHtml(entry) {
    return `<div class="w-full aspect-square flex flex-col items-center justify-center gap-1.5 bg-white/5">
        <div class="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        <span class="text-[8px] font-bold uppercase tracking-widest text-secondary">Queued</span>
    </div>${creditBadgeHtml(entry)}`;
}

// Small credit badge in the corner of a History thumb. "≈" marks an estimate.
export function creditBadgeHtml(entry) {
    if (entry?.credits == null) return '';
    const prefix = entry.creditsEstimated === false ? '' : '≈';
    return `<span class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/75 text-[8px] font-black text-primary">${prefix}${entry.credits} cr</span>`;
}

// Fields to spread into a history entry / pending-job meta for the cost.
export function costMeta(model, opts) {
    const credits = estimateCredits(model, opts);
    return credits == null ? {} : { credits, creditsEstimated: true };
}
