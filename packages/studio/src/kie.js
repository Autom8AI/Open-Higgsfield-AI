const BASE_URL = 'https://api.kie.ai';

async function getHeaders(apiKey) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };
}

async function pollJobs(taskId, apiKey, maxAttempts = 900, interval = 2000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        try {
            const response = await fetch(`${BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
                headers: await getHeaders(apiKey)
            });
            if (!response.ok) {
                const errText = await response.text();
                if (response.status >= 500) continue;
                throw new Error(`Poll Failed: ${response.status} - ${errText.slice(0, 200)}`);
            }
            const json = await response.json();
            if (json.code && json.code !== 200) {
                if (attempt === maxAttempts) throw new Error(`KIE Poll Error ${json.code}: ${json.msg}`);
                continue;
            }
            const data = json.data || {};
            const state = (data.state || '').toLowerCase();
            if (state === 'success') return data;
            if (state === 'fail' || state === 'error') {
                throw new Error(`Generation failed: ${data.failMsg || 'Unknown error'}`);
            }
        } catch (error) {
            if (attempt === maxAttempts) throw error;
        }
    }
    throw new Error('Generation timed out after polling.');
}

function extractResultUrl(data) {
    if (Array.isArray(data.resultUrls) && data.resultUrls.length) return data.resultUrls[0];
    if (data.response?.resultUrls?.length) return data.response.resultUrls[0];
    return null;
}

async function submitTask(apiKey, slug, input, onRequestId, maxAttempts = 60) {
    const response = await fetch(`${BASE_URL}/api/v1/jobs/createTask`, {
        method: 'POST',
        headers: await getHeaders(apiKey),
        body: JSON.stringify({ model: slug, input })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errText.slice(0, 200)}`);
    }
    const json = await response.json();
    if (json.code && json.code !== 200) {
        throw new Error(`KIE Error ${json.code}: ${json.msg || 'Unknown error'}`);
    }
    const taskId = json.data?.taskId;
    if (!taskId) return json;
    if (onRequestId) onRequestId(taskId);
    const result = await pollJobs(taskId, apiKey, maxAttempts);
    const outputUrl = extractResultUrl(result) || result.url;
    return { ...result, url: outputUrl };
}

function imageSlug(params) {
    const id = params.model || '';
    if (id.includes('nano-banana-pro')) return 'nano-banana-pro';
    if (id.includes('nano-banana-2')) return 'nano-banana-2';
    if (id.includes('nano-banana')) return 'nano-banana';
    if (id.includes('grok')) return 'grok-imagine/text-to-image';
    return 'nano-banana-2';
}

function editSlug(params) {
    const id = params.model || '';
    if (id.includes('qwen')) return 'qwen/image-to-image';
    if (id.includes('gpt')) return 'gpt-image-2-image-to-image';
    if (id.includes('nano-banana-pro')) return 'nano-banana-pro';
    if (id.includes('nano-banana-2')) return 'nano-banana-2';
    if (id.includes('nano-banana')) return 'nano-banana-edit';
    return 'nano-banana-edit';
}

function imageInput(params, edit) {
    const input = { output_format: 'jpg' };
    if (params.prompt) input.prompt = params.prompt;
    if (params.aspect_ratio) input.aspect_ratio = params.aspect_ratio;
    if (params.resolution) input.resolution = String(params.resolution).toUpperCase().replace('K', 'K');
    if (params.seed !== undefined && params.seed !== -1) input.seed = params.seed;

    const images = params.images_list?.length > 0 ? params.images_list : (params.image_url ? [params.image_url] : null);
    if (images) {
        if (edit) {
            const id = params.model || '';
            if (id.includes('qwen')) input.image_url = images[0];
            else if (id.includes('gpt')) input.input_urls = images;
            else input.image_input = images;
        } else {
            input.image_input = images;
        }
    }
    return input;
}

function videoSlug(params, kind, hasImage) {
    const id = params.model || '';
    if (id.includes('veo')) {
        let model = 'veo3';
        if (id.includes('fast')) model = 'veo3_fast';
        else if (id.includes('lite')) model = 'veo3_lite';
        return { family: 'veo', model, generationType: hasImage ? 'FIRST_AND_LAST_FRAMES_2_VIDEO' : 'TEXT_2_VIDEO' };
    }
    if (id.includes('kling')) {
        if (id.includes('2.1-standard')) return { family: 'jobs', model: 'kling/v2-1-standard' };
        return { family: 'jobs', model: 'kling/v2-1-pro', klingI2v: true };
    }
    if (id.includes('seedance')) {
        if (id.includes('v1.5')) return { family: 'jobs', model: 'bytedance/seedance-1.5-pro' };
        if (id.includes('lite')) return { family: 'jobs', model: 'bytedance/seedance-2-fast' };
        return { family: 'jobs', model: 'bytedance/seedance-2' };
    }
    if (id.includes('wan')) {
        return { family: 'jobs', model: 'wan/3-0-video', videoInput: 'first_frame' };
    }
    if (id.includes('sora') || id.includes('ovi')) {
        if (hasImage) return { family: 'jobs', model: id.includes('pro') ? 'sora-2-pro-image-to-video' : 'sora-2-image-to-video' };
        return { family: 'jobs', model: id.includes('pro') ? 'sora-2-pro-text-to-video' : 'sora-2-text-to-video' };
    }
    if (kind === 'i2v') return { family: 'jobs', model: 'sora-2-image-to-video' };
    return { family: 'jobs', model: 'sora-2-text-to-video' };
}

