// Bridge to the content-factory Netlify function backend (same account,
// credits and Airtable library). Activated by logging in; falls back to the
// direct kie.ai client when no session is active.
const BASE = '/.netlify/functions';
let sessionActive = false;
const SESSION_FLAG = 'cf_backend';

export function cfBackendEnabled() {
    if (!localStorage.getItem(SESSION_FLAG)) return false;
    return sessionActive || checkSession().then(ok => {
        sessionActive = ok;
        if (!ok) localStorage.removeItem(SESSION_FLAG);
        return ok;
    });
}

async function request(path, options = {}) {
    const response = await fetch(`${BASE}${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        credentials: 'include'
    });
    let json = {};
    try { json = await response.json(); } catch { /* empty */ }
    if (!response.ok || json.error) {
        const message = json.error || `Request failed (${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }
    return json;
}

export async function login(name, pin) {
    const json = await request('/login', {
        method: 'POST',
        body: JSON.stringify({ name: String(name || '').trim(), pin: String(pin || '').trim() })
    });
    if (json.ok) {
        localStorage.setItem(SESSION_FLAG, '1');
        sessionActive = true;
    }
    return json;
}

export async function logoutBackend() {
    const json = await request('/logout', { method: 'POST' });
    localStorage.removeItem(SESSION_FLAG);
    sessionActive = false;
    return json;
}

export async function sessionAccount() {
    const json = await request('/credits');
    sessionActive = true;
    localStorage.setItem(SESSION_FLAG, '1');
    return { connected: true, credits: json.credits };
}

function checkSession() {
    return request('/credits').then(j => { sessionActive = true; return true; }).catch(() => { sessionActive = false; return false; });
}

async function pollBackend(taskId, maxAttempts = 300, interval = 2000) {    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        try {
            const json = await request(`/status?taskId=${encodeURIComponent(taskId)}`);
            const state = String(json.state || '').toLowerCase();
            if (state === 'success' || state === 'completed') return { resultUrls: json.urls || [], ...json };
            if (state === 'fail' || state === 'FAILED') throw new Error(json.error || 'Generation failed');
        } catch (error) {
            if (attempt === maxAttempts) throw error;
        }
    }
    throw new Error('Generation timed out after polling.');
}

async function create(payload, params) {
    const json = await request('/create', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    const { taskId } = json;
    if (!taskId) return json;
    if (params.onRequestId) params.onRequestId(`cf:${taskId}`);
    const result = await pollBackend(taskId);
    const url = result.resultUrls?.[0] || result.url;
    return { ...result, url };
}

const IMAGE_MAP = [
    ['nano-banana-pro', 'nano-banana-pro'],
    ['nano-banana-2', 'nano-banana-2'],
    ['nano-banana', 'nano-banana-2'],
    ['gpt', 'gpt-image-2-text-to-image'],
];

const EDIT_MAP = [
    ['nano-banana-pro', 'nano-banana-pro'],
    ['nano-banana-2', 'nano-banana-2'],
    ['gpt', 'gpt-image-2-image-to-image'],
    ['qwen', 'gpt-image-2-image-to-image'],
    ['nano-banana', 'google/nano-banana-edit'],
];

function mapImageId(id, edit) {
    const table = edit ? EDIT_MAP : IMAGE_MAP;
    for (const [needle, slug] of table) {
        if (String(id).includes(needle)) return slug;
    }
    return edit ? 'google/nano-banana-edit' : 'nano-banana-2';
}

const VIDEO_MAP = [
    ['seedance-v1.5', 'bytedance/seedance-1.5-pro'],
    ['seedance', 'bytedance/seedance-2'],
    ['lite', 'bytedance/seedance-2-fast'],
    ['kling-2.1-standard', 'kling/v3-turbo-text-to-video'],
    ['kling', 'kling-3.0/video'],
    ['wan', 'wan/2-5-text-to-video'],
];

function mapVideoId(id) {
    const vid = String(id);
    for (const [needle, slug] of VIDEO_MAP) {
        if (vid.includes(needle)) return slug;
    }
    return vid.includes('pro') ? 'bytedance/seedance-2' : 'bytedance/seedance-2-fast';
}

export async function generateImage(params) {
    return create({
        modelId: mapImageId(params.model, !!params.image_url),
        prompt: params.prompt,
        images: params.image_url ? [params.image_url] : [],
        params: { ...(params.aspect_ratio ? { aspect_ratio: params.aspect_ratio } : {}), ...(params.resolution ? { resolution: String(params.resolution).toUpperCase() } : {}) }
    }, params);
}

export async function generateI2I(params) {
    return generateImage(params);
}

function videoPayload(params, kind) {
    return {
        modelId: mapVideoId(params.model),
        prompt: params.prompt,
        images: params.image_url ? [params.image_url] : [],
        videos: [],
        params: {
            ...(params.aspect_ratio ? { aspect_ratio: params.aspect_ratio } : {}),
            ...(params.resolution ? { resolution: params.resolution } : {}),
            ...(params.duration ? { duration: params.duration } : {})
        }
    };
}

export async function generateVideo(params) {
    return create(videoPayload(params, 't2v'), params);
}

export async function generateI2V(params) {
    return create(videoPayload(params, 'i2v'), params);
}

export async function processLipSync(params) {
    if (!params.image_url) {
        throw new Error('This backend lip-sync model works with a portrait image + audio. Video-driven lip sync needs the direct-KIE mode.');
    }
    const input = { image_url: params.image_url, audio_url: params.audio_url, output_resolution: String(params.resolution || '1080').replace('p', '') };
    if (params.prompt) input.prompt = params.prompt;
    if (params.seed !== undefined && params.seed !== -1) input.seed = params.seed;
    return create({ modelId: 'omnihuman-1-5', prompt: params.prompt || '', images: [], videos: [], params: input }, params);
}

export async function uploadFile(file) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
    const json = await request('/upload', { method: 'POST', body: JSON.stringify({ image: dataUrl, index: 0 }) });
    return json.url;
}

export async function buildPrompt(brief, kind = 'image') {
    const json = await request('/prompt-builder', {
        method: 'POST',
        body: JSON.stringify({ brief, kind })
    });
    return json.prompt;
}

export async function listLibrary() {
    const json = await request('/library');
    return json.items || [];
}

export async function deleteLibraryItem(id) {
    return request(`/library?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function resumePoll(requestId, maxAttempts = 300, interval = 2000) {
    const taskId = String(requestId).replace(/^cf:/, '');
    return pollBackend(taskId, maxAttempts, interval);
}

export async function getTaskResult(requestId) {
    const taskId = String(requestId).replace(/^cf:/, '');
    return pollBackend(taskId, 1, 0).catch(() => null);
}
