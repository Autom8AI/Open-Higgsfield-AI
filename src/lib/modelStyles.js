// Which models suit which kind of shot, and how the "keep the same" locks
// (character / item references) narrow the list. The studios show only the
// models returned by fitModels(), best first, so there is less to choose from.
//
// tier: premium | standard | budget. Budget tiers (Lite, Fast drafts) only show
// under "Any look", so a Realistic shot never lands on a cheap draft model.
// refs: how many reference photos the model can keep consistent (0 = none).

export const VIDEO_STYLES = [
    { id: 'any', label: 'Any look', hint: '' },
    { id: 'realistic', label: 'Realistic', hint: 'Photorealistic, natural lighting, true-to-life detail and motion.' },
    { id: 'cinematic', label: 'Cinematic', hint: 'Cinematic film look, dramatic lighting, shallow depth of field, smooth camera movement.' },
    { id: 'ugc', label: 'UGC / Selfie', hint: 'Authentic handheld smartphone UGC footage, casual selfie framing, natural room light, person speaking to camera.' },
    { id: 'cartoon', label: 'Cartoon / Anime', hint: 'Stylised cartoon animation, bold shapes, clean lines, vibrant colour.' },
    { id: 'product', label: 'Product / Ad', hint: 'Polished commercial product shot, clean studio lighting, advertising look.' },
];

export const IMAGE_STYLES = [
    { id: 'any', label: 'Any look', hint: '' },
    { id: 'realistic', label: 'Realistic', hint: 'Photorealistic, natural lighting, true-to-life detail and texture.' },
    { id: 'ugc', label: 'UGC / Selfie', hint: 'Casual smartphone photo, authentic UGC look, natural light, unposed.' },
    { id: 'cartoon', label: 'Cartoon / Anime', hint: 'Bold cartoon illustration, clean linework, flat vibrant colour.' },
    { id: 'product', label: 'Product / Ad', hint: 'Clean commercial product photo, studio lighting, advertising look.' },
    { id: 'design', label: 'Text / Poster', hint: 'Graphic design layout with crisp, legible typography.' },
];

const ALL_VIDEO = ['realistic', 'cinematic', 'ugc', 'cartoon', 'product'];
const ALL_IMAGE = ['realistic', 'ugc', 'cartoon', 'product', 'design'];

const FIT = {
    // ---- Video ----
    'veo-3-1/quality': { alwaysSound: true, styles: ['realistic', 'cinematic', 'ugc', 'product'], tier: 'premium', refs: 0, note: 'Best realism, with sound' },
    'bytedance/seedance-2': { styles: ALL_VIDEO, tier: 'premium', refs: 9, voice: true, note: 'Up to 9 reference photos, takes your voiceover' },
    'kling-3.0/video': { styles: ['realistic', 'cinematic', 'ugc', 'product'], tier: 'premium', refs: 0, note: 'Sharp, natural motion' },
    'veo-3-1/fast': { alwaysSound: true, styles: ['realistic', 'cinematic', 'ugc', 'product'], tier: 'standard', refs: 3, refDuration: 8, note: 'Veo with up to 3 reference photos' },
    'bytedance/seedance-1.5-pro': { styles: ['realistic', 'cinematic'], tier: 'standard', refs: 0, note: 'Cinematic, with audio' },
    'happyhorse-1-1/reference-to-video': { styles: ['ugc', 'product', 'cartoon'], tier: 'standard', refs: 5, note: 'Places a product or character from photos' },
    'kling/v3-turbo-text-to-video': { styles: ['cinematic', 'cartoon'], tier: 'standard', refs: 0, note: 'Quick, stylised' },
    'wan/2-5-text-to-video': { styles: ['cartoon'], tier: 'standard', refs: 0, note: 'Good for animation' },
    'happyhorse-1-1/text-to-video': { styles: ['cartoon', 'ugc'], tier: 'standard', refs: 0, note: '' },
    'veo-3-1/lite': { alwaysSound: true, styles: ['realistic', 'ugc'], tier: 'budget', refs: 3, refDuration: 8, note: 'Cheapest Veo' },
    'bytedance/seedance-2-fast': { styles: ALL_VIDEO, tier: 'budget', refs: 9, voice: true, note: 'Cheaper Seedance for drafts' },
    // ---- Image ----
    'nano-banana-pro': { styles: ['realistic', 'ugc', 'product', 'design'], tier: 'premium', refs: 14, note: 'Best at keeping faces and products identical' },
    'gpt-image-2-text-to-image': { styles: ALL_IMAGE, tier: 'premium', refs: 0, note: 'Follows prompts closely, clean text' },
    'gpt-image-2-image-to-image': { styles: ALL_IMAGE, tier: 'premium', refs: 10, note: 'Follows prompts closely, up to 10 photos' },
    'nano-banana-2': { styles: ['realistic', 'ugc', 'cartoon', 'product'], tier: 'standard', refs: 14, note: 'All-rounder, up to 14 photos' },
    'ideogram/v3-text-to-image': { styles: ['design', 'cartoon'], tier: 'standard', refs: 0, note: 'Posters and lettering' },
    'nano-banana-2-lite': { styles: ['realistic', 'cartoon'], tier: 'budget', refs: 10, note: 'Cheaper drafts' },
    'google/nano-banana': { styles: ['realistic', 'cartoon'], tier: 'budget', refs: 0, note: 'Cheaper drafts' },
    'google/nano-banana-edit': { styles: ['realistic', 'cartoon', 'product'], tier: 'budget', refs: 10, note: 'Cheaper edits' },
};

