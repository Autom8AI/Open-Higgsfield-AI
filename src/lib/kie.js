import { getModelById, getVideoModelById, getI2IModelById, getI2VModelById } from './models.js';

const KIE_BASE = 'https://api.kie.ai';

export class KieClient {
    constructor() {
        // Dev requests go through the vite proxy ('/api' → https://api.kie.ai)
        this.baseUrl = import.meta.env.DEV ? '' : KIE_BASE;
    }

    getKey() {
        const key = window.__KIE_KEY__ || localStorage.getItem('kie_key');
        if (!key) throw new Error('API Key missing. Please set your kie.ai key in Settings.');
        return key;
    }

    async _submitTask(model, input, params = {}) {
        const key = this.getKey();
        const body = { model, input };
        console.log('[Kie] createTask:', model);
        console.log('[Kie] Payload:', body);

        const response = await fetch(`${this.baseUrl}/api/v1/jobs/createTask`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[Kie] API Error Body:', errText);
            throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errText.slice(0, 200)}`);
        }

        const json = await response.json();
        console.log('[Kie] Submit Response:', json);

        if (json.code && json.code !== 200) {
            throw new Error(`KIE Error ${json.code}: ${json.msg || 'Unknown error'}`);
        }

        const taskId = json.data?.taskId;
        if (!taskId) return json;

        if (params.onRequestId) params.onRequestId(taskId);
        return this.pollJobs(taskId, key, params.maxAttempts || 300, params.interval || 2000);
    }

    async pollJobs(taskId, key, maxAttempts = 60, interval = 2000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            console.log(`[Kie] Poll ${attempt}/${maxAttempts} ${taskId}`);

            try {
                const response = await fetch(`${this.baseUrl}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.warn(`[Kie] Poll error (${response.status}):`, errText);
                    if (response.status >= 500) continue;
                    throw new Error(`Poll Failed: ${response.status} - ${errText.slice(0, 100)}`);
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
                console.warn('[Kie] Poll attempt failed, retrying...', error.message);
            }
        }
        throw new Error('Generation timed out after polling.');
    }

    async pollVeo(taskId, key, maxAttempts, interval) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            console.log(`[Kie] Veo poll ${attempt}/${maxAttempts} ${taskId}`);

            try {
                const response = await fetch(`${this.baseUrl}/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }
                });

                if (!response.ok) {
                    const errText = await response.text();
                    console.warn(`[Kie] Poll error (${response.status}):`, errText);
                    if (response.status >= 500) continue;
                    throw new Error(`Poll Failed: ${response.status} - ${errText.slice(0, 100)}`);
                }

                const json = await response.json();
                const data = json.data || {};
                const flag = data.successFlag;

                if (flag === 1) {
                    const urls = data.response?.resultUrls || [];
                    return { ...data, resultUrls: urls };
                }
                if (flag === 2 || flag === 3) {
                    throw new Error(`Generation failed: ${data.errorMessage || 'Unknown error'}`);
                }
            } catch (error) {
                if (attempt === maxAttempts) throw error;
                console.warn('[Kie] Poll attempt failed, retrying...', error.message);
            }
        }
        throw new Error('Generation timed out after polling.');
    }

    async pollForResult(requestId, key, maxAttempts = 300, interval = 2000) {
        key = key || this.getKey();
        if (requestId.startsWith('veo:')) {
            return this.pollVeo(requestId.slice('veo:'.length), key, maxAttempts, interval);
        }
        return this.pollJobs(requestId, key, maxAttempts, interval);
    }

    _extractUrl(data) {
        if (Array.isArray(data.resultUrls) && data.resultUrls.length) return data.resultUrls[0];
        if (data.response?.resultUrls?.length) return data.response.resultUrls[0];
        return null;
    }

    _imageModel(id) {
        const modelInfo = getModelById(id) || { id, endpoint: id };
        if (id.includes('nano-banana-pro')) return { ...modelInfo, slug: 'nano-banana-pro' };
        if (id.includes('nano-banana-2')) return { ...modelInfo, slug: 'nano-banana-2' };
        if (id.includes('nano-banana')) return { ...modelInfo, slug: 'nano-banana' };
        if (id.includes('grok')) return { ...modelInfo, slug: 'grok-imagine/text-to-image' };
        return { ...modelInfo, slug: 'nano-banana-2' };
    }

    _editModel(id) {
        const modelInfo = getI2IModelById(id) || { id, endpoint: id };
        if (id.includes('qwen')) return { ...modelInfo, slug: 'qwen/image-to-image', mode: 'single' };
        if (id.includes('gpt')) return { ...modelInfo, slug: 'gpt-image-2-image-to-image', mode: 'input_urls' };
        if (id.includes('nano-banana-pro')) return { ...modelInfo, slug: 'nano-banana-pro', mode: 'image_input' };
        if (id.includes('nano-banana-2')) return { ...modelInfo, slug: 'nano-banana-2', mode: 'image_input' };
        if (id.includes('nano-banana')) return { ...modelInfo, slug: 'nano-banana-edit', mode: 'image_input' };
        return { ...modelInfo, slug: 'nano-banana-edit', mode: 'image_input' };
    }

    _imageInput(params, settings) {
        const input = { output_format: 'jpg' };
        if (params.prompt) input.prompt = params.prompt;
        if (params.aspect_ratio) input.aspect_ratio = params.aspect_ratio;
        if (params.resolution) input.resolution = String(params.resolution).toUpperCase().replace('K', 'K');
        if (typeof params.seed === 'number' && params.seed !== -1) input.seed = params.seed;

        const images = params.images_list?.length ? params.images_list : (params.image_url ? [params.image_url] : null);
        if (images) {
            if (settings.mode === 'single') input.image_url = images[0];
            else if (settings.mode === 'input_urls') input.input_urls = images;
            else input.image_input = images;
        }
        return input;
    }

    _videoModel(id, kind, hasImage) {
        const registry = kind === 'i2v' ? getI2VModelById(id) : getVideoModelById(id);
        const info = { ...registry } || { id, endpoint: id };

        if (id.includes('veo')) {
            const isFast = id.includes('fast');
            let model = 'veo3';
            if (isFast) model = 'veo3_fast';
            else if (id.includes('lite')) model = 'veo3_lite';
            return { ...info, family: 'veo', model, generationType: hasImage ? 'FIRST_AND_LAST_FRAMES_2_VIDEO' : 'TEXT_2_VIDEO' };
        }
        if (id.includes('kling')) {
            if (id.includes('2.1-standard')) return { ...info, family: 'jobs', model: 'kling/v2-1-standard' };
            return { ...info, family: 'jobs', model: 'kling/v2-1-pro' };
        }
        if (id.includes('seedance')) {
            if (id.includes('v1.5')) return { ...info, family: 'jobs', model: 'bytedance/seedance-1.5-pro' };
            if (id.includes('lite')) return { ...info, family: 'jobs', model: 'bytedance/seedance-2-fast' };
            return { ...info, family: 'jobs', model: 'bytedance/seedance-2' };
        }
        if (id.includes('wan')) {
            return { ...info, family: 'jobs', model: 'wan/3-0-video', videoInput: 'first_frame' };
        }
        if (id.includes('sora') || id.includes('ovi')) {
            if (hasImage) {
                return { ...info, family: 'jobs', model: id.includes('pro') ? 'sora-2-pro-image-to-video' : 'sora-2-image-to-video' };
            }
            return { ...info, family: 'jobs', model: id.includes('pro') ? 'sora-2-pro-text-to-video' : 'sora-2-text-to-video' };
        }
        if (kind === 'i2v') return { ...info, family: 'jobs', model: 'sora-2-image-to-video' };
        return { ...info, family: 'jobs', model: 'sora-2-text-to-video' };
    }

    _videoInput(params, settings) {
        const input = {};
        if (params.prompt) input.prompt = params.prompt;
        if (params.aspect_ratio) input.aspect_ratio = params.aspect_ratio;
        if (params.resolution) input.resolution = params.resolution;
        if (params.duration) input.duration = params.duration;

        const imageUrl = params.image_url;
        if (imageUrl) {
            if (settings.videoInput === 'first_frame') {
                input.first_frame_url = imageUrl;
                if (input.resolution) input.resolution = String(input.resolution).toUpperCase();
            } else {
                input.image_urls = [imageUrl];
            }
        }
        return input;
    }

    /**
     * Generates an image (Text-to-Image or Image-to-Image)
     */
    async generateImage(params) {
        const modelInfo = this._imageModel(params.model);
        const settings = { mode: params.image_url ? 'image_input' : null };
        const input = this._imageInput(params, settings);

        const result = await this._submitTask(modelInfo.slug, input, { onRequestId: params.onRequestId });
        const imageUrl = this._extractUrl(result) || result.url || result.output?.url;
        console.log('[Kie] Image URL:', imageUrl);
        return { ...result, url: imageUrl };
    }

    /**
     * Generates an image using an Image-to-Image model.
     */
    async generateI2I(params) {
        const settings = this._editModel(params.model);
        const input = this._imageInput(params, settings);

        const result = await this._submitTask(settings.slug, input, { onRequestId: params.onRequestId });
        const imageUrl = this._extractUrl(result) || result.url || result.output?.url;
        console.log('[Kie] I2I Result URL:', imageUrl);
        return { ...result, url: imageUrl };
    }

    /**
     * Generates a video (Text-to-Video or Image-to-Video)
     */
    async generateVideo(params) {
        const settings = this._videoModel(params.model, 't2v', !!params.image_url);
        return this._runVideo(settings, params);
    }

    /**
     * Generates a video using an Image-to-Video model.
     */
    async generateI2V(params) {
        const settings = this._videoModel(params.model, 'i2v', !!params.image_url);
        return this._runVideo(settings, params);
    }

    async _runVideo(settings, params) {
        if (settings.family === 'veo') {
            const key = this.getKey();
            const body = {
                prompt: params.prompt,
                model: settings.model,
                generationType: settings.generationType,
                aspect_ratio: params.aspect_ratio || '16:9',
                resolution: params.resolution || '720p',
                enableFallback: false
            };
            if (params.image_url) body.imageUrls = [params.image_url];

            console.log('[Kie] Veo generate:', settings.model);
            console.log('[Kie] Veo Payload:', body);

            const response = await fetch(`${this.baseUrl}/api/v1/veo/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[Kie] Veo API Error:', errText);
                throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errText.slice(0, 200)}`);
            }

            const json = await response.json();
            if (json.code && json.code !== 200) throw new Error(`KIE Error ${json.code}: ${json.msg}`);

            const taskId = json.data?.taskId;
            if (!taskId) return json;

            if (params.onRequestId) params.onRequestId(`veo:${taskId}`);

            const result = await this.pollVeo(taskId, key, 900, 2000);
            const videoUrl = this._extractUrl(result) || result.url || result.output?.url;
            console.log('[Kie] Veo Result URL:', videoUrl);
            return { ...result, url: videoUrl };
        }

        const input = this._videoInput(params, settings);
        const result = await this._submitTask(settings.model, input, { onRequestId: params.onRequestId, maxAttempts: 900 });
        const videoUrl = this._extractUrl(result) || result.url || result.output?.url;
        console.log('[Kie] Video URL:', videoUrl);
        return { ...result, url: videoUrl };
    }

    /**
     * Processes a video through a Video-to-Video model.
     */
    async processV2V(params) {
        throw new Error('Video-to-video models are not available on kie.ai yet.');
    }

    /**
     * Processes lipsync / speech-to-video generation.
     */
    async processLipSync(params) {
        const key = this.getKey();
        void key;

        let slug;
        let input = {};

        if (params.video_url && params.audio_url) {
            // Driver: volcengine video-to-video lip sync (video + audio -> video)
            slug = 'volcengine/video-to-video-lip-sync';
            input = {
                mode: 'basic',
                video_url: params.video_url,
                audio_url: params.audio_url
            };
        } else if (params.image_url && params.audio_url) {
            // Driver: omnihuman 1.5 (portrait image + audio -> talking video)
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

        const result = await this._submitTask(slug, input, { onRequestId: params.onRequestId, maxAttempts: 900 });
        const videoUrl = this._extractUrl(result) || result.url || result.output?.url;
        console.log('[Kie] LipSync Result URL:', videoUrl);
        return { ...result, url: videoUrl };
    }

    /**
     * Uploads a file to KIE and returns the hosted URL.
     * Note: uploaded files expire after 24 hours.
     */
    async uploadFile(file) {
        const key = this.getKey();
        const url = `${this.baseUrl}/api/v1/file-stream-upload`;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('uploadPath', 'open-higgsfield');
        formData.append('fileName', file.name);

        console.log('[Kie] Uploading file:', file.name);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}` },
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`File upload failed: ${response.status} - ${errText.slice(0, 200)}`);
        }

        const json = await response.json();
        console.log('[Kie] Upload response:', json);

        if (json.code && json.code !== 200) {
            throw new Error(`File upload failed: ${json.code} ${json.msg}`);
        }

        const fileUrl = json.data?.fileUrl || json.data?.downloadUrl || json.data?.url || json.url;
        if (!fileUrl) throw new Error('No URL returned from file upload');
        return fileUrl;
    }

    getDimensionsFromAR(ar) {
        switch (ar) {
            case '1:1': return [1024, 1024];
            case '16:9': return [1280, 720];
            case '9:16': return [720, 1280];
            case '4:3': return [1152, 864];
            case '3:2': return [1216, 832];
            case '21:9': return [1536, 640];
            default: return [1024, 1024];
        }
    }
}

export const kie = new KieClient();
