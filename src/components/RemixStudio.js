// Remix: video-to-video.
//   Motion Transfer  - keep the movement of a source video, swap in your own character.
//   Object Swap/Edit - change a character, product, outfit or location, keep the shot.
//
// Pick a mode, add the source video (and reference images), optionally describe
// the change, check the cost, and Generate. Like the other studios the form
// clears right away so the next remix can be set up while this one runs.
import { kie } from '../lib/kie.js';
import { REMIX_MODES, REMIX_SPECS, REMIX_LABELS, modelsForMode } from '../lib/remixSpecs.js';
import { startGenerationJob, getPendingJobs, removePendingJob } from '../lib/pendingJobs.js';
import { loadPricing, estimateCredits, priceLabel } from '../lib/modelSort.js';
import { createQueueHistory, costMeta } from '../lib/studioQueue.js';
import { renderResultGrid } from '../lib/resultCards.js';
import { createUploadPicker } from './UploadPicker.js';
import { AuthModal } from './AuthModal.js';

const modelObj = (id) => ({ id, name: REMIX_LABELS[id] || id });

export function RemixStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full overflow-y-auto custom-scrollbar bg-app-bg px-4 md:px-10 py-8';

    loadPricing().then(() => { refreshModelSelect(); refreshCost(); });

    // --- State ---
    let mode = REMIX_MODES[0];
    let modelId = modelsForMode(mode.id)[0];
    let resolution = REMIX_SPECS[modelId].resolutionDefault;
    let extra = {};
    let video = null;       // { url, name, duration } once uploaded
    let uploading = false;
    let imageUrls = [];
    const spec = () => REMIX_SPECS[modelId];

    const head = document.createElement('div');
    head.className = 'max-w-5xl mx-auto mb-8';
    head.innerHTML = `
        <h1 class="text-3xl md:text-5xl font-black tracking-tight text-white mb-2">Remix</h1>
        <p class="text-sm text-secondary">Start from a video you already have. Move your own character with its motion, or change one thing and keep the shot.</p>`;
    container.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = 'max-w-5xl mx-auto flex flex-col gap-8 pb-24';
    container.appendChild(wrap);

    const card = document.createElement('section');
    card.className = 'bg-[#111]/90 border border-white/10 rounded-3xl p-5 md:p-7 flex flex-col gap-6';
    wrap.appendChild(card);

    const label = (text) => {
        const l = document.createElement('div');
        l.className = 'text-[10px] font-bold text-secondary uppercase tracking-widest mb-2';
        l.textContent = text;
        return l;
    };

    // ---- Mode ----
    const modeBlock = document.createElement('div');
    modeBlock.appendChild(label('What do you want to do?'));
    const modeRow = document.createElement('div');
    modeRow.className = 'grid grid-cols-1 sm:grid-cols-2 gap-3';
    modeBlock.appendChild(modeRow);
    card.appendChild(modeBlock);

    function paintModes() {
        modeRow.innerHTML = '';
        REMIX_MODES.forEach(m => {
            const b = document.createElement('button');
            b.type = 'button';
            const on = m.id === mode.id;
            b.className = `text-left rounded-2xl px-4 py-3 border transition-all ${on ? 'bg-primary/10 border-primary' : 'bg-white/5 border-white/10 hover:border-primary/40'}`;
            b.innerHTML = '<div class="text-sm font-black text-white"></div><div class="text-[11px] text-secondary mt-1"></div>';
            b.children[0].textContent = m.label;
            b.children[1].textContent = m.blurb;
            b.onclick = () => selectMode(m);
            modeRow.appendChild(b);
        });
    }

    // ---- Source video ----
    const videoBlock = document.createElement('div');
    videoBlock.appendChild(label('1 · Source video'));
    const videoInput = document.createElement('input');
    videoInput.type = 'file';
    videoInput.accept = 'video/mp4,video/quicktime,video/*';
    videoInput.className = 'hidden';
    const videoBox = document.createElement('button');
    videoBox.type = 'button';
    videoBox.className = 'w-full text-left rounded-2xl border border-dashed border-white/20 hover:border-primary/50 bg-black/30 px-4 py-4 transition-all';
    const videoStatus = document.createElement('div');
    const videoBar = document.createElement('div');
    videoBar.className = 'hidden h-1.5 rounded-full bg-white/10 overflow-hidden mt-3';
    const videoBarFill = document.createElement('div');
    videoBarFill.className = 'h-full bg-primary transition-all';
    videoBarFill.style.width = '0%';
    videoBar.appendChild(videoBarFill);
    videoBox.append(videoStatus, videoBar);
    videoBlock.append(videoInput, videoBox);
    card.appendChild(videoBlock);

    function paintVideo(msg, tone = 'muted') {
        const tones = { muted: 'text-secondary', ok: 'text-primary', err: 'text-[#ff6b6b]' };
        videoStatus.innerHTML = '';
        const t = document.createElement('div');
        t.className = 'text-sm font-bold text-white';
        const s = document.createElement('div');
        s.className = `text-[11px] mt-1 ${tones[tone]}`;
        if (video) {
            t.textContent = `✓ ${video.name}`;
            s.textContent = `${Math.round(video.duration * 10) / 10}s · click to replace`;
            s.className = 'text-[11px] mt-1 text-primary';
        } else {
            t.textContent = uploading ? 'Uploading…' : 'Click to choose a video';
            const v = spec().video;
            s.textContent = msg || `MP4 or MOV, ${v.minSec}–${v.maxSec} seconds, up to ${v.maxMb} MB`;
            if (msg) s.className = `text-[11px] mt-1 ${tones[tone]}`;
        }
        videoStatus.append(t, s);
    }

    videoBox.onclick = () => { if (!uploading) videoInput.click(); };
    videoInput.onchange = async () => {
        const file = videoInput.files[0];
        videoInput.value = '';
        if (!file) return;
        if (!localStorage.getItem('kie_key') && !localStorage.getItem('cf_backend')) { AuthModal(() => videoBox.click()); return; }
        const v = spec().video;
        if (file.size > v.maxMb * 1024 * 1024) { paintVideo(`That file is ${(file.size / 1048576).toFixed(0)} MB. ${REMIX_LABELS[modelId]} accepts up to ${v.maxMb} MB.`, 'err'); return; }
        const duration = await readDuration(file);
        if (duration != null && (duration < v.minSec - 0.05 || duration > v.maxSec + 0.05)) {
            paintVideo(`That clip is ${Math.round(duration * 10) / 10}s. ${REMIX_LABELS[modelId]} needs ${v.minSec}–${v.maxSec} seconds.`, 'err');
            return;
        }
        uploading = true;
        video = null;
        paintVideo('');
        videoBar.classList.remove('hidden');
        videoBarFill.style.width = '0%';
        updateGenerate();
        try {
            const url = await kie.uploadVideo(file, (p) => { videoBarFill.style.width = `${Math.round(p * 100)}%`; });
            video = { url, name: file.name, duration: duration ?? 0 };
            paintVideo('');
        } catch (e) {
            paintVideo(e.message, 'err');
        } finally {
            uploading = false;
            videoBar.classList.add('hidden');
            updateGenerate();
            refreshCost();
        }
    };

    function readDuration(file) {
        return new Promise((resolve) => {
            const el = document.createElement('video');
            el.preload = 'metadata';
            const url = URL.createObjectURL(file);
            const done = (d) => { URL.revokeObjectURL(url); resolve(d); };
            el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
            el.onerror = () => done(null);
            el.src = url;
        });
    }

    // ---- Reference images ----
    const imageBlock = document.createElement('div');
    const imageTitle = label('');
    imageBlock.appendChild(imageTitle);
    const imageRow = document.createElement('div');
    imageRow.className = 'flex items-start gap-4';
    const imageHint = document.createElement('div');
    imageHint.className = 'text-[11px] text-secondary pt-3';
    const picker = createUploadPicker({
        anchorContainer: container,
        maxImages: 1,
        onSelect: ({ urls, url }) => { imageUrls = urls || [url]; updateGenerate(); paintImageHint(); },
        onClear: () => { imageUrls = []; updateGenerate(); paintImageHint(); },
    });
    imageRow.append(picker.trigger, imageHint);
    imageBlock.appendChild(imageRow);
    container.appendChild(picker.panel);
    card.appendChild(imageBlock);

    function paintImageHint() {
        const im = spec().images;
        imageTitle.textContent = im.min > 0 ? `2 · Reference image${im.max > 1 ? 's' : ''}` : `2 · Reference image${im.max > 1 ? 's' : ''} (optional)`;
        const n = imageUrls.length;
        imageHint.textContent = n
            ? `${n} image${n > 1 ? 's' : ''} selected${im.max > 1 ? ` (up to ${im.max})` : ''}`
            : (im.min > 0 ? mode.needs : `Add up to ${im.max} to show the new character, product or outfit.`);
    }

    // ---- Prompt ----
    const promptBlock = document.createElement('div');
    const promptTitle = label('');
    const prompt = document.createElement('textarea');
    prompt.rows = 3;
    prompt.className = 'w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-base text-white placeholder:text-muted focus:outline-none focus:border-primary/50 resize-none';
    prompt.oninput = updateGenerate;
    promptBlock.append(promptTitle, prompt);
    card.appendChild(promptBlock);

    function paintPrompt() {
        const req = spec().promptRequired;
        promptTitle.textContent = req ? '3 · What should change?' : '3 · Describe it (optional)';
        prompt.placeholder = mode.id === 'motion'
            ? 'e.g. A knight in silver armour in a misty forest'
            : 'e.g. Replace the soda can with a glass bottle of cold brew coffee';
    }

    // ---- Settings ----
    const settings = document.createElement('div');
    settings.className = 'grid grid-cols-2 md:grid-cols-4 gap-3';
    card.appendChild(settings);

    const selectField = (title, cls = '') => {
        const f = document.createElement('div');
        f.className = cls;
        f.appendChild(label(title));
        const sel = document.createElement('select');
        sel.className = 'w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-primary/50';
        f.appendChild(sel);
        settings.appendChild(f);
        return { f, sel };
    };
    const modelField = selectField('Model', 'col-span-2');
    const resField = selectField('Resolution');
    const extraHost = document.createElement('div');
    extraHost.className = 'contents';
    settings.appendChild(extraHost);

    function refreshModelSelect() {
        modelField.sel.innerHTML = '';
        modelsForMode(mode.id).forEach(id => {
            const o = document.createElement('option');
            const p = priceLabel(modelObj(id), resolution);
            o.value = id;
            o.textContent = p ? `${REMIX_LABELS[id]} — ${p}` : REMIX_LABELS[id];
            if (id === modelId) o.selected = true;
            modelField.sel.appendChild(o);
        });
        resField.sel.innerHTML = '';
        spec().resolutions.forEach(r => {
            const o = document.createElement('option');
            o.value = r; o.textContent = r;
            if (r === resolution) o.selected = true;
            resField.sel.appendChild(o);
        });
        extraHost.innerHTML = '';
        (spec().extras || []).forEach(f => {
            const { f: field, sel } = selectField(f.label);
            settings.removeChild(field);
            extraHost.appendChild(field);
            f.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value; o.textContent = opt.label;
                if ((extra[f.key] ?? f.default) === opt.value) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = () => { extra[f.key] = sel.value; };
        });
    }
    modelField.sel.onchange = () => { modelId = modelField.sel.value; applyModel(); };
    resField.sel.onchange = () => { resolution = resField.sel.value; refreshModelSelect(); refreshCost(); };

    function applyModel() {
        resolution = spec().resolutionDefault;
        extra = {};
        picker.setMaxImages(spec().images.max);
        if (imageUrls.length > spec().images.max) { picker.reset(); imageUrls = []; }
        refreshModelSelect();
        paintImageHint();
        paintPrompt();
        paintVideo('');
        refreshCost();
        updateGenerate();
    }

    function selectMode(m) {
        mode = m;
        modelId = modelsForMode(m.id)[0];
        paintModes();
        applyModel();
    }

    // ---- Action row ----
    const actionRow = document.createElement('div');
    actionRow.className = 'flex items-center justify-between gap-4 flex-wrap pt-2 border-t border-white/5';
    const costEl = document.createElement('div');
    costEl.className = 'text-xs font-bold text-secondary';
    const generateBtn = document.createElement('button');
    generateBtn.type = 'button';
    generateBtn.className = 'px-7 py-3 bg-primary text-black font-black text-sm rounded-2xl hover:shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed';
    generateBtn.textContent = 'Generate ✨';
    actionRow.append(costEl, generateBtn);
    card.appendChild(actionRow);

    function refreshCost() {
        const model = modelObj(modelId);
        const credits = video ? estimateCredits(model, { duration: video.duration, resolution }) : null;
        costEl.textContent = credits != null ? `≈ ${credits} cr` : (video ? '' : priceLabel(model, resolution));
    }
    function validation() {
        if (uploading) return 'Uploading the video…';
        if (!video) return 'Add a source video';
        if (imageUrls.length < spec().images.min) return mode.id === 'motion' ? 'Add a reference image' : 'Add a reference image';
        if (spec().promptRequired && !prompt.value.trim()) return 'Describe what should change';
        return '';
    }
    function updateGenerate() {
        const why = validation();
        generateBtn.disabled = Boolean(why);
        generateBtn.title = why;
    }

    // ==========================================
    // Results
    // ==========================================
    const resultsSection = document.createElement('section');
    resultsSection.className = 'hidden flex-col gap-4';
    resultsSection.innerHTML = '<h2 class="text-xl font-black text-white">Remixes</h2>';
    const resultsGrid = document.createElement('div');
    resultsGrid.className = 'grid grid-cols-2 md:grid-cols-3 gap-4';
    resultsSection.appendChild(resultsGrid);
    wrap.appendChild(resultsSection);

    const history = [];
    const queueHistory = createQueueHistory({
        history, storageKey: 'remix_history', limit: 40,
        render: () => {
            resultsSection.classList.toggle('hidden', history.length === 0);
            resultsSection.classList.toggle('flex', history.length > 0);
            renderResultGrid(resultsGrid, history, { prefix: 'remix' });
        },
    });

    const flashBanner = (text, isError = true) => {
        const el = document.createElement('div');
        el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#111] border ${isError ? 'border-red-500/40' : 'border-primary/40'} text-white text-sm px-5 py-3 rounded-2xl shadow-xl`;
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5000);
    };

    generateBtn.onclick = () => {
        if (validation()) return;
        if (!localStorage.getItem('kie_key') && !localStorage.getItem('cf_backend')) { AuthModal(() => generateBtn.click()); return; }

        // Snapshot, then clear the form so the next remix can start right away.
        const snap = {
            model: modelId, resolution, extra: { ...extra }, video, images: imageUrls.slice(),
            prompt: prompt.value.trim(),
        };
        const model = modelObj(modelId);
        const cost = costMeta(model, { duration: snap.video.duration, resolution: snap.resolution });
        const historyMeta = {
            prompt: snap.prompt || (mode.id === 'motion' ? 'Motion transfer' : 'Edit'),
            model: snap.model, modelName: REMIX_LABELS[snap.model], resolution: snap.resolution,
            duration: Math.round(snap.video.duration * 10) / 10, ...cost,
        };
        const tempId = queueHistory.addPending(historyMeta);

        video = null;
        imageUrls = [];
        picker.reset();
        prompt.value = '';
        paintVideo('');
        paintImageHint();
        updateGenerate();
        refreshCost();

        startGenerationJob(
            { studioType: 'remix', historyMeta, maxAttempts: 900, interval: 2000 },
            (queueRequest) => kie.generateRemix({
                model: snap.model, prompt: snap.prompt, video_url: snap.video.url, images: snap.images,
                resolution: snap.resolution, extra: snap.extra,
                ...(cost.credits ? { estimatedCredits: cost.credits } : {}),
                onRequestId: queueRequest,
            }),
            {
                onDone: (res) => {
                    if (!res?.url) { queueHistory.fail(tempId); flashBanner('Remix failed: no video URL returned'); return; }
                    queueHistory.resolve(tempId, { id: res.id || Date.now().toString(), url: res.url, ...historyMeta, timestamp: new Date().toISOString() });
                    flashBanner('Remix ready — see Remixes below or the Library', false);
                },
                onFail: (e) => { queueHistory.fail(tempId); flashBanner(`Remix failed: ${e.message.slice(0, 90)}`); },
            }
        ).catch((e) => { queueHistory.fail(tempId); flashBanner(`Could not start remix: ${e.message.slice(0, 90)}`); });
    };

    // ---- Restore + resume ----
    try { JSON.parse(localStorage.getItem('remix_history') || '[]').forEach(e => history.push(e)); } catch { /* ignore */ }
    (async () => {
        const pending = getPendingJobs('remix');
        const apiKey = localStorage.getItem('kie_key');
        if (pending.length && (apiKey || localStorage.getItem('cf_backend'))) {
            pending.forEach(async (job) => {
                const tempId = queueHistory.addPending({ ...job.historyMeta });
                const attemptsLeft = Math.max(1, job.maxAttempts - Math.floor((Date.now() - job.submittedAt) / job.interval));
                try {
                    const result = await kie.pollForResult(job.requestId, apiKey, attemptsLeft, job.interval);
                    const url = result.outputs?.[0] || result.url || result.output?.url;
                    if (url) queueHistory.resolve(tempId, { id: job.requestId, url, ...job.historyMeta, timestamp: new Date().toISOString() });
                    else queueHistory.fail(tempId);
                } catch { queueHistory.fail(tempId); }
                finally { removePendingJob(job.requestId); }
            });
        }
        queueHistory.persist();
        resultsSection.classList.toggle('hidden', history.length === 0);
        resultsSection.classList.toggle('flex', history.length > 0);
        renderResultGrid(resultsGrid, history, { prefix: 'remix' });
    })();

    paintModes();
    applyModel();
    return container;
}