const TIER_RANK = { premium: 0, standard: 1, budget: 2 };

export const fitInfo = (id) => FIT[id] || null;

/**
 * Models that suit the setup, best first. Each result is the model plus
 * `fit` (note, refs) and `overLimit` when it cannot take that many photos.
 * setup = { style, locks: boolean, refCount: number }
 */
export function fitModels(models, { style = 'any', locks = false, refCount = 0, sound = 'model' } = {}) {
    const seen = new Set();
    const out = [];
    for (const m of models) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const fit = FIT[m.id];
        if (!fit) {
            if (style === 'any' && !locks && sound === 'model') out.push({ model: m, fit: null, overLimit: false, rank: 9 });
            continue;
        }
        if (style !== 'any' && (!fit.styles.includes(style) || fit.tier === 'budget')) continue;
        if (locks && !fit.refs) continue;
        if (sound === 'voiceover' && !fit.voice) continue; // only models that take an audio track
        if (sound === 'silent' && fit.alwaysSound) continue; // Veo always adds sound
        out.push({ model: m, fit, overLimit: locks && refCount > fit.refs, rank: TIER_RANK[fit.tier] ?? 5 });
    }
    // Within a tier keep the order of FIT above; models over the photo limit go last.
    const order = Object.keys(FIT);
    return out
        .map((r, i) => ({ ...r, i: r.fit ? order.indexOf(r.model.id) : 1000 + i }))
        .sort((a, b) => (a.overLimit - b.overLimit) || (a.rank - b.rank) || (a.i - b.i));
}

// Best usable model: the current one if it still fits, else the top result.
export function pickBest(results, currentId) {
    const usable = results.filter(r => !r.overLimit);
    return (usable.find(r => r.model.id === currentId) || usable[0] || results[0])?.model || null;
}

// Prompt text that tells the model what each reference photo is and to keep it
// identical. refs are in the order they are sent (characters, then items).
export function lockInstruction(characters = [], items = []) {
    const parts = [];
    let n = 1;
    const span = (count) => {
        const a = n, b = n + count - 1;
        n += count;
        return count === 1 ? `Reference image ${a} shows` : `Reference images ${a}-${b} show`;
    };
    for (const c of characters) {
        if (!c.count) continue;
        parts.push(`${span(c.count)} ${c.name ? c.name : 'a person'}; keep this person's face, hair, skin tone and build exactly the same.`);
    }
    for (const it of items) {
        if (!it.count) continue;
        parts.push(`${span(it.count)} ${it.name ? it.name : 'a product'}; keep its shape, colours, materials, label and logo exactly the same.`);
    }
    return parts.join(' ');
}

// Joins prompt parts as sentences ("face cream" + "Handheld..." -> "face cream. Handheld...").
export const joinPrompt = (...parts) => parts
    .map(p => String(p || '').trim()).filter(Boolean)
    .map((p, i, a) => (i < a.length - 1 && !/[.!?]$/.test(p) ? `${p}.` : p))
    .join(' ');

// Rough kie.ai price of a preset ElevenLabs voiceover (multilingual v2,
// ~12 credits per 1,000 characters). Cloned voices use the account's own
// ElevenLabs plan instead, so they cost no kie credits.
export const voiceCredits = (chars) => Math.max(1, Math.round((Number(chars) || 0) * 0.012 * 10) / 10);
// ElevenLabs speaks ~15 characters per second.
export const voiceSeconds = (chars) => Math.round(((Number(chars) || 0) / 15) * 10) / 10;
