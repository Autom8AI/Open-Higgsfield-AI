// Factory: one idea in, a batch of ready-to-post short clips out.
//
//  1. Brief   - topic, platform, style, model, length, number of variations.
//  2. Scenes  - the app writes one distinct scene prompt per variation (editable).
//  3. Batch   - every clip is queued at once through the instant queue; finished
//               clips land in the results grid below and in the Library.
//
// Needs the signed-in backend (scene writing uses the prompt-builder function).
import { kie } from '../lib/kie.js';
import { buildPrompt } from '../lib/api.js';
import { t2vModels } from '../lib/models.js';
import { getVideoSpec } from '../lib/videoSpecs.js';
import { startGenerationJob, getPendingJobs, removePendingJob } from '../lib/pendingJobs.js';
import { loadPricing, priceInfo, priceLabel, sortByPriceDesc } from '../lib/modelSort.js';
import { createQueueHistory, costMeta } from '../lib/studioQueue.js';
import { renderResultGrid } from '../lib/resultCards.js';

const PLATFORMS = [
    { id: 'reels', label: 'Reels / TikTok / Shorts', hint: 'Vertical 9:16', prefer: ['9:16'] },
    { id: 'feed', label: 'Feed post', hint: '4:5 portrait', prefer: ['4:5', '3:4', '1:1'] },
    { id: 'square', label: 'Square', hint: '1:1', prefer: ['1:1'] },
    { id: 'wide', label: 'YouTube / Web', hint: 'Landscape 16:9', prefer: ['16:9'] },
];

const STYLES = [
    { id: 'cinematic', label: 'Cinematic', text: 'cinematic lighting, shallow depth of field, rich colour grade' },
    { id: 'ugc', label: 'UGC / handheld', text: 'authentic handheld phone-camera look, natural light, casual and real' },
    { id: 'product', label: 'Product showcase', text: 'clean studio lighting, crisp product detail, smooth motion' },
    { id: 'bright', label: 'Bright & playful', text: 'bright saturated colours, playful energy, upbeat pacing' },
    { id: 'moody', label: 'Moody', text: 'low-key lighting, deep shadows, atmospheric and dramatic' },
];

// One distinct angle per variation so the batch is not N copies of one idea.
const ANGLES = [
    'Open on a striking visual hook in the first second, then reveal the subject.',
    'Close-up detail shot with slow, deliberate camera movement.',
    'Wide establishing shot with a smooth push-in toward the subject.',
    'Human point of view: someone interacting with the subject, natural reaction.',
    'Before-and-after style reveal with a clear transformation.',
    'Fast, rhythmic montage feel with dynamic motion and a satisfying finish.',
];

const MAX_VARIATIONS = 6;

