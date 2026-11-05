// Sort model dropdown lists from most expensive to cheapest.
//
// Prices come from the content-factory backend's /models endpoint, which
// annotates the registry with published fal.ai pricing and, for kie
// models, average credits measured from real runs (per model, and per
// resolution where runs exist). Models with no known price keep their
// registry order and sink to the bottom of the list.
//
// Units follow the backend: images are cr/image, videos cr/sec when a
// duration is known (otherwise cr/video), so ordering is meaningful
// within a dropdown even when the unit differs between entries.

let priceMapPromise = null;
const priceMap = new Map();
const rawPricing = new Map();

function priceOf(entry, model) {
    if (!entry) return null;
    const byRes = entry.measuredByResolution || entry.byResolution || null;
    if (byRes && typeof byRes === 'object') {
        const def = model?.resolutionDefault;
        if (def && byRes[def]?.credits != null) return Number(byRes[def].credits);
        const values = Object.values(byRes).map(v => Number(v?.credits)).filter(Number.isFinite);
        if (values.length) return Math.max(...values);
    }
    const value = entry.measuredCredits != null ? entry.measuredCredits : entry.credits;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
}

export function loadPricing() {
    if (!priceMapPromise) {
        priceMapPromise = fetch('/.netlify/functions/models', { credentials: 'include' })
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                const list = data?.models || [];
                for (const model of list) {
                    const price = priceOf(model?.pricing, model);
                    if (price != null) priceMap.set(model.id, price);
                    if (model?.pricing) rawPricing.set(model.id, model.pricing);
                }
                return priceMap;
            })
            .catch(() => priceMap);
    }
    return priceMapPromise;
}

export function modelPrice(model) {
    return priceMap.get(model?.id) ?? null;
}

// Returns a sorted copy: most expensive first, unpriced models last in
// their original relative order (Array.prototype.sort is stable).
export function sortByPriceDesc(models) {
    return models.slice().sort((a, b) => {
        const pa = modelPrice(a);
        const pb = modelPrice(b);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa;
    });
}


// ── Cost helpers ────────────────────────────────────────────────────────────
// Credits for one run of `model`. Per-second prices are multiplied by the
// duration. Prefers a price measured for the chosen resolution, then the
// published one, then the overall average. Returns null when nothing is known.
export function priceInfo(model, resolution) {
    const p = rawPricing.get(model?.id);
    if (!p) return null;
    const res = resolution ? String(resolution) : null;
    const pick = (src, unit) => (src && src.credits != null && Number.isFinite(Number(src.credits))
        ? { credits: Number(src.credits), unit: src.unit || unit || '' } : null);
    const at = (table) => {
        if (!res || !table) return null;
        return table[res] || table[res.toLowerCase()] || table[res.toUpperCase()] || null;
    };
    const measured = pick(at(p.measuredByResolution), p.measuredUnit)
        || pick(at(p.byResolution), p.unit)
        || pick({ credits: p.measuredCredits, unit: p.measuredUnit }, p.measuredUnit);
    if (measured) return measured;
    // Published kie.ai "from" price: the model's cheapest option.
    const published = pick(p, p.unit);
    return published ? { ...published, from: Boolean(p.from) } : null;
}

const round = (n) => Math.round(n * 10) / 10;

// Estimated credits for a specific run, or null if the price is unknown.
export function estimateCredits(model, { duration, resolution } = {}) {
    const info = priceInfo(model, resolution);
    if (!info) return null;
    if (/sec/i.test(info.unit)) {
        const d = Number(duration);
        return Number.isFinite(d) && d > 0 ? round(info.credits * d) : null;
    }
    return round(info.credits);
}

// Short label for lists: "28 cr/s", "4 cr/image".
export function priceLabel(model, resolution) {
    const info = priceInfo(model, resolution);
    if (!info) return '';
    const unit = String(info.unit || '').replace(/^cr\//, '').replace('sec', 's');
    return `${info.from ? 'from ' : ''}${round(info.credits)} cr${unit ? '/' + unit : ''}`;
}

// Right-aligned price chip used in model dropdowns.
export function priceChipHtml(model, resolution) {
    const label = priceLabel(model, resolution);
    return label ? `<span class="text-[10px] font-bold text-primary/90 whitespace-nowrap">${label}</span>` : '';
}

// Text for the cost label beside Generate: "≈ 70 cr" when the run can be
// priced, "14 cr/s" when only a per-second rate is known (duration depends on
// the input), or '' when nothing is known.
export function costText(model, opts = {}) {
    const credits = estimateCredits(model, opts);
    if (credits != null) return `${priceInfo(model, opts.resolution)?.from ? 'from' : '≈'} ${credits} cr`;
    return priceLabel(model, opts.resolution);
}
