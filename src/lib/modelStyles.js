// Style filter for the Video and Image model pickers. Picking a style hides
// the models that are not good at it and adds a short style hint to the
// prompt. Models that are not listed here show under every style.

export const VIDEO_STYLES = [
    { id: 'all', label: 'All styles', hint: '' },
    { id: 'realistic', label: 'Realistic', hint: 'Photorealistic, natural lighting, true-to-life detail and motion.' },
    { id: 'cinematic', label: 'Cinematic', hint: 'Cinematic film look, dramatic lighting, shallow depth of field, smooth camera movement.' },
    { id: 'ugc', label: 'UGC / Selfie', hint: 'Authentic handheld smartphone UGC footage, casual selfie framing, natural room light, person speaking to camera.' },
    { id: 'cartoon', label: 'Cartoon / Anime', hint: 'Stylised cartoon animation, bold shapes, clean lines, vibrant colour.' },
    { id: 'product', label: 'Product / Ad', hint: 'Polished commercial product shot, clean studio lighting, advertising look.' },
];

export const IMAGE_STYLES = [
    { id: 'all', label: 'All styles', hint: '' },
    { id: 'realistic', label: 'Realistic', hint: 'Photorealistic, natural lighting, true-to-life detail and texture.' },
    { id: 'ugc', label: 'UGC / Selfie', hint: 'Casual smartphone photo, authentic UGC look, natural light, unposed.' },
    { id: 'cartoon', label: 'Cartoon / Anime', hint: 'Bold cartoon illustration, clean linework, flat vibrant colour.' },
    { id: 'product', label: 'Product / Ad', hint: 'Clean commercial product photo, studio lighting, advertising look.' },
    { id: 'design', label: 'Text / Poster', hint: 'Graphic design layout with crisp, legible typography.' },
];

const MODEL_STYLES = {
    // Video
    'veo-3-1/quality': ['realistic', 'cinematic', 'ugc', 'product'],
    'veo-3-1/fast': ['realistic', 'cinematic', 'ugc', 'product'],
    'veo-3-1/lite': ['realistic', 'ugc'],
    'bytedance/seedance-2': ['realistic', 'cinematic', 'ugc', 'cartoon', 'product'],
    'bytedance/seedance-2-fast': ['realistic', 'ugc', 'cartoon', 'product'],
    'bytedance/seedance-1.5-pro': ['realistic', 'cinematic'],
    'kling-3.0/video': ['realistic', 'cinematic', 'ugc', 'product'],
    'kling/v3-turbo-text-to-video': ['realistic', 'cinematic', 'cartoon'],
    'wan/2-5-text-to-video': ['cartoon', 'realistic'],
    'happyhorse-1-1/text-to-video': ['realistic', 'cartoon', 'ugc'],
    'happyhorse-1-1/reference-to-video': ['realistic', 'ugc', 'product'],
    // Image
    'gpt-image-2-text-to-image': ['realistic', 'ugc', 'cartoon', 'product', 'design'],
    'gpt-image-2-image-to-image': ['realistic', 'ugc', 'cartoon', 'product', 'design'],
    'nano-banana-pro': ['realistic', 'ugc', 'product', 'design'],
    'nano-banana-2': ['realistic', 'ugc', 'cartoon', 'product'],
    'nano-banana-2-lite': ['realistic', 'cartoon'],
    'google/nano-banana': ['realistic', 'cartoon'],
    'google/nano-banana-edit': ['realistic', 'cartoon', 'product'],
    'ideogram/v3-text-to-image': ['design', 'cartoon'],
};

export function fitsStyle(model, styleId) {
    if (!styleId || styleId === 'all') return true;
    const tags = MODEL_STYLES[model?.id];
    return !tags || tags.includes(styleId);
}

export const filterByStyle = (models, styleId) => models.filter(m => fitsStyle(m, styleId));

// Keep the current model if it fits, otherwise the first one that does.
export function pickForStyle(models, currentId, styleId) {
    const fitting = filterByStyle(models, styleId);
    return fitting.find(m => m.id === currentId) || fitting[0] || models.find(m => m.id === currentId) || models[0];
}

export const styleLabel = (styles, id) => (styles.find(s => s.id === id) || styles[0]).label;

// Joins prompt parts as sentences ("face cream" + "Handheld..." -> "face cream. Handheld...").
export const joinPrompt = (...parts) => parts
    .map(p => String(p || '').trim()).filter(Boolean)
    .map((p, i, a) => (i < a.length - 1 && !/[.!?]$/.test(p) ? `${p}.` : p))
    .join(' ');