export function FactoryStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full overflow-y-auto custom-scrollbar bg-app-bg px-4 md:px-10 py-8';

    loadPricing().then(() => { refreshSelects(); refreshTotals(); });

    // --- State ---
    const models = () => sortByPriceDesc(t2vModels);
    let model = models()[0];
    const state = {
        topic: '',
        platform: PLATFORMS[0],
        style: STYLES[0],
        duration: 5,
        resolution: '',
        count: 3,
        drafts: [], // [{ id, angle, prompt, status: 'writing' | 'ready' | 'error' }]
        writing: false,
    };

    const durationsFor = (m) => getVideoSpec(m.id)?.durations || m.durations || [5];
    const resolutionsFor = (m) => m.resolutions || [];
    const pickAspect = () => {
        const available = model.aspects || ['16:9'];
        const wanted = state.platform.prefer.find(a => available.includes(a));
        return { aspect: wanted || available[0], exact: state.platform.prefer[0] === (wanted || available[0]) };
    };
    const syncModelDefaults = () => {
        const d = durationsFor(model);
        if (!d.includes(state.duration)) state.duration = d.includes(5) ? 5 : d[0];
        const r = resolutionsFor(model);
        if (r.length && !r.includes(state.resolution)) state.resolution = model.resolutionDefault && r.includes(model.resolutionDefault) ? model.resolutionDefault : r[0];
        if (!r.length) state.resolution = '';
    };
    syncModelDefaults();

    const cost = () => costMeta(model, { duration: state.duration, resolution: state.resolution });
    const approx = () => (priceInfo(model, state.resolution)?.from ? 'from' : '≈');

    // ==========================================
    // Page header
    // ==========================================
    const head = document.createElement('div');
    head.className = 'max-w-5xl mx-auto mb-8';
    head.innerHTML = `
        <h1 class="text-3xl md:text-5xl font-black tracking-tight text-white mb-2">Factory</h1>
        <p class="text-sm text-secondary">One idea in, a batch of ready-to-post clips out. Each variation gets its own scene, and they all generate at once.</p>
    `;
    container.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className = 'max-w-5xl mx-auto flex flex-col gap-8 pb-24';
    container.appendChild(wrap);

    // ==========================================
    // 1. Brief
    // ==========================================
    const brief = document.createElement('section');
    brief.className = 'bg-[#111]/90 border border-white/10 rounded-3xl p-5 md:p-7 flex flex-col gap-6';
    wrap.appendChild(brief);

    const label = (text) => {
        const l = document.createElement('div');
        l.className = 'text-[10px] font-bold text-secondary uppercase tracking-widest mb-2';
        l.textContent = text;
        return l;
    };

    // Topic
    const topicBlock = document.createElement('div');
    topicBlock.appendChild(label('What are the videos about?'));
    const topicInput = document.createElement('textarea');
    topicInput.rows = 3;
    topicInput.placeholder = 'e.g. A new cold-brew coffee brand launching this summer';
    topicInput.className = 'w-full bg-black/30 border border-white/10 rounded-2xl px-4 py-3 text-base text-white placeholder:text-muted focus:outline-none focus:border-primary/50 resize-none';
    topicInput.oninput = () => { state.topic = topicInput.value; updateActionState(); };
    topicBlock.appendChild(topicInput);
    brief.appendChild(topicBlock);

    // Chip group helper
    const chipGroup = (title, items, getActive, onPick, sub) => {
        const block = document.createElement('div');
        block.appendChild(label(title));
        const row = document.createElement('div');
        row.className = 'flex flex-wrap gap-2';
        const paint = () => {
            row.innerHTML = '';
            items.forEach(it => {
                const b = document.createElement('button');
                b.type = 'button';
                const on = getActive().id === it.id;
                b.className = `px-4 py-2 rounded-xl text-xs font-bold transition-all border ${on ? 'bg-primary text-black border-primary' : 'bg-white/5 text-white/80 border-white/10 hover:border-primary/40'}`;
                b.textContent = it.label;
                if (sub && it[sub]) b.title = it[sub];
                b.onclick = () => { onPick(it); paint(); };
                row.appendChild(b);
            });
        };
        paint();
        block.appendChild(row);
        return { block, paint };
    };

    const aspectNote = document.createElement('div');
    aspectNote.className = 'text-[11px] text-secondary mt-2';
    const platformGroup = chipGroup('Platform', PLATFORMS, () => state.platform, (p) => { state.platform = p; refreshAspectNote(); }, 'hint');
    platformGroup.block.appendChild(aspectNote);
    brief.appendChild(platformGroup.block);
    brief.appendChild(chipGroup('Style', STYLES, () => state.style, (s) => { state.style = s; }).block);

    // Settings row
    const settings = document.createElement('div');
    settings.className = 'grid grid-cols-2 md:grid-cols-4 gap-3';
    brief.appendChild(settings);

    const selectField = (title) => {
        const f = document.createElement('div');
        f.appendChild(label(title));
        const sel = document.createElement('select');
        sel.className = 'w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-primary/50';
        f.appendChild(sel);
        settings.appendChild(f);
        return { f, sel };
    };
    const modelField = selectField('Model');
    modelField.f.className = 'col-span-2';
    const durationField = selectField('Length');
    const resolutionField = selectField('Resolution');

    const countField = document.createElement('div');
    countField.appendChild(label('Variations'));
    const stepper = document.createElement('div');
    stepper.className = 'flex items-center gap-3 bg-black/30 border border-white/10 rounded-xl px-2 py-1.5 w-fit';
    const minus = document.createElement('button');
    const plus = document.createElement('button');
    const countLabel = document.createElement('span');
    [minus, plus].forEach(b => { b.type = 'button'; b.className = 'w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white font-black'; });
    minus.textContent = '−'; plus.textContent = '+';
    countLabel.className = 'w-6 text-center text-sm font-black text-white';
    stepper.append(minus, countLabel, plus);
    countField.appendChild(stepper);
    settings.appendChild(countField);

    function refreshSelects() {
        modelField.sel.innerHTML = '';
        models().forEach(m => {
            const o = document.createElement('option');
            const price = priceLabel(m, state.resolution);
            o.value = m.id;
            o.textContent = price ? `${m.name} — ${price}` : m.name;
            if (m.id === model.id) o.selected = true;
            modelField.sel.appendChild(o);
        });
        durationField.sel.innerHTML = '';
        durationsFor(model).forEach(d => {
            const o = document.createElement('option');
            o.value = d; o.textContent = `${d}s`;
            if (d === state.duration) o.selected = true;
            durationField.sel.appendChild(o);
        });
        const r = resolutionsFor(model);
        resolutionField.f.style.display = r.length ? '' : 'none';
        resolutionField.sel.innerHTML = '';
        r.forEach(x => {
            const o = document.createElement('option');
            o.value = x; o.textContent = x;
            if (x === state.resolution) o.selected = true;
            resolutionField.sel.appendChild(o);
        });
        countLabel.textContent = state.count;
        refreshAspectNote();
    }
    function refreshAspectNote() {
        const { aspect, exact } = pickAspect();
        aspectNote.textContent = exact
            ? `Clips will be ${aspect}.`
            : `${state.platform.hint} isn't supported by ${model.name}; clips will be ${aspect}.`;
    }
    modelField.sel.onchange = () => { model = models().find(m => m.id === modelField.sel.value) || model; syncModelDefaults(); refreshSelects(); refreshTotals(); };
    durationField.sel.onchange = () => { state.duration = Number(durationField.sel.value); refreshSelects(); refreshTotals(); };
    resolutionField.sel.onchange = () => { state.resolution = resolutionField.sel.value; refreshSelects(); refreshTotals(); };
    minus.onclick = () => { state.count = Math.max(1, state.count - 1); refreshSelects(); refreshTotals(); };
    plus.onclick = () => { state.count = Math.min(MAX_VARIATIONS, state.count + 1); refreshSelects(); refreshTotals(); };

    // Action row
    const actionRow = document.createElement('div');
    actionRow.className = 'flex items-center justify-between gap-4 flex-wrap pt-2 border-t border-white/5';
    const totalEl = document.createElement('div');
    totalEl.className = 'text-xs font-bold text-secondary';
    const writeBtn = document.createElement('button');
    writeBtn.type = 'button';
    writeBtn.className = 'px-7 py-3 bg-primary text-black font-black text-sm rounded-2xl hover:shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed';
    writeBtn.textContent = 'Write scenes ✨';
    actionRow.append(totalEl, writeBtn);
    brief.appendChild(actionRow);

    // ==========================================
    // 2. Scenes (review before spending credits)
    // ==========================================
    const scenes = document.createElement('section');
    scenes.className = 'hidden flex-col gap-4';
    wrap.appendChild(scenes);

    // ==========================================
    // 3. Results
    // ==========================================
    const resultsSection = document.createElement('section');
    resultsSection.className = 'hidden flex-col gap-4';
    const resultsTitle = document.createElement('div');
    resultsTitle.className = 'flex items-end justify-between';
    resultsTitle.innerHTML = '<h2 class="text-xl font-black text-white">Batch results</h2>';
    const resultsGrid = document.createElement('div');
    resultsGrid.className = 'grid grid-cols-2 md:grid-cols-3 gap-4';
    resultsSection.append(resultsTitle, resultsGrid);
    wrap.appendChild(resultsSection);

    const batchHistory = [];
    const queueHistory = createQueueHistory({
        history: batchHistory, storageKey: 'factory_history', limit: 60,
        render: () => renderResults(),
    });

    const flashBanner = (text, isError = true) => {
        const el = document.createElement('div');
        el.className = `fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#111] border ${isError ? 'border-red-500/40' : 'border-primary/40'} text-white text-sm px-5 py-3 rounded-2xl shadow-xl`;
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5000);
    };

    function renderResults() {
        resultsSection.classList.toggle('hidden', batchHistory.length === 0);
        resultsSection.classList.toggle('flex', batchHistory.length > 0);
        renderResultGrid(resultsGrid, batchHistory, { prefix: 'factory' });
    }

    // ==========================================
    // Scene writing
    // ==========================================
    const sceneBrief = (draftIdx) => [
        `Topic: ${state.topic.trim()}`,
        `Platform: ${state.platform.label} (${pickAspect().aspect}), a single continuous ${state.duration}-second clip.`,
        `Look: ${state.style.label} - ${state.style.text}.`,
        `This is variation ${draftIdx + 1} of ${state.count}. Angle: ${ANGLES[draftIdx % ANGLES.length]}`,
        'No on-screen text, captions or logos. Describe the scene, subject, camera movement and lighting.',
    ].join('\n');

    function refreshTotals() {
        const c = cost();
        const each = c.credits;
        const n = state.drafts.length || state.count;
        totalEl.textContent = each != null
            ? `${state.count} clip${state.count > 1 ? 's' : ''} · ${approx()} ${Math.round(each * state.count * 10) / 10} cr total`
            : `${state.count} clip${state.count > 1 ? 's' : ''}`;
        renderScenes();
    }
    function updateActionState() {
        writeBtn.disabled = state.writing || !state.topic.trim();
    }

    // Run `fn` over items with limited parallelism.
    const pool = async (items, size, fn) => {
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
            while (next < items.length) { const i = next++; await fn(items[i], i); }
        }));
    };

    async function writeScenes() {
        if (state.writing || !state.topic.trim()) return;
        state.writing = true;
        state.drafts = Array.from({ length: state.count }, (_, i) => ({ id: `d${Date.now()}-${i}`, angle: ANGLES[i % ANGLES.length], prompt: '', status: 'writing' }));
        writeBtn.textContent = 'Writing scenes…';
        updateActionState();
        renderScenes();
        scenes.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

        await pool(state.drafts, 3, async (draft, i) => {
            try {
                draft.prompt = await buildPrompt(sceneBrief(i), 'video');
                draft.status = 'ready';
            } catch (e) {
                // Keep the card usable: the user can type or edit the scene by hand.
                draft.prompt = `${state.topic.trim()}. ${draft.angle} ${state.style.text}.`;
                draft.status = 'error';
                draft.error = e.message;
            }
            renderScenes();
        });

        state.writing = false;
        writeBtn.textContent = 'Rewrite scenes ✨';
        updateActionState();
        renderScenes();
    }
    writeBtn.onclick = writeScenes;

    function renderScenes() {
        const has = state.drafts.length > 0;
        scenes.classList.toggle('hidden', !has);
        scenes.classList.toggle('flex', has);
        scenes.innerHTML = '';
        if (!has) return;

        const bar = document.createElement('div');
        bar.className = 'flex items-end justify-between gap-4 flex-wrap';
        bar.innerHTML = '<div><h2 class="text-xl font-black text-white">Scenes</h2><p class="text-xs text-secondary">Edit any scene, remove ones you do not want, then generate the batch.</p></div>';
        scenes.appendChild(bar);

        state.drafts.forEach((draft, i) => {
            const card = document.createElement('div');
            card.className = 'bg-[#111]/90 border border-white/10 rounded-2xl p-4 flex flex-col gap-2';
            const top = document.createElement('div');
            top.className = 'flex items-center justify-between gap-3';
            const title = document.createElement('span');
            title.className = 'text-[10px] font-bold uppercase tracking-widest text-secondary';
            title.textContent = `Scene ${i + 1} · ${draft.angle.split(',')[0].replace(/\.$/, '')}`;
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-primary transition-colors';
            rm.textContent = 'Remove';
            rm.onclick = () => { state.drafts.splice(i, 1); renderScenes(); };
            top.append(title, rm);
            card.appendChild(top);

            if (draft.status === 'writing') {
                const w = document.createElement('div');
                w.className = 'flex items-center gap-2 text-xs text-secondary py-4';
                w.innerHTML = '<span class="animate-spin text-primary">◌</span> Writing this scene…';
                card.appendChild(w);
            } else {
                const ta = document.createElement('textarea');
                ta.rows = 4;
                ta.value = draft.prompt;
                ta.className = 'w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white leading-relaxed focus:outline-none focus:border-primary/50 resize-y';
                ta.oninput = () => { draft.prompt = ta.value; generateAll.disabled = !canGenerate(); };
                card.appendChild(ta);
                if (draft.status === 'error') {
                    const err = document.createElement('p');
                    err.className = 'text-[10px] text-secondary';
                    err.textContent = `AI scene writing failed (${draft.error}). A starter scene was filled in — edit it before generating.`;
                    card.appendChild(err);
                }
            }
            scenes.appendChild(card);
        });

        const footer = document.createElement('div');
        footer.className = 'flex items-center justify-between gap-4 flex-wrap';
        const c = cost().credits;
        const total = document.createElement('div');
        total.className = 'text-xs font-bold text-secondary';
        total.textContent = c != null
            ? `${state.drafts.length} clip${state.drafts.length === 1 ? '' : 's'} · ${approx()} ${Math.round(c * state.drafts.length * 10) / 10} cr`
            : `${state.drafts.length} clip${state.drafts.length === 1 ? '' : 's'}`;
        generateAll = document.createElement('button');
        generateAll.type = 'button';
        generateAll.className = 'px-7 py-3 bg-primary text-black font-black text-sm rounded-2xl hover:shadow-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed';
        generateAll.textContent = `Generate ${state.drafts.length} clip${state.drafts.length === 1 ? '' : 's'} ✨`;
        generateAll.disabled = !canGenerate();
        generateAll.onclick = runBatch;
        footer.append(total, generateAll);
        scenes.appendChild(footer);
    }
    let generateAll = null;
    const canGenerate = () => state.drafts.length > 0 && state.drafts.every(d => d.status !== 'writing' && d.prompt.trim());

    // ==========================================
    // Batch generation (instant queue)
    // ==========================================
    function runBatch() {
        if (!canGenerate()) return;
        const apiKey = localStorage.getItem('kie_key');
        if (!apiKey && !localStorage.getItem('cf_backend')) { flashBanner('Sign in first.'); return; }

        const { aspect } = pickAspect();
        const c = cost();
        const submitted = state.drafts.slice();
        const snapshot = { model, duration: state.duration, resolution: state.resolution };

        // Clear the scenes right away so a new idea can be started while this batch runs.
        state.drafts = [];
        writeBtn.textContent = 'Write scenes ✨';
        renderScenes();

        submitted.forEach((draft) => {
            const historyMeta = {
                prompt: draft.prompt.trim(), model: snapshot.model.id, modelName: snapshot.model.name,
                aspect_ratio: aspect, duration: snapshot.duration, ...c,
            };
            const tempId = queueHistory.addPending(historyMeta);
            startGenerationJob(
                { studioType: 'factory', historyMeta, maxAttempts: 900, interval: 2000 },
                (queueRequest) => kie.generateVideo({
                    model: snapshot.model.id,
                    prompt: historyMeta.prompt,
                    aspect_ratio: aspect,
                    duration: snapshot.duration,
                    ...(snapshot.resolution ? { resolution: snapshot.resolution } : {}),
                    advanced: {},
                    ...(c.credits ? { estimatedCredits: c.credits } : {}),
                    onRequestId: queueRequest,
                }),
                {
                    onDone: (res) => {
                        if (!res?.url) { queueHistory.fail(tempId); flashBanner('A clip failed: no video URL returned'); return; }
                        queueHistory.resolve(tempId, { id: res.id || Date.now().toString(), url: res.url, ...historyMeta, timestamp: new Date().toISOString() });
                    },
                    onFail: (e) => { queueHistory.fail(tempId); flashBanner(`A clip failed: ${e.message.slice(0, 80)}`); },
                }
            ).catch((e) => { queueHistory.fail(tempId); flashBanner(`Could not start a clip: ${e.message.slice(0, 80)}`); });
        });
        flashBanner(`${submitted.length} clip${submitted.length === 1 ? '' : 's'} queued — they also appear in the Library`, false);
        resultsSection.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }

    // ==========================================
    // Restore history + resume running jobs
    // ==========================================
    try {
        JSON.parse(localStorage.getItem('factory_history') || '[]').forEach(e => batchHistory.push(e));
    } catch { /* ignore */ }

    (async () => {
        const pending = getPendingJobs('factory');
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
        renderResults();
    })();

    refreshSelects();
    refreshTotals();
    updateActionState();
    return container;
}