function videoInput(params, settings) {
    const input = {};
    if (params.prompt) input.prompt = params.prompt;
    if (params.aspect_ratio) input.aspect_ratio = params.aspect_ratio;
    if (params.duration) input.duration = params.duration;
    if (params.resolution) input.resolution = params.resolution;
    if (params.image_url) {
        if (settings.videoInput === 'first_frame') {
            input.first_frame_url = params.image_url;
            if (input.resolution) input.resolution = String(input.resolution).toUpperCase();
        } else {
            input.image_urls = [params.image_url];
        }
    }
    return input;
}

export async function generateImage(apiKey, params) {
    const slug = imageSlug(params);
    const input = imageInput(params, false);
    return submitTask(apiKey, slug, input, params.onRequestId, 60);
}

export async function generateI2I(apiKey, params) {
    const slug = editSlug(params);
    const input = imageInput(params, true);
    return submitTask(apiKey, slug, input, params.onRequestId, 60);
}

export async function generateVideo(apiKey, params) {
    const settings = videoSlug(params, 't2v', !!params.image_url);
    if (settings.family === 'veo') return generateVeo(apiKey, params, settings);
    const input = videoInput(params, settings);
    return submitTask(apiKey, settings.model, input, params.onRequestId, 900);
}

export async function generateI2V(apiKey, params) {
    const settings = videoSlug(params, 'i2v', !!params.image_url);
    if (settings.family === 'veo') return generateVeo(apiKey, params, settings);
    const input = videoInput(params, settings);
    return submitTask(apiKey, settings.model, input, params.onRequestId, 900);
}

async function generateVeo(apiKey, params, settings) {
    const isI2v = !!params.image_url;
    const body = {
        prompt: params.prompt,
        model: settings.model,
        generationType: isI2v ? 'FIRST_AND_LAST_FRAMES_2_VIDEO' : 'TEXT_2_VIDEO',
        aspect_ratio: params.aspect_ratio || '16:9',
        resolution: params.resolution || '720p',
        enableFallback: false
    };
    if (isI2v) body.imageUrls = [params.image_url];

    const response = await fetch(`${BASE_URL}/api/v1/veo/generate`, {
        method: 'POST',
        headers: await getHeaders(apiKey),
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errText.slice(0, 200)}`);
    }
    const json = await response.json();
    if (json.code && json.code !== 200) throw new Error(`KIE Error ${json.code}: ${json.msg}`);

    const taskId = json.data?.taskId;
    if (!taskId) return json;
    if (params.onRequestId) params.onRequestId(`veo:${taskId}`);

    for (let attempt = 1; attempt <= 900; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const record = await fetch(`${BASE_URL}/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`, {
            headers: await getHeaders(apiKey)
        });
        if (!record.ok) {
            if (record.status >= 500) continue;
            throw new Error(`Poll Failed: ${record.status}`);
        }
        const recordJson = await record.json();
        const data = recordJson.data || {};
        if (data.successFlag === 1) {
            const videoUrl = data.response?.resultUrls?.[0] || null;
            return { ...data, url: videoUrl };
        }
        if (data.successFlag === 2 || data.successFlag === 3) {
            throw new Error(`Generation failed: ${data.errorMessage || 'Unknown error'}`);
        }
    }
    throw new Error('Generation timed out after polling.');
}

export async function processLipSync(apiKey, params) {
    let slug;
    let input = {};

    if (params.video_url && params.audio_url) {
        slug = 'volcengine/video-to-video-lip-sync';
        input = {
            mode: 'basic',
            video_url: params.video_url,
            audio_url: params.audio_url
        };
    } else if (params.image_url && params.audio_url) {
        slug = 'omnihuman-1-5';
        input = {
            image_url: params.image_url,
            audio_url: params.audio_url,
            output_resolution: '1080'
        };
        if (params.prompt) input.prompt = params.prompt;
        if (params.seed !== undefined && params.seed !== -1) input.seed = params.seed;
    } else {
        throw new Error('LipSync requires both a source (image or video) and an audio file.');
    }

    return submitTask(apiKey, slug, input, params.onRequestId, 900);
}

export function uploadFile(apiKey, file, onProgress) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}/api/v1/file-stream-upload`;
        const formData = new FormData();
        formData.append('file', file);
        formData.append('uploadPath', 'open-higgsfield');
        formData.append('fileName', file.name);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`);

        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.round((event.loaded / event.total) * 100);
                    onProgress(percentComplete);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const json = JSON.parse(xhr.responseText);
                    if (json.code && json.code !== 200) {
                        reject(new Error(`File upload failed: ${json.code} ${json.msg}`));
                        return;
                    }
                    const fileUrl = json.data?.fileUrl || json.data?.downloadUrl || json.data?.url || json.url;
                    if (!fileUrl) {
                        reject(new Error('No URL returned from file upload'));
                    } else {
                        resolve(fileUrl);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse upload response'));
                }
            } else {
                reject(new Error(`File upload failed: ${xhr.status} - ${xhr.statusText}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during file upload'));
        xhr.send(formData);
    });
}
