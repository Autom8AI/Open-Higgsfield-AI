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
