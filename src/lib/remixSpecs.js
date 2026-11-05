// Video-to-video ("Remix") models: what each accepts and how to build the kie
// request. Field names follow docs.kie.ai/market/<model>.md (checked 2026-11-05).
// The registry entries for the backend live in netlify/functions/_kie.js.

export const REMIX_MODES = [
    {
        id: 'motion',
        label: 'Motion Transfer',
        blurb: 'Keep the movement of a source video, but with your own character.',
        needs: 'One reference image of your character (head, shoulders and torso visible).',
    },
    {
        id: 'replace',
        label: 'Character Swap',
        blurb: 'Replace the person in a video with your character; the scene stays.',
        needs: 'One clear image of your character.',
    },
    {
        id: 'edit',
        label: 'Object Swap / Edit',
        blurb: 'Change a character, product, outfit or location and keep the rest of the shot.',
        needs: 'A prompt saying what to change; reference images are optional but help.',
    },
];

const audioExtra = {
    key: 'audio_setting', label: 'Audio', type: 'select', default: 'auto',
    options: [{ value: 'auto', label: 'Regenerate to match' }, { value: 'origin', label: 'Keep original' }],
};

export const REMIX_SPECS = {
    'kling-3.0/motion-control': {
        mode: 'motion',
        video: { minSec: 3, maxSec: 30, maxMb: 100 },
        images: { min: 1, max: 1, param: 'input_urls', single: false },
        resolutions: ['720p', '1080p'], resolutionDefault: '720p', resolutionParam: 'mode',
        promptRequired: false,
        defaultPrompt: 'Match the movement of the reference video.',
        videoParam: 'video_urls', videoSingle: false,
        extras: [{
            key: 'character_orientation', label: 'Orientation follows', type: 'select', default: 'video',
            options: [{ value: 'video', label: 'Source video' }, { value: 'image', label: 'Reference image' }],
        }],
    },
    'kling-2.6/motion-control': {
        mode: 'motion',
        video: { minSec: 3, maxSec: 30, maxMb: 100 },
        images: { min: 1, max: 1, param: 'input_urls', single: false },
        resolutions: ['720p', '1080p'], resolutionDefault: '720p', resolutionParam: 'mode',
        promptRequired: false,
        defaultPrompt: 'Match the movement of the reference video.',
        videoParam: 'video_urls', videoSingle: false,
        extras: [{
            key: 'character_orientation', label: 'Orientation follows', type: 'select', default: 'video',
            options: [{ value: 'video', label: 'Source video (up to 30s)' }, { value: 'image', label: 'Reference image (up to 10s)' }],
        }],
    },
    'wan/2-2-animate-move': {
        mode: 'motion',
        video: { minSec: 1, maxSec: 30, maxMb: 100 },
        images: { min: 1, max: 1, param: 'image_url', single: true, maxMb: 5 },
        resolutions: ['720p'], resolutionDefault: '720p',
        noPrompt: true,
        videoParam: 'video_url', videoSingle: true,
        extras: [],
    },
    'wan/2-2-animate-replace': {
        mode: 'replace',
        video: { minSec: 1, maxSec: 30, maxMb: 10 },
        images: { min: 1, max: 1, param: 'image_url', single: true },
        resolutions: ['480p', '580p', '720p'], resolutionDefault: '480p',
        noPrompt: true,
        videoParam: 'video_url', videoSingle: true,
        extras: [],
    },
    'happyhorse/video-edit': {
        mode: 'edit',
        video: { minSec: 3, maxSec: 60, maxMb: 100 },
        images: { min: 0, max: 5, param: 'reference_image', single: false },
        resolutions: ['720p', '1080p'], resolutionDefault: '1080p',
        promptRequired: true,
        videoParam: 'video_url', videoSingle: true,
        extras: [audioExtra],
    },
    'wan/2-7-videoedit': {
        mode: 'edit',
        video: { minSec: 2, maxSec: 10, maxMb: 100 },
        images: { min: 0, max: 1, param: 'reference_image', single: true },
        resolutions: ['720p', '1080p'], resolutionDefault: '1080p',
        promptRequired: false,
        videoParam: 'video_url', videoSingle: true,
        extras: [audioExtra],
    },
};

export const modelsForMode = (modeId) => Object.keys(REMIX_SPECS).filter(id => REMIX_SPECS[id].mode === modeId);

export const REMIX_LABELS = {
    'kling-3.0/motion-control': 'Kling 3.0 Motion Control',
    'happyhorse/video-edit': 'HappyHorse Video Edit',
    'wan/2-7-videoedit': 'Wan 2.7 Video Edit',
    'kling-2.6/motion-control': 'Kling 2.6 Motion Control',
    'wan/2-2-animate-move': 'Wan 2.2 Animate Move',
    'wan/2-2-animate-replace': 'Wan 2.2 Animate Replace',
};

// Request body for the direct kie.ai path (the backend builds its own).
export function buildRemixInput(modelId, params) {
    const spec = REMIX_SPECS[modelId];
    if (!spec) throw new Error(`Unknown remix model: ${modelId}`);
    const input = {};
    const prompt = (params.prompt || '').trim() || spec.defaultPrompt;
    if (prompt && !spec.noPrompt) input.prompt = prompt;
    if (params.resolution) input[spec.resolutionParam || 'resolution'] = params.resolution;
    const images = params.images || [];
    if (images.length) input[spec.images.param] = spec.images.single ? images[0] : images;
    input[spec.videoParam] = spec.videoSingle ? params.video_url : [params.video_url];
    for (const f of spec.extras || []) {
        const v = params.extra?.[f.key] ?? f.default;
        if (v !== undefined && v !== '') input[f.key] = v;
    }
    return input;
}
