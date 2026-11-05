import { kie } from '../lib/kie.js';
import { t2vModels, getAspectRatiosForVideoModel, getDurationsForModel, getResolutionsForVideoModel, i2vModels, getAspectRatiosForI2VModel, getDurationsForI2VModel, getResolutionsForI2VModel, v2vModels, getModesForModel } from '../lib/models.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';
import { savePendingJob, removePendingJob, getPendingJobs, startGenerationJob } from '../lib/pendingJobs.js';
import { sortByPriceDesc, loadPricing, modelPrice } from '../lib/modelSort.js';
import { advancedFieldsFor } from '../lib/videoSpecs.js';

export function VideoStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-y-auto custom-scrollbar overflow-x-hidden';

    // --- State ---
    loadPricing();
    const defaultModel = t2vModels[0];
    let selectedModel = defaultModel.id;
    let selectedModelName = defaultModel.name;
    let selectedAr = defaultModel.inputs?.aspect_ratio?.default || '16:9';
    let selectedDuration = defaultModel.inputs?.duration?.default || 5;
    let selectedResolution = defaultModel.inputs?.resolution?.default || '';
    let selectedQuality = defaultModel.inputs?.quality?.default || '';
    let selectedMode = '';
    let lastGenerationId = null;
    let lastGenerationModel = null;
    let dropdownOpen = null;
    let uploadedImageUrl = null;
    let imageMode = false; // false = t2v models, true = i2v models
    let v2vMode = false;   // true = video-to-video tools mode
    let uploadedVideoUrl = null;
    let advancedOpen = false;
    let advancedValues = {}; // per-model values for the Advanced panel, reset on model change
    let jobsInFlight = 0;

    const getCurrentModels = () => v2vMode ? v2vModels : (imageMode ? i2vModels : t2vModels);
    const getCurrentAspectRatios = (id) => imageMode ? getAspectRatiosForI2VModel(id) : getAspectRatiosForVideoModel(id);
    const getCurrentDurations = (id) => imageMode ? getDurationsForI2VModel(id) : getDurationsForModel(id);
    const getCurrentResolutions = (id) => imageMode ? getResolutionsForI2VModel(id) : getResolutionsForVideoModel(id);
    const getCurrentModes = (id) => getModesForModel(id);
    const getCurrentModel = () => getCurrentModels().find(m => m.id === selectedModel);
    const getQualitiesForModel = (id) => {
        const model = getCurrentModels().find(m => m.id === id);
        return model?.inputs?.quality?.enum || [];
    };

    // ==========================================
    // 1. HERO SECTION
    // ==========================================
    const hero = document.createElement('div');
    hero.className = 'flex flex-col items-center mb-10 md:mb-20 animate-fade-in-up transition-all duration-700';
    hero.innerHTML = `
        <div class="mb-10 relative group">
             <div class="absolute inset-0 bg-primary/20 blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000"></div>
             <div class="relative w-24 h-24 md:w-32 md:h-32 bg-teal-900/40 rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" class="text-primary opacity-20 absolute -right-4 -bottom-4">
                    <polygon points="23 7 16 12 23 17 23 7"/>
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                </svg>
                <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-glow relative z-10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-primary">
                        <polygon points="23 7 16 12 23 17 23 7"/>
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                    </svg>
                </div>
                <div class="absolute top-4 right-4 text-primary animate-pulse">✨</div>
             </div>
        </div>
        <h1 class="text-2xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-4 selection:bg-primary selection:text-black text-center px-4">Video Studio</h1>
        <p class="text-secondary text-sm font-medium tracking-wide opacity-60">Animate images into stunning AI videos with motion effects</p>
    `;
    container.appendChild(hero);

    // ==========================================
    // 2. PROMPT BAR
    // ==========================================
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 animate-fade-in-up';
    promptWrapper.style.animationDelay = '0.2s';

    const bar = document.createElement('div');
    bar.className = 'w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-3 md:p-5 flex flex-col gap-3 md:gap-5 shadow-3xl';

    const topRow = document.createElement('div');
    topRow.className = 'flex items-start gap-5 px-2';

    // --- Image Upload Picker (Image-to-Video) ---
    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url }) => {
            uploadedImageUrl = url;
            // Clear video mode if active
            if (v2vMode) {
                uploadedVideoUrl = null;
                v2vMode = false;
                showVideoIcon();
            }
            if (!imageMode) {
                imageMode = true;
                const keep = i2vModels.find(m => m.id === selectedModel);
                const next = keep || i2vModels[0];
                if (next) {
                    selectedModel = next.id;
                    selectedModelName = next.name;
                    document.getElementById('v-model-btn-label').textContent = selectedModelName;
                }
                updateControlsForModel(selectedModel, !!keep);
            } else {
                renderAdvanced();
            }
            textarea.placeholder = 'Describe the motion or what happens in the video';
            textarea.disabled = false;
        },
        onClear: () => {
            uploadedImageUrl = null;
            imageMode = false;
            const keep = t2vModels.find(m => m.id === selectedModel);
            const next = keep || t2vModels[0];
            selectedModel = next.id;
            selectedModelName = next.name;
            document.getElementById('v-model-btn-label').textContent = selectedModelName;
            updateControlsForModel(selectedModel, !!keep);
            textarea.placeholder = 'Describe the video you want to create';
            textarea.disabled = false;
        }
    });
    topRow.appendChild(picker.trigger);
    container.appendChild(picker.panel);

    // --- Video Upload Picker (Video-to-Video) ---
    const videoFileInput = document.createElement('input');
    videoFileInput.type = 'file';
    videoFileInput.accept = 'video/*';
    videoFileInput.className = 'hidden';

    const videoPickerBtn = document.createElement('button');
    videoPickerBtn.type = 'button';
    videoPickerBtn.title = 'Upload video to remove watermark';
    videoPickerBtn.className = 'w-10 h-10 shrink-0 rounded-xl border transition-all flex items-center justify-center relative overflow-hidden mt-1.5 bg-white/5 border-white/10 hover:bg-white/10 hover:border-primary/40 group';

    const videoIconEl = document.createElement('div');
    videoIconEl.className = 'flex items-center justify-center w-full h-full';
    videoIconEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-muted group-hover:text-primary transition-colors"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

    const videoSpinnerEl = document.createElement('div');
    videoSpinnerEl.className = 'hidden items-center justify-center w-full h-full';
    videoSpinnerEl.innerHTML = `<span class="animate-spin text-primary text-sm">◌</span>`;

    const videoReadyEl = document.createElement('div');
    videoReadyEl.className = 'hidden items-center justify-center w-full h-full';
    videoReadyEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-primary"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/><polyline points="7 10 10 13 15 8" stroke="#ff2d2d" stroke-width="2.5"/></svg>`;

    videoPickerBtn.appendChild(videoFileInput);
    videoPickerBtn.appendChild(videoIconEl);
    videoPickerBtn.appendChild(videoSpinnerEl);
    videoPickerBtn.appendChild(videoReadyEl);

    const showVideoIcon = () => {
        videoIconEl.classList.replace('hidden', 'flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
        videoPickerBtn.classList.remove('border-primary/60');
        videoPickerBtn.classList.add('border-white/10');
        videoPickerBtn.title = 'Upload video to remove watermark';
    };

    const showVideoSpinner = () => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.replace('hidden', 'flex');
        videoReadyEl.classList.add('hidden'); videoReadyEl.classList.remove('flex');
    };

    const showVideoReady = (filename) => {
        videoIconEl.classList.add('hidden'); videoIconEl.classList.remove('flex');
        videoSpinnerEl.classList.add('hidden'); videoSpinnerEl.classList.remove('flex');
        videoReadyEl.classList.replace('hidden', 'flex');
        videoPickerBtn.classList.remove('border-white/10');
        videoPickerBtn.classList.add('border-primary/60');
        videoPickerBtn.title = `${filename} — click to clear`;
    };

    const clearVideoUpload = () => {
        uploadedVideoUrl = null;
        v2vMode = false;
        showVideoIcon();
        selectedModel = t2vModels[0].id;
        selectedModelName = t2vModels[0].name;
        document.getElementById('v-model-btn-label').textContent = selectedModelName;
        updateControlsForModel(selectedModel);
        textarea.placeholder = 'Describe the video you want to create';
        textarea.disabled = false;
    };

    videoPickerBtn.onclick = (e) => {
        e.stopPropagation();
        if (uploadedVideoUrl) {
            clearVideoUpload();
        } else {
            videoFileInput.click();
        }
    };

    videoFileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const apiKey = localStorage.getItem('kie_key');
        const cfLogged = !!localStorage.getItem('cf_backend');
        if (!apiKey && !cfLogged) {
            AuthModal(() => videoFileInput.click());
            return;
        }

        showVideoSpinner();
        try {
            const url = await kie.uploadFile(file);
            uploadedVideoUrl = url;
            showVideoReady(file.name);

            // Switch to v2v mode
            if (imageMode) {
                picker.reset();
                uploadedImageUrl = null;
                imageMode = false;
            }
            if (!v2vModels.length) {
                showVideoIcon();
                alert('Video-to-video is not available yet — no v2v models are in the registry.');
                return;
            }
            v2vMode = true;
            selectedModel = v2vModels[0].id;
            selectedModelName = v2vModels[0].name;
            document.getElementById('v-model-btn-label').textContent = selectedModelName;
            updateControlsForModel(selectedModel);
            textarea.placeholder = 'Video ready — click Generate to remove watermark';
            textarea.disabled = true;
        } catch (err) {
            console.error('[VideoStudio] Video upload failed:', err);
            showVideoIcon();
            alert(`Video upload failed: ${err.message}`);
        }
        videoFileInput.value = '';
    };

    // Video-to-video tools are not available on the current backend; hide the button until they are.
    if (v2vModels.length > 0) topRow.appendChild(videoPickerBtn);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Describe the video you want to create';
    textarea.className = 'flex-1 bg-transparent border-none text-white text-base md:text-xl placeholder:text-muted focus:outline-none resize-none pt-2.5 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        const maxHeight = window.innerWidth < 768 ? 150 : 250;
        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    };

    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    // Extend mode banner (shown when extend model is active, not editable by user)
    const extendBanner = document.createElement('div');
    extendBanner.className = 'hidden items-center gap-2 px-4 py-2 mx-2 mt-2 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary';
    extendBanner.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        <span>Extending previous Seedance 2.0 generation — add an optional prompt to guide the continuation</span>
    `;
    bar.appendChild(extendBanner);

    // Bottom Row: Controls
    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-2 pt-4 border-t border-white/5';

    const controlsLeft = document.createElement('div');
    controlsLeft.className = 'flex items-center gap-1.5 md:gap-2.5 relative overflow-x-auto no-scrollbar pb-1 md:pb-0';

    const createControlBtn = (icon, label, id, tooltip) => {
        const btn = document.createElement('button');
        btn.id = id;
        btn.className = 'flex items-center gap-1.5 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap';
        if (tooltip) btn.setAttribute('data-tooltip', tooltip);
        btn.innerHTML = `
            ${icon}
            <span id="${id}-label" class="text-xs font-bold text-white group-hover:text-primary transition-colors">${label}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" class="opacity-20 group-hover:opacity-100 transition-opacity"><path d="M6 9l6 6 6-6"/></svg>
        `;
        return btn;
    };

    const modelBtn = createControlBtn(`
        <div class="w-5 h-5 bg-primary rounded-md flex items-center justify-center shadow-lg shadow-primary/20">
            <span class="text-[10px] font-black text-black">V</span>
        </div>
    `, selectedModelName, 'v-model-btn', 'Select AI video model');

    const arBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
    `, selectedAr, 'v-ar-btn', 'Change aspect ratio');

    const durationBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    `, `${selectedDuration}s`, 'v-duration-btn', 'Set video duration');

    const resolutionBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>
    `, selectedResolution || '720p', 'v-resolution-btn', 'Set output resolution');

    const qualityBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
    `, selectedQuality || 'basic', 'v-quality-btn', 'Set output quality');

    const modeBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    `, selectedMode || 'normal', 'v-mode-btn');

    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(durationBtn);
    controlsLeft.appendChild(resolutionBtn);
    controlsLeft.appendChild(qualityBtn);
    
    // Advanced options toggle button
    const advancedBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 001.82-.33 1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-1.82.33A1.65 1.65 0 0019.4 9a1.65 1.65 0 00-1.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    `, 'Advanced', 'v-advanced-btn', 'Show advanced options');
    controlsLeft.appendChild(advancedBtn);

    // Initial visibility (t2v mode)
    const initDurations = getDurationsForModel(defaultModel.id);
    durationBtn.style.display = initDurations.length > 0 ? 'flex' : 'none';
    const initResolutions = getResolutionsForVideoModel(defaultModel.id);
    resolutionBtn.style.display = initResolutions.length > 0 ? 'flex' : 'none';
    qualityBtn.style.display = 'none';
    modeBtn.style.display = getModesForModel(defaultModel.id).length > 0 ? 'flex' : 'none';

    const generateBtn = document.createElement('button');
    let submitting = false;
    generateBtn.className = 'bg-primary text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-glow hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2.5 w-full sm:w-auto shadow-lg';
    generateBtn.setAttribute('data-tooltip', 'Generate AI video from prompt');
    generateBtn.innerHTML = `Generate ✨`;

    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateBtn);
    bar.appendChild(bottomRow);

    // ==========================================
    // 2b. ADVANCED PANEL
    // ==========================================
    const advancedPanel = document.createElement('div');
    advancedPanel.id = 'v-advanced-panel';
    advancedPanel.className = 'hidden flex-col gap-3 px-2 pt-4 border-t border-white/5';
    bar.appendChild(advancedPanel);

    const setAdvancedOpen = (open) => {
        advancedOpen = open;
        advancedPanel.classList.toggle('hidden', !open);
        advancedPanel.classList.toggle('flex', open);
        advancedBtn.classList.toggle('border-primary/40', open);
        advancedBtn.classList.toggle('bg-white/10', open);
        advancedBtn.setAttribute('data-tooltip', open ? 'Hide advanced options' : 'Show advanced options');
        const chev = advancedBtn.querySelector('svg:last-child');
        if (chev) chev.style.transform = open ? 'rotate(180deg)' : '';
    };

    const advancedValue = (f) => (advancedValues[f.key] !== undefined ? advancedValues[f.key] : f.default);

    function renderAdvanced() {
        const fields = v2vMode ? [] : advancedFieldsFor(selectedModel, imageMode);
        advancedBtn.style.display = fields.length ? 'flex' : 'none';
        if (!fields.length) { setAdvancedOpen(false); advancedPanel.innerHTML = ''; return; }

        advancedPanel.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-2.5';

        fields.forEach(f => {
            const row = document.createElement('div');
            const isToggle = f.type === 'toggle';
            row.className = `bg-white/5 border border-white/5 rounded-2xl px-4 py-3 ${isToggle ? 'flex items-center justify-between gap-4' : 'flex flex-col gap-2'} ${f.type === 'text' ? 'sm:col-span-2' : ''}`;
            const head = document.createElement('div');
            head.className = isToggle ? 'flex flex-col gap-0.5 min-w-0 flex-1' : 'flex items-center justify-between gap-3';
            const title = document.createElement('span');
            title.className = 'text-xs font-bold text-white';
            title.textContent = f.label;
            head.appendChild(title);
            if (isToggle && f.hint) {
                const hint = document.createElement('span');
                hint.className = 'text-[10px] text-secondary opacity-70 leading-snug';
                hint.textContent = f.hint;
                head.appendChild(hint);
            }
            row.appendChild(head);

            if (f.type === 'toggle') {
                const sw = document.createElement('button');
                sw.type = 'button';
                const paint = () => {
                    const on = !!advancedValue(f);
                    sw.className = `relative w-10 h-6 shrink-0 rounded-full transition-colors ${on ? 'bg-primary' : 'bg-white/15'}`;
                    sw.innerHTML = `<span class="absolute top-1 ${on ? 'left-5' : 'left-1'} w-4 h-4 rounded-full bg-white transition-all"></span>`;
                    sw.setAttribute('aria-pressed', on ? 'true' : 'false');
                };
                sw.onclick = (e) => { e.preventDefault(); e.stopPropagation(); advancedValues[f.key] = !advancedValue(f); paint(); };
                paint();
                row.appendChild(sw);
            } else if (f.type === 'select') {
                const wrap = document.createElement('div');
                wrap.className = 'flex flex-wrap gap-1.5';
                const paint = () => {
                    wrap.innerHTML = '';
                    f.options.forEach(opt => {
                        const b = document.createElement('button');
                        b.type = 'button';
                        const on = advancedValue(f) === opt;
                        b.className = `px-3 py-1.5 rounded-xl text-[11px] font-bold capitalize transition-all border ${on ? 'bg-primary text-black border-primary' : 'bg-white/5 text-white/80 border-white/10 hover:border-primary/40'}`;
                        b.textContent = opt;
                        b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); advancedValues[f.key] = opt; paint(); };
                        wrap.appendChild(b);
                    });
                };
                paint();
                row.appendChild(wrap);
            } else {
                const input = document.createElement(f.type === 'text' ? 'textarea' : 'input');
                if (f.type === 'number') { input.type = 'number'; input.step = '1'; input.min = '0'; input.placeholder = 'Random'; }
                else { input.rows = 2; input.placeholder = f.hint || ''; if (f.max) input.maxLength = f.max; }
                input.className = 'w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-muted focus:outline-none focus:border-primary/50 resize-none';
                input.value = advancedValue(f) ?? '';
                input.onclick = (e) => e.stopPropagation();
                input.oninput = () => { advancedValues[f.key] = input.value; };
                row.appendChild(input);
                if (f.type === 'number') {
                    const dice = document.createElement('button');
                    dice.type = 'button';
                    dice.className = 'text-[10px] font-bold text-secondary hover:text-primary transition-colors';
                    dice.textContent = '🎲 Random';
                    dice.onclick = (e) => {
                        e.preventDefault(); e.stopPropagation();
                        input.value = String(Math.floor(Math.random() * 2147483647));
                        advancedValues[f.key] = input.value;
                    };
                    head.appendChild(dice);
                }
            }

            if (f.hint && f.type !== 'text' && !isToggle) {
                const hint = document.createElement('span');
                hint.className = 'text-[10px] text-secondary opacity-70 leading-snug';
                hint.textContent = f.hint;
                row.appendChild(hint);
            }
            grid.appendChild(row);
        });

        advancedPanel.appendChild(grid);

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'self-end text-[10px] font-bold uppercase tracking-widest text-secondary hover:text-primary transition-colors';
        reset.textContent = 'Reset to defaults';
        reset.onclick = (e) => { e.preventDefault(); e.stopPropagation(); advancedValues = {}; renderAdvanced(); };
        advancedPanel.appendChild(reset);
    }

    advancedPanel.onclick = (e) => e.stopPropagation();
    advancedBtn.onclick = (e) => {
        e.stopPropagation();
        closeDropdown();
        setAdvancedOpen(!advancedOpen);
    };
    renderAdvanced();
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    // ==========================================
    // 3. DROPDOWNS
    // ==========================================
    const dropdown = document.createElement('div');
    dropdown.className = 'absolute bottom-[102%] left-2 z-50 transition-all opacity-0 pointer-events-none scale-95 origin-bottom-left glass rounded-3xl p-3 translate-y-2 w-[calc(100vw-3rem)] max-w-xs shadow-4xl border border-white/10 flex flex-col';

    // keepSettings=true keeps the current AR/duration/resolution when the new model supports them.
    const updateControlsForModel = (modelId, keepSettings = false) => {
        const model = getCurrentModels().find(m => m.id === modelId);
        if (!keepSettings) advancedValues = {};
        renderAdvanced();

        // In v2v mode, hide all parameter controls — no prompt/AR/duration/etc needed
        if (v2vMode) {
            arBtn.style.display = 'none';
            durationBtn.style.display = 'none';
            resolutionBtn.style.display = 'none';
            qualityBtn.style.display = 'none';
            modeBtn.style.display = 'none';
            extendBanner.classList.add('hidden');
            extendBanner.classList.remove('flex');
            return;
        }

        // Aspect ratio
        const availableArs = getCurrentAspectRatios(modelId);
        if (availableArs.length > 0) {
            if (!(keepSettings && availableArs.includes(selectedAr))) {
                selectedAr = availableArs.includes(model?.inputs?.aspect_ratio?.default) ? model.inputs.aspect_ratio.default
                    : (availableArs.includes('16:9') ? '16:9' : availableArs[0]);
            }
            document.getElementById('v-ar-btn-label').textContent = selectedAr;
            arBtn.style.display = 'flex';
        } else {
            arBtn.style.display = 'none';
        }

        // Duration
        const durations = getCurrentDurations(modelId);
        if (durations.length > 0) {
            if (!(keepSettings && durations.includes(selectedDuration))) {
                const d = model?.inputs?.duration?.default;
                selectedDuration = durations.includes(d) ? d : durations[0];
            }
            document.getElementById('v-duration-btn-label').textContent = `${selectedDuration}s`;
            durationBtn.style.display = 'flex';
        } else {
            durationBtn.style.display = 'none';
        }

        // Resolution
        const resolutions = getCurrentResolutions(modelId);
        if (resolutions.length > 0) {
            if (!(keepSettings && resolutions.includes(selectedResolution))) {
                const r = model?.inputs?.resolution?.default;
                selectedResolution = resolutions.includes(r) ? r : resolutions[0];
            }
            document.getElementById('v-resolution-btn-label').textContent = selectedResolution;
            resolutionBtn.style.display = 'flex';
        } else {
            resolutionBtn.style.display = 'none';
        }

        // Quality
        const qualities = getQualitiesForModel(modelId);
        if (qualities.length > 0) {
            selectedQuality = model?.inputs?.quality?.default || qualities[0];
            document.getElementById('v-quality-btn-label').textContent = selectedQuality;
            qualityBtn.style.display = 'flex';
        } else {
            selectedQuality = '';
            qualityBtn.style.display = 'none';
        }

        // Mode
        const modes = getCurrentModes(modelId);
        if (modes.length > 0) {
            selectedMode = model?.inputs?.mode?.default || modes[0];
            document.getElementById('v-mode-btn-label').textContent = selectedMode;
            modeBtn.style.display = 'flex';
        } else {
            selectedMode = '';
            modeBtn.style.display = 'none';
        }

        // Extend banner (extend model only)
        if (model?.requiresRequestId) {
            extendBanner.classList.remove('hidden');
            extendBanner.classList.add('flex');
        } else {
            extendBanner.classList.add('hidden');
            extendBanner.classList.remove('flex');
        }
    };

    const showDropdown = (type, anchorBtn) => {
        dropdown.innerHTML = '';
        dropdown.classList.remove('opacity-0', 'pointer-events-none');
        dropdown.classList.add('opacity-100', 'pointer-events-auto');

        if (type === 'model') {
            dropdown.classList.add('w-[calc(100vw-3rem)]', 'max-w-xs');
            dropdown.classList.remove('max-w-[240px]', 'max-w-[200px]');
            dropdown.innerHTML = `
                <div class="flex flex-col h-full max-h-[70vh]">
                    <div class="px-2 pb-3 mb-2 border-b border-white/5 shrink-0">
                        <div class="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5 border border-white/5 focus-within:border-primary/50 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-muted"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                            <input type="text" id="v-model-search" placeholder="Search models..." class="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0">
                        </div>
                    </div>
                    <div class="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 shrink-0">Video models</div>
                    <div id="v-model-list-container" class="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2"></div>
                </div>
            `;
            const list = dropdown.querySelector('#v-model-list-container');

            const makeModelItem = (m, isV2V = false) => {
                const item = document.createElement('div');
                item.className = `flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 ${selectedModel === m.id ? 'bg-white/5 border-white/5' : ''}`;
                const iconColor = isV2V ? 'bg-orange-500/10 text-orange-400' : m.id.includes('kling') ? 'bg-blue-500/10 text-blue-400' : m.id.includes('veo') ? 'bg-purple-500/10 text-purple-400' : m.id.includes('sora') ? 'bg-rose-500/10 text-rose-400' : 'bg-primary/10 text-primary';
                item.innerHTML = `
                    <div class="flex items-center gap-3.5">
                         <div class="w-10 h-10 ${iconColor} border border-white/5 rounded-xl flex items-center justify-center font-black text-sm shadow-inner uppercase">${m.name.charAt(0)}</div>
                         <div class="flex flex-col gap-0.5">
                            <span class="text-xs font-bold text-white tracking-tight">${m.name}</span>
                            ${isV2V ? '<span class="text-[9px] text-orange-400/70">Upload a video to use</span>' : ''}
                         </div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${modelPrice(m) != null ? `<span class="text-[10px] font-bold text-muted">${modelPrice(m)} cr</span>` : ''}
                        ${selectedModel === m.id ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                    </div>
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (isV2V) {
                        // Switch to v2v mode
                        v2vMode = true;
                        imageMode = false;
                        picker.reset();
                        uploadedImageUrl = null;
                        selectedModel = m.id;
                        selectedModelName = m.name;
                        document.getElementById('v-model-btn-label').textContent = selectedModelName;
                        updateControlsForModel(selectedModel);
                        textarea.placeholder = 'Upload a video using the 🎥 button, then click Generate';
                        textarea.disabled = true;
                    } else {
                        // Leaving v2v mode if was in it
                        if (v2vMode) {
                            v2vMode = false;
                            uploadedVideoUrl = null;
                            showVideoIcon();
                            textarea.disabled = false;
                        }
                        selectedModel = m.id;
                        selectedModelName = m.name;
                        document.getElementById('v-model-btn-label').textContent = selectedModelName;
                        updateControlsForModel(selectedModel);
                        textarea.placeholder = imageMode ? 'Describe the motion or effect (optional)' : 'Describe the video you want to create';
                    }
                    closeDropdown();
                };
                return item;
            };

            const renderModels = (filter = '') => {
                list.innerHTML = '';
                const lf = filter.toLowerCase();

                // Regular generation models (always t2v or i2v, never v2v)
                const generationModels = imageMode ? i2vModels : t2vModels;
                const filteredMain = sortByPriceDesc(generationModels)
                    .filter(m => m.name.toLowerCase().includes(lf) || m.id.toLowerCase().includes(lf));
                filteredMain.forEach(m => list.appendChild(makeModelItem(m, false)));

                // Video Tools section
                const filteredV2V = sortByPriceDesc(v2vModels).filter(m => m.name.toLowerCase().includes(lf) || m.id.toLowerCase().includes(lf));
                if (filteredV2V.length > 0) {
                    const sectionLabel = document.createElement('div');
                    sectionLabel.className = 'text-[10px] font-bold text-orange-400/70 uppercase tracking-widest px-3 py-2 mt-1 border-t border-white/5';
                    sectionLabel.textContent = 'Video Tools';
                    list.appendChild(sectionLabel);
                    filteredV2V.forEach(m => list.appendChild(makeModelItem(m, true)));
                }
            };

            renderModels();
            const searchInput = dropdown.querySelector('#v-model-search');
            searchInput.onclick = (e) => e.stopPropagation();
            searchInput.oninput = (e) => renderModels(e.target.value);

        } else if (type === 'ar') {
            dropdown.classList.add('max-w-[240px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-muted uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Aspect Ratio</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            const availableArs = getCurrentAspectRatios(selectedModel);
            availableArs.forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <div class="flex items-center gap-4">
                        <div class="w-6 h-6 border-2 border-white/20 rounded-md shadow-inner flex items-center justify-center group-hover:border-primary/50 transition-colors">
                             <div class="w-3 h-3 bg-white/10 rounded-sm"></div>
                        </div>
                        <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100 transition-opacity">${r}</span>
                    </div>
                     ${selectedAr === r ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedAr = r;
                    document.getElementById('v-ar-btn-label').textContent = r;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'duration') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Duration</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            const durations = getCurrentDurations(selectedModel);
            durations.forEach(d => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100">${d}s</span>
                     ${selectedDuration === d ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedDuration = d;
                    document.getElementById('v-duration-btn-label').textContent = `${d}s`;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'quality') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Quality</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            getQualitiesForModel(selectedModel).forEach(q => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100 capitalize">${q}</span>
                    ${selectedQuality === q ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedQuality = q;
                    document.getElementById('v-quality-btn-label').textContent = q;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'resolution') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Resolution</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            const resolutions = getCurrentResolutions(selectedModel);
            resolutions.forEach(r => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100">${r}</span>
                     ${selectedResolution === r ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedResolution = r;
                    document.getElementById('v-resolution-btn-label').textContent = r;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);

        } else if (type === 'mode') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Mode</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            getCurrentModes(selectedModel).forEach(m => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100 capitalize">${m}</span>
                    ${selectedMode === m ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedMode = m;
                    document.getElementById('v-mode-btn-label').textContent = m;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        }

        // Position dropdown
        const btnRect = anchorBtn.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        if (window.innerWidth < 768) {
            dropdown.style.left = '50%';
            dropdown.style.transform = 'translateX(-50%) translate(0, 8px)';
        } else {
            dropdown.style.left = `${btnRect.left - containerRect.left}px`;
            dropdown.style.transform = 'translate(0, 8px)';
        }
        dropdown.style.bottom = `${containerRect.bottom - btnRect.top + 8}px`;
    };

    const closeDropdown = () => {
        dropdown.classList.add('opacity-0', 'pointer-events-none');
        dropdown.classList.remove('opacity-100', 'pointer-events-auto');
        dropdownOpen = null;
    };

    const toggleDropdown = (type, btn) => (e) => {
        e.stopPropagation();
        if (dropdownOpen === type) closeDropdown();
        else { dropdownOpen = type; showDropdown(type, btn); }
    };

    modelBtn.onclick = toggleDropdown('model', modelBtn);
    arBtn.onclick = toggleDropdown('ar', arBtn);
    durationBtn.onclick = toggleDropdown('duration', durationBtn);
    resolutionBtn.onclick = toggleDropdown('resolution', resolutionBtn);
    qualityBtn.onclick = toggleDropdown('quality', qualityBtn);
    modeBtn.onclick = toggleDropdown('mode', modeBtn);

    window.addEventListener('click', closeDropdown);
    container.appendChild(dropdown);

    // ==========================================
    // 4. CANVAS AREA + HISTORY
    // ==========================================
    const generationHistory = [];

    const historySidebar = document.createElement('div');
    historySidebar.className = 'fixed right-0 top-0 h-full w-20 md:w-24 bg-black/60 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col items-center py-4 gap-3 overflow-y-auto transition-all duration-500 translate-x-full opacity-0';
    historySidebar.id = 'video-history-sidebar';

    const historyLabel = document.createElement('div');
    historyLabel.className = 'text-[9px] font-bold text-muted uppercase tracking-widest mb-2';
    historyLabel.textContent = 'History';
    historySidebar.appendChild(historyLabel);

    const historyList = document.createElement('div');
    historyList.className = 'flex flex-col gap-2 w-full px-2';
    historySidebar.appendChild(historyList);
    container.appendChild(historySidebar);

    // Main canvas
    const canvas = document.createElement('div');
    canvas.className = 'absolute inset-0 flex flex-col items-center justify-center p-4 min-[800px]:p-16 z-10 opacity-0 pointer-events-none transition-all duration-1000 translate-y-10 scale-95';

    const videoContainer = document.createElement('div');
    videoContainer.className = 'relative group';

    const resultVideo = document.createElement('video');
    resultVideo.className = 'max-h-[60vh] max-w-[80vw] rounded-3xl shadow-3xl border border-white/10 interactive-glow object-contain';
    resultVideo.controls = true;
    resultVideo.loop = true;
    resultVideo.autoplay = true;
    resultVideo.muted = true;
    resultVideo.playsInline = true;
    videoContainer.appendChild(resultVideo);

    // Canvas Controls
    const canvasControls = document.createElement('div');
    canvasControls.className = 'mt-6 flex gap-3 opacity-0 transition-opacity delay-500 duration-500 justify-center';

    const regenerateBtn = document.createElement('button');
    regenerateBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    regenerateBtn.textContent = '↻ Regenerate';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'bg-primary text-black px-6 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-glow active:scale-95';
    downloadBtn.textContent = '↓ Download';

    const extendBtn = document.createElement('button');
    extendBtn.className = 'hidden bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-primary/30 text-primary backdrop-blur-lg';
    extendBtn.textContent = '↗ Extend';
    extendBtn.title = 'Extend this video using Seedance 2.0 Extend';

    const newPromptBtn = document.createElement('button');
    newPromptBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    newPromptBtn.textContent = '+ New';

    canvasControls.appendChild(regenerateBtn);
    canvasControls.appendChild(extendBtn);
    canvasControls.appendChild(downloadBtn);
    canvasControls.appendChild(newPromptBtn);

    canvas.appendChild(videoContainer);
    canvas.appendChild(canvasControls);
    container.appendChild(canvas);

    // --- Helper: Show video in canvas ---
    const showVideoInCanvas = (videoUrl, genModel) => {
        hero.classList.add('hidden');
        promptWrapper.classList.add('hidden');

        // Show extend button only for seedance-v2.0-t2v and i2v (not extend itself)
        const isSeedance2 = genModel && (genModel === 'seedance-v2.0-t2v' || genModel === 'seedance-v2.0-i2v');
        extendBtn.classList.toggle('hidden', !isSeedance2);

        resultVideo.src = videoUrl;
        resultVideo.onloadeddata = () => {
            canvas.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
            canvas.classList.add('opacity-100', 'translate-y-0', 'scale-100');
            canvasControls.classList.remove('opacity-0');
            canvasControls.classList.add('opacity-100');
        };
    };

    // --- Helper: Short error banner (used by background jobs) ---
    const flashBanner = (text) => {
        const el = document.createElement('div');
        el.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#111] border border-red-500/40 text-white text-sm px-5 py-3 rounded-2xl shadow-xl';
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5000);
    };

    // --- Helper: Add to history ---
    const addToHistory = (entry) => {
        generationHistory.unshift(entry);
        localStorage.setItem('video_history', JSON.stringify(generationHistory.slice(0, 30)));
        historySidebar.classList.remove('translate-x-full', 'opacity-0');
        historySidebar.classList.add('translate-x-0', 'opacity-100');
        renderHistory();
    };

    const renderHistory = () => {
        historyList.innerHTML = '';
        generationHistory.forEach((entry, idx) => {
            const thumb = document.createElement('div');
            thumb.className = `relative group/thumb cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 ${idx === 0 ? 'border-primary shadow-glow' : 'border-white/10 hover:border-white/30'}`;

            thumb.innerHTML = `
                <video src="${entry.url}" preload="metadata" muted class="w-full aspect-square object-cover"></video>
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button class="hist-download p-1.5 bg-primary rounded-lg text-black hover:scale-110 transition-transform" title="Download">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    </button>
                </div>
            `;

            thumb.onclick = (e) => {
                if (e.target.closest('.hist-download')) {
                    downloadFile(entry.url, `video-${entry.id || idx}.mp4`);
                    return;
                }
                // Restore extend context when viewing a seedance-v2.0 generation
                if (entry.model === 'seedance-v2.0-t2v' || entry.model === 'seedance-v2.0-i2v') {
                    lastGenerationId = entry.id;
                    lastGenerationModel = entry.model;
                } else {
                    lastGenerationId = null;
                    lastGenerationModel = null;
                }
                showVideoInCanvas(entry.url, entry.model);
                historyList.querySelectorAll('div').forEach(t => {
                    t.classList.remove('border-primary', 'shadow-glow');
                    t.classList.add('border-white/10');
                });
                thumb.classList.remove('border-white/10');
                thumb.classList.add('border-primary', 'shadow-glow');
            };

            historyList.appendChild(thumb);
        });
    };

    // --- Helper: Download file ---
    const downloadFile = async (url, filename) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch (err) {
            window.open(url, '_blank');
        }
    };

    // --- Load history from localStorage ---
    try {
        const saved = JSON.parse(localStorage.getItem('video_history') || '[]');
        if (saved.length > 0) {
            saved.forEach(e => generationHistory.push(e));
            historySidebar.classList.remove('translate-x-full', 'opacity-0');
            historySidebar.classList.add('translate-x-0', 'opacity-100');
            renderHistory();
        }
    } catch (e) { /* ignore */ }

    // --- Resume any pending video generations from a previous session ---
    (async () => {
        const pending = getPendingJobs('video');
        if (!pending.length) return;

        const apiKey = localStorage.getItem('kie_key');
        const cfLogged = !!localStorage.getItem('cf_backend');
        if (!apiKey && !localStorage.getItem('cf_backend')) return; // can't poll without key; jobs remain for next time

        const banner = document.createElement('div');
        banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-[200] bg-[#111] border border-white/10 text-white text-sm px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3';
        banner.innerHTML = `<span class="animate-spin text-primary">◌</span> <span class="banner-text">Resuming ${pending.length} pending generation${pending.length > 1 ? 's' : ''}…</span>`;
        document.body.appendChild(banner);

        let remaining = pending.length;
        pending.forEach(async (job) => {
            const elapsedAttempts = Math.floor((Date.now() - job.submittedAt) / job.interval);
            const attemptsLeft = Math.max(1, job.maxAttempts - elapsedAttempts);
            try {
                const result = await kie.pollForResult(job.requestId, apiKey, attemptsLeft, job.interval);
                const url = result.outputs?.[0] || result.url || result.output?.url;
                if (url) {
                    addToHistory({ id: job.requestId, url, ...job.historyMeta, timestamp: new Date().toISOString() });
                }
            } catch (e) {
                console.warn('[VideoStudio] Pending job failed on resume:', job.requestId, e.message);
            } finally {
                removePendingJob(job.requestId);
                remaining--;
                if (remaining === 0) banner.remove();
                else banner.querySelector('.banner-text').textContent = `Resuming ${remaining} pending generation${remaining > 1 ? 's' : ''}…`;
            }
        });
    })();

    // --- Button Handlers ---
    downloadBtn.onclick = () => {
        const current = resultVideo.src;
        if (current) {
            const entry = generationHistory.find(e => e.url === current);
            downloadFile(current, `video-${entry?.id || 'clip'}.mp4`);
        }
    };

    regenerateBtn.onclick = () => generateBtn.click();

    const resetToPromptBar = () => {
        canvas.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
        canvas.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
        canvasControls.classList.add('opacity-0');
        canvasControls.classList.remove('opacity-100');
        hero.classList.remove('hidden', 'opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
        promptWrapper.classList.remove('hidden', 'opacity-40');
    };

    newPromptBtn.onclick = () => {
        resetToPromptBar();
        textarea.value = '';
        picker.reset();
        uploadedImageUrl = null;
        imageMode = false;
        uploadedVideoUrl = null;
        v2vMode = false;
        showVideoIcon();
        selectedModel = t2vModels[0].id;
        selectedModelName = t2vModels[0].name;
        document.getElementById('v-model-btn-label').textContent = selectedModelName;
        updateControlsForModel(selectedModel);
        textarea.placeholder = 'Describe the video you want to create';
        textarea.disabled = false;
        textarea.focus();
    };

    extendBtn.onclick = () => {
        if (!lastGenerationId) return;
        resetToPromptBar();
        textarea.value = '';
        picker.reset();
        uploadedImageUrl = null;
        imageMode = false;
        selectedModel = 'seedance-v2.0-extend';
        selectedModelName = 'Seedance 2.0 Extend';
        document.getElementById('v-model-btn-label').textContent = selectedModelName;
        updateControlsForModel(selectedModel);
        textarea.placeholder = 'Optional: describe how to continue the video...';
        textarea.focus();
    };

    // ==========================================
    // 5. GENERATION LOGIC
    // ==========================================
    generateBtn.onclick = async () => {
        if (submitting) return;
        const prompt = textarea.value.trim();
        const model = getCurrentModel();
        const isExtendMode = model?.requiresRequestId;

        if (v2vMode) {
            if (!uploadedVideoUrl) {
                alert('Please upload a video first.');
                return;
            }
        } else if (isExtendMode) {
            if (!lastGenerationId) {
                alert('No Seedance 2.0 generation found to extend. Generate a video first.');
                return;
            }
        } else if (imageMode) {
            if (!uploadedImageUrl) {
                alert('Please upload a start frame image first.');
                return;
            }
            if (!prompt) {
                alert('Please describe the motion — this model needs a prompt even with an image.');
                return;
            }
        } else {
            if (!prompt) {
                alert('Please enter a prompt to generate a video.');
                return;
            }
        }

        const apiKey = localStorage.getItem('kie_key');
        const cfLogged = !!localStorage.getItem('cf_backend');
        if (!apiKey && !cfLogged) {
            AuthModal(() => generateBtn.click());
            return;
        }

        // Prompt, uploads and hero stay on screen. The button is only busy while the
        // job is being queued; polling continues in the background so another job can start.
        const submittedModel = selectedModel;
        const submittedAr = selectedAr;
        const submittedDuration = selectedDuration;
        const submittedResolution = selectedResolution;
        const submittedAdvanced = { ...advancedValues };
        const submittedImageMode = imageMode;
        const submittedV2V = v2vMode;
        const historyMeta = { prompt, model: submittedModel, aspect_ratio: submittedAr, duration: submittedDuration };
        let queuedId = null;

        const runJob = (queueRequest) => {
            const onRequestId = (rid) => {
                queuedId = rid;
                queueRequest(rid);
            };

            if (submittedV2V) {
                return kie.processV2V({ model: submittedModel, video_url: uploadedVideoUrl, onRequestId });
            }

            if (submittedImageMode) {
                const i2vParams = {
                    model: submittedModel,
                    image_url: uploadedImageUrl,
                    onRequestId,
                };
                if (prompt) i2vParams.prompt = prompt;
                i2vParams.aspect_ratio = submittedAr;
                const durations = getCurrentDurations(submittedModel);
                if (durations.length > 0) i2vParams.duration = submittedDuration;
                const resolutions = getCurrentResolutions(submittedModel);
                if (resolutions.length > 0) i2vParams.resolution = submittedResolution;
                i2vParams.advanced = submittedAdvanced;
                return kie.generateI2V(i2vParams);
            }

            const params = { model: submittedModel, onRequestId };

            if (prompt) params.prompt = prompt;

            // Extend mode: pass stored request_id, skip aspect_ratio
            if (isExtendMode) {
                params.request_id = lastGenerationId;
            } else {
                params.aspect_ratio = submittedAr;
            }

            const durations = getCurrentDurations(submittedModel);
            if (durations.length > 0) params.duration = submittedDuration;

            const resolutions = getCurrentResolutions(submittedModel);
            if (resolutions.length > 0) params.resolution = submittedResolution;
            params.advanced = submittedAdvanced;

            return kie.generateVideo(params);
        };

        const onDone = (res) => {
            console.log('[VideoStudio] Full response:', res);
            if (!res?.url) {
                console.error('[VideoStudio] No video URL in response:', res);
                flashBanner('Video failed: no video URL returned by API');
                return;
            }
            const genId = res.id || queuedId || Date.now().toString();
            // Keep the request id for seedance-v2.0 models so the Extend button works
            const keepForExtend = !submittedV2V && (submittedModel === 'seedance-v2.0-t2v' || submittedModel === 'seedance-v2.0-i2v');
            lastGenerationId = keepForExtend ? genId : null;
            lastGenerationModel = keepForExtend ? submittedModel : null;

            addToHistory(submittedV2V
                ? { id: genId, url: res.url, prompt: '', model: submittedModel, timestamp: new Date().toISOString() }
                : { id: genId, url: res.url, prompt, model: submittedModel, aspect_ratio: submittedAr, duration: submittedDuration, timestamp: new Date().toISOString() });

            // Open the finished video unless more jobs are still running (then it waits in History).
            if (jobsInFlight === 0) showVideoInCanvas(res.url, submittedModel);
            else flashBanner('Video ready — open it from History on the right');
        };

        submitting = true;
        generateBtn.disabled = true;
        generateBtn.innerHTML = `<span class="animate-spin inline-block mr-2 text-black">◌</span> Queuing...`;

        let failed = false;
        jobsInFlight++;
        try {
            await startGenerationJob(
                { studioType: 'video', historyMeta, maxAttempts: 900, interval: 2000 },
                runJob,
                {
                    onDone: (res) => { jobsInFlight = Math.max(0, jobsInFlight - 1); onDone(res); },
                    onFail: (e) => {
                        jobsInFlight = Math.max(0, jobsInFlight - 1);
                        console.error('[VideoStudio] Generation failed:', e);
                        flashBanner(`Video failed: ${e.message.slice(0, 80)}`);
                    },
                }
            );
        } catch (e) {
            failed = true;
            jobsInFlight = Math.max(0, jobsInFlight - 1);
            console.error('[VideoStudio] Could not queue generation:', e);
            generateBtn.innerHTML = `Error: ${e.message.slice(0, 60)}`;
            setTimeout(() => {
                generateBtn.innerHTML = `Generate ✨`;
            }, 4000);
        } finally {
            submitting = false;
            generateBtn.disabled = false;
            if (!failed) generateBtn.innerHTML = `Generate ✨`;
        }
    };

    return container;
}
