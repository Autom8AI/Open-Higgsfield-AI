// Per-model video settings that data/models.json does not carry: the duration
// list (and whether kie wants it as a string or a number), fixed inputs the
// model requires, and the "Advanced" fields shown in the Video Studio.
// Field names follow docs.kie.ai/market/<model>.md (checked 2026-11-05).
//
// Advanced field types:
//   toggle  -> boolean            select -> one of `options`
//   number  -> integer (empty = omitted)   text -> string (empty = omitted)
// `when: 't2v' | 'i2v'` limits a field to text-only or image-driven runs.
// `send: false` marks a UI-only field that changes how the request is built.

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const seedanceFields = [
    { key: 'generate_audio', label: 'Generate audio', type: 'toggle', default: true, hint: 'Sound and dialogue made with the video' },
    { key: 'image_role', label: 'Use image as', type: 'select', options: ['first frame', 'reference'], default: 'first frame', when: 'i2v', send: false, hint: 'First frame starts the video on your image; reference keeps its look' },
    { key: 'web_search', label: 'Web search', type: 'toggle', default: false, when: 't2v', hint: 'Lets the model look up what the prompt mentions' },
];

const veoFields = [
    { key: 'enable_translation', label: 'Translate prompt', type: 'toggle', default: true, hint: 'Translates non-English prompts to English first' },
];

export const VIDEO_SPECS = {
    'bytedance/seedance-2': {
        durations: range(4, 15), durationDefault: 5, durationType: 'number',
        advanced: seedanceFields,
    },
    'bytedance/seedance-2-fast': {
        durations: range(4, 15), durationDefault: 5, durationType: 'number',
        advanced: seedanceFields,
    },
    'bytedance/seedance-1.5-pro': {
        durations: [5, 10], durationDefault: 5, durationType: 'number',
        advanced: [
            { key: 'generate_audio', label: 'Generate audio', type: 'toggle', default: true },
        ],
    },
    'kling-3.0/video': {
        durations: range(3, 15), durationDefault: 5, durationType: 'string',
        fixed: { multi_shots: false },
        advanced: [
            { key: 'mode', label: 'Quality mode', type: 'select', options: ['std', 'pro', '4K'], default: 'std', hint: 'std is cheapest, 4K is the most detailed' },
            { key: 'sound', label: 'Sound', type: 'toggle', default: false },
        ],
    },
    'kling/v3-turbo-text-to-video': {
        durations: range(3, 15), durationDefault: 5, durationType: 'string',
        advanced: [],
    },
    'wan/2-5-text-to-video': {
        durations: [5, 10], durationDefault: 5, durationType: 'string',
        advanced: [
            { key: 'negative_prompt', label: 'Negative prompt', type: 'text', default: '', max: 500, hint: 'What to keep out of the video' },
            { key: 'enable_prompt_expansion', label: 'Prompt expansion', type: 'toggle', default: false, hint: 'Lets the model rewrite the prompt in more detail' },
            { key: 'seed', label: 'Seed', type: 'number', default: '', hint: 'Same seed + prompt gives a similar result. Empty = random' },
        ],
    },
    'happyhorse-1-1/text-to-video': {
        durations: range(3, 15), durationDefault: 5, durationType: 'number',
        advanced: [],
    },
    'happyhorse-1-1/reference-to-video': {
        durations: range(3, 15), durationDefault: 5, durationType: 'number',
        imageOnly: true,
        advanced: [],
    },
    // Veo 3.1 (one kie market model, tier picked by input.model). 1 image = first
    // frame, 2 images = first + last frame.
    'veo-3-1/quality': { durations: [4, 6, 8], durationDefault: 8, durationType: 'number', fixed: { model: 'veo3' }, advanced: veoFields },
    'veo-3-1/fast': { durations: [4, 6, 8], durationDefault: 8, durationType: 'number', fixed: { model: 'veo3_fast' }, advanced: veoFields },
    'veo-3-1/lite': { durations: [4, 6, 8], durationDefault: 8, durationType: 'number', fixed: { model: 'veo3_lite' }, advanced: veoFields },
};

export const getVideoSpec = (id) => VIDEO_SPECS[id] || null;

// Advanced fields that apply to this run (t2v vs image-driven).
export function advancedFieldsFor(id, hasImage) {
    const spec = getVideoSpec(id);
    if (!spec) return [];
    const kind = hasImage ? 'i2v' : 't2v';
    return spec.advanced.filter(f => !f.when || f.when === kind);
}

// Turns the studio's request into kie `input` fields for a registry model.
// Returns { params, images, firstFrame } — `images` go to the model's image
// field (reference_image_urls / image_urls / ...), `firstFrame` to
// first_frame_url (Seedance only).
export function buildVideoParams(params) {
    const spec = getVideoSpec(params.model) || {};
    const hasImage = !!params.image_url;
    const extra = params.advanced || {};
    const out = { ...(spec.fixed || {}) };

    if (params.aspect_ratio) out.aspect_ratio = params.aspect_ratio;
    if (params.resolution) out.resolution = params.resolution;
    if (params.duration !== undefined && params.duration !== null && params.duration !== '') {
        out.duration = spec.durationType === 'string' ? String(params.duration) : Number(params.duration);
    }

    for (const f of advancedFieldsFor(params.model, hasImage)) {
        if (f.send === false) continue;
        const value = extra[f.key] !== undefined ? extra[f.key] : f.default;
        if (f.type === 'toggle') out[f.key] = !!value;
        else if (f.type === 'number') {
            const n = Number(value);
            if (value !== '' && value !== null && Number.isInteger(n)) out[f.key] = n;
        } else if (f.type === 'text') {
            const s = String(value || '').trim();
            if (s) out[f.key] = f.max ? s.slice(0, f.max) : s;
        } else if (value !== undefined && value !== '') out[f.key] = value;
    }

    let images = hasImage ? [params.image_url] : [];
    let firstFrame = null;
    // Locked character/item photos: always sent as references, never as a start frame.
    if (params.reference_urls?.length) {
        if (String(params.model).startsWith('veo-3-1/')) {
            out.generation_type = 'REFERENCE_2_VIDEO';
            out.duration = 8; // Veo reference mode only makes 8s clips
        }
        return { params: out, images: params.reference_urls.slice(), firstFrame: null };
    }
    const isSeedance2 = params.model === 'bytedance/seedance-2' || params.model === 'bytedance/seedance-2-fast';
    if (hasImage && isSeedance2) {
        // A voiceover (reference audio) cannot be combined with first-frame mode.
        const role = params.reference_audio_urls?.length ? 'reference' : (extra.image_role || 'first frame');
        if (role === 'first frame') { firstFrame = params.image_url; images = []; }
    }
    return { params: out, images, firstFrame };
}
