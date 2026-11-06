import { kie } from '../lib/kie.js';
import {
    t2iModels, getAspectRatiosForModel, getResolutionsForModel, getQualityFieldForModel,
    i2iModels, getAspectRatiosForI2IModel, getResolutionsForI2IModel, getQualityFieldForI2IModel,
    getMaxImagesForI2IModel
} from '../lib/models.js';
import { ENHANCE_TAGS, QUICK_PROMPTS } from '../lib/promptUtils.js';
import { sortByPriceDesc, loadPricing, priceChipHtml, costText } from '../lib/modelSort.js';
import { createQueueHistory, pendingThumbHtml, creditBadgeHtml, costMeta } from '../lib/studioQueue.js';
import { createCharacterButton } from '../lib/characters.js';
import { IMAGE_STYLES, fitsStyle, filterByStyle, pickForStyle, joinPrompt } from '../lib/modelStyles.js';
import { AuthModal } from './AuthModal.js';
import { createUploadPicker } from './UploadPicker.js';
import { savePendingJob, removePendingJob, getPendingJobs, startGenerationJob } from '../lib/pendingJobs.js';

function createInlineInstructions(type) {
    const el = document.createElement('div');
    el.className = 'w-full text-center text-white/30 text-sm flex flex-col items-center gap-2 py-2';
    const icon = type === 'image' ? '🖼️' : '🎬';
    el.innerHTML = `
        <p>${icon} Enter a prompt above and click <span class="text-primary font-semibold">Generate</span> to create your ${type}.</p>
        <p class="text-xs text-white/20">Tip: Be descriptive — include style, lighting, mood, and subject for best results.</p>
    `;
    return el;
}

export function ImageStudio() {
    const container = document.createElement('div');
    container.className = 'w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-y-auto custom-scrollbar overflow-x-hidden';

    // --- State ---
    loadPricing();
    const defaultModel = t2iModels[0];
    let selectedModel = defaultModel.id;
    let selectedModelName = defaultModel.name;
    let selectedAr = defaultModel.inputs?.aspect_ratio?.default || '1:1';
    let dropdownOpen = null;
    let uploadedImageUrls = []; // array of uploaded image URLs (multi-image support)
    let imageMode = false; // false = t2i models, true = i2i models
    let selectedStyle = 'all'; // filters the model list and adds a style hint to the prompt

    // Advanced parameters state
    let negativePrompt = '';
    let guidanceScale = 7.5;
    let steps = 25;
    let seed = -1;
    let showAdvanced = false;
    let batchCount = 1;

    // New advanced controls
    let customWidth = 0;  // 0 means use default (aspect ratio based)
    let customHeight = 0;
    let referenceStrength = 50;  // 0-100, for style reference models
    let selectedLora = '';  // LoRA model ID from Civitai
    let loraWeight = 1.0;

    // Quick tools panel state
    let showToolsPanel = false;

    const getCurrentModels = () => imageMode ? i2iModels : t2iModels;
    const getCurrentAspectRatios = (id) => imageMode ? getAspectRatiosForI2IModel(id) : getAspectRatiosForModel(id);
    const getCurrentResolutions = (id) => imageMode ? getResolutionsForI2IModel(id) : getResolutionsForModel(id);
    const getCurrentQualityField = (id) => imageMode ? getQualityFieldForI2IModel(id) : getQualityFieldForModel(id);

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
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                </svg>
                <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-glow relative z-10">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-primary">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <circle cx="8.5" cy="8.5" r="1.5"/>
                        <polyline points="21 15 16 10 5 21"/>
                    </svg>
                </div>
                <!-- Sparkles -->
                <div class="absolute top-4 right-4 text-primary animate-pulse">✨</div>
             </div>
        </div>
        <h1 class="text-2xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-4 selection:bg-primary selection:text-black text-center px-4">Image Studio</h1>
        <p class="text-secondary text-sm font-medium tracking-wide opacity-60">Transform images with AI — upscale, stylize, animate and more</p>
    `;
    container.appendChild(hero);

    // ==========================================
    // 2. PROMPT BAR (Tailwind Refactor)
    // ==========================================
    const promptWrapper = document.createElement('div');
    promptWrapper.className = 'w-full max-w-4xl relative z-40 animate-fade-in-up';
    promptWrapper.style.animationDelay = '0.2s';

    const bar = document.createElement('div');
    bar.className = 'w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-3 md:p-5 flex flex-col gap-3 md:gap-5 shadow-3xl';

    // Top Row: Input
    const topRow = document.createElement('div');
    topRow.className = 'flex items-start gap-5 px-2';

    // --- Image Upload Picker (Image-to-Image) ---
    const picker = createUploadPicker({
        anchorContainer: container,
        onSelect: ({ url, urls }) => {
            uploadedImageUrls = urls || [url];
            if (!imageMode) {
                imageMode = true;
                { const first = pickForStyle(i2iModels, '', selectedStyle); selectedModel = first.id; selectedModelName = first.name; }
                selectedAr = getAspectRatiosForI2IModel(selectedModel)[0];
                document.getElementById('model-btn-label').textContent = selectedModelName;
                document.getElementById('ar-btn-label').textContent = selectedAr;
                const validResolutions = getResolutionsForI2IModel(selectedModel);
                qualityBtn.style.display = validResolutions.length > 0 ? 'flex' : 'none';
                if (validResolutions.length > 0) document.getElementById('quality-btn-label').textContent = validResolutions[0];
                picker.setMaxImages(getMaxImagesForI2IModel(selectedModel));
            }
            textarea.placeholder = uploadedImageUrls.length > 1
                ? `${uploadedImageUrls.length} images selected — describe the transformation (optional)`
                : 'Describe how to transform this image (optional)';
        },
        onClear: () => {
            uploadedImageUrls = [];
            imageMode = false;
            { const first = pickForStyle(t2iModels, '', selectedStyle); selectedModel = first.id; selectedModelName = first.name; }
            selectedAr = getAspectRatiosForModel(selectedModel)[0];
            document.getElementById('model-btn-label').textContent = selectedModelName;
            document.getElementById('ar-btn-label').textContent = selectedAr;
            const t2iResolutions = getResolutionsForModel(selectedModel);
            qualityBtn.style.display = t2iResolutions.length > 0 ? 'flex' : 'none';
            if (t2iResolutions.length > 0) document.getElementById('quality-btn-label').textContent = t2iResolutions[0];
            picker.setMaxImages(1);
            textarea.placeholder = 'Describe the image you want to create';
        }
    });
    topRow.appendChild(picker.trigger);
    container.appendChild(picker.panel);

    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Describe the image you want to create';
    textarea.className = 'flex-1 bg-transparent border-none text-white text-base md:text-xl placeholder:text-muted focus:outline-none resize-none pt-2.5 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar';
    textarea.rows = 1;
    textarea.oninput = () => {
        textarea.style.height = 'auto';
        const maxHeight = window.innerWidth < 768 ? 150 : 250;
        textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
    };

    topRow.appendChild(textarea);
    bar.appendChild(topRow);

    // Bottom Row: Controls
    const bottomRow = document.createElement('div');
    bottomRow.className = 'flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-2 pt-4 border-t border-white/5';

    const controlsLeft = document.createElement('div');
    controlsLeft.className = 'flex flex-wrap items-center gap-1.5 md:gap-2.5 relative min-w-0 flex-1';

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
            <span class="text-[10px] font-black text-black">G</span>
        </div>
    `, selectedModelName, 'model-btn', 'Select AI generation model');

    const arBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
    `, selectedAr, 'ar-btn', 'Change aspect ratio');

    const qualityBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/></svg>
    `, '720p', 'quality-btn', 'Set output quality');

    const styleBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2c3.1 0 5.6-2.5 5.6-5.6C22 6 17.5 2 12 2z"/></svg>
    `, 'Style: All', 'style-btn', 'Pick a style to see the models that fit it');

    controlsLeft.appendChild(styleBtn);
    controlsLeft.appendChild(modelBtn);
    controlsLeft.appendChild(arBtn);
    controlsLeft.appendChild(qualityBtn);
    
    // Advanced options toggle button
    const advancedBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 001.82-.33 1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-1.82.33A1.65 1.65 0 0019.4 9a1.65 1.65 0 00-1.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
    `, 'Advanced', 'advanced-btn', 'Show advanced options');
    controlsLeft.appendChild(advancedBtn);

    // Saved character: its photos become the reference images (switches to image-to-image).
    const characterBtn = createCharacterButton({
        onPick: (c) => {
            picker.setMaxImages(getMaxImagesForI2IModel(imageMode ? selectedModel : i2iModels[0].id));
            picker.setImages(c.portraits);
        },
    });
    controlsLeft.appendChild(characterBtn.element);
    
    // Quick Tools toggle button
    const toolsBtn = createControlBtn(`
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="opacity-60 text-secondary"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
    `, 'Tools', 'tools-btn', 'Quick starters & prompt enhancer');
    controlsLeft.appendChild(toolsBtn);
    // Show quality button if the default model has quality/resolution options
    const _initResolutions = getResolutionsForModel(defaultModel.id);
    qualityBtn.style.display = _initResolutions.length > 0 ? 'flex' : 'none';
    if (_initResolutions.length > 0) {
        const qlabel = qualityBtn.querySelector('#quality-btn-label');
        if (qlabel) qlabel.textContent = _initResolutions[0];
    }

    const generateBtn = document.createElement('button');
    generateBtn.className = 'bg-primary text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-glow hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2.5 w-full sm:w-auto shadow-lg whitespace-nowrap shrink-0';
    generateBtn.setAttribute('data-tooltip', 'Generate AI image from prompt');
    generateBtn.innerHTML = `Generate ✨`;

    // Estimated cost of the next run, shown beside Generate.
    const costEl = document.createElement('span');
    costEl.className = 'hidden sm:inline text-[11px] font-bold text-secondary whitespace-nowrap self-center';
    const currentResolution = () => (getCurrentQualityField(selectedModel) ? document.getElementById('quality-btn-label')?.textContent : '');
    const refreshCost = () => {
        const model = getCurrentModels().find(m => m.id === selectedModel);
        costEl.textContent = model ? costText(model, { resolution: currentResolution() }) : '';
    };
    loadPricing().then(refreshCost);

    const generateGroup = document.createElement('div');
    generateGroup.className = 'flex items-center gap-3 w-full sm:w-auto shrink-0';
    generateGroup.appendChild(costEl);
    generateGroup.appendChild(generateBtn);

    bottomRow.appendChild(controlsLeft);
    bottomRow.appendChild(generateGroup);
    bar.appendChild(bottomRow);
    promptWrapper.appendChild(bar);
    container.appendChild(promptWrapper);

    const inlineInstructions = createInlineInstructions('image');
    inlineInstructions.classList.add('max-w-4xl', 'mt-8');
    container.appendChild(inlineInstructions);

    // ==========================================
    // 3. QUICK TOOLS PANEL (Prompt Enhancer + Quick Starters)
    // ==========================================
    const toolsPanel = document.createElement('div');
    toolsPanel.className = 'w-full max-w-4xl mt-6 animate-fade-in-up hidden';
    toolsPanel.id = 'tools-panel';
    
    // Build tools panel HTML
    toolsPanel.innerHTML = `
        <div class="bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 class="text-sm font-bold text-white">Quick Tools</h3>
                <button id="close-tools-btn" class="text-white/40 hover:text-white transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            
            <div class="flex flex-col lg:flex-row gap-6">
                <!-- Quick Starters Section -->
                <div class="flex-1">
                    <h4 class="text-xs font-bold text-secondary uppercase tracking-wider mb-3">Quick Starters</h4>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        ${QUICK_PROMPTS.map(q => `
                            <button class="quick-starter-btn px-3 py-2 rounded-lg text-xs font-bold bg-white/5 text-secondary hover:bg-white/10 hover:text-primary transition-all text-left border border-white/5 hover:border-primary/30" data-prompt="${q.prompt}">
                                ${q.label}
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <!-- Prompt Enhancer Section -->
                <div class="flex-1">
                    <h4 class="text-xs font-bold text-secondary uppercase tracking-wider mb-3">Prompt Enhancer</h4>
                    <div class="flex flex-col gap-3">
                        <input type="text" id="base-prompt-input" 
                            placeholder="Enter base prompt..."
                            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors">
                        
                        <div>
                            <label class="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 block">Enhancement Tags</label>
                            <div id="enhance-tags-area" class="flex flex-wrap gap-1.5">
                                ${Object.entries(ENHANCE_TAGS).map(([category, tags]) => 
                                    tags.map(tag => `<button class="enhance-tag-btn px-2 py-1 rounded-full text-[10px] font-bold bg-white/5 text-secondary hover:bg-white/10 transition-all" data-tag="${tag}">${tag}</button>`).join('')
                                ).join('')}
                            </div>
                        </div>
                        
                        <div class="flex flex-col gap-2">
                            <label class="text-[10px] font-bold text-muted uppercase tracking-wider">Enhanced Prompt</label>
                            <div id="enhanced-prompt-display" class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs min-h-[40px]"></div>
                            <div class="flex gap-2">
                                <button id="copy-enhanced-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-secondary hover:bg-white/10 transition-all">
                                    Copy
                                </button>
                                <button id="use-enhanced-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-black hover:shadow-glow transition-all">
                                    Use in Generator
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.appendChild(toolsPanel);

    // ==========================================
    // 4. ADVANCED OPTIONS PANEL
    // ==========================================
    const advancedPanel = document.createElement('div');
    advancedPanel.className = 'w-full max-w-4xl mt-6 animate-fade-in-up hidden';
    advancedPanel.id = 'advanced-panel';
    advancedPanel.innerHTML = `
        <div class="bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
            <div class="flex items-center justify-between pb-3 border-b border-white/5">
                <h3 class="text-sm font-bold text-white">Advanced Options</h3>
                <button id="close-adv-btn" class="text-white/40 hover:text-white transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
            </div>
            
            <!-- Negative Prompt -->
            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-secondary uppercase tracking-wider">Negative Prompt</label>
                <input type="text" id="negative-prompt-input" 
                    placeholder="What to exclude from the image (e.g., blurry, distorted, watermark)"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors">
            </div>
            
            <!-- Guidance Scale & Steps Row -->
            <div class="flex gap-4 flex-wrap">
                <div class="flex-1 min-w-[200px] flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-bold text-secondary uppercase tracking-wider">Guidance Scale</label>
                        <span id="guidance-value" class="text-xs font-bold text-primary">7.5</span>
                    </div>
                    <input type="range" id="guidance-slider" min="1" max="20" step="0.5" value="7.5" 
                        class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary">
                </div>
                
                <div class="flex-1 min-w-[200px] flex flex-col gap-2">
                    <div class="flex items-center justify-between">
                        <label class="text-xs font-bold text-secondary uppercase tracking-wider">Steps</label>
                        <span id="steps-value" class="text-xs font-bold text-primary">25</span>
                    </div>
                    <input type="range" id="steps-slider" min="1" max="50" step="1" value="25" 
                        class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary">
                </div>
            </div>
            
            <!-- Seed -->
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <label class="text-xs font-bold text-secondary uppercase tracking-wider">Seed</label>
                    <button id="randomize-seed-btn" class="text-xs font-bold text-primary hover:text-primary/80 transition-colors">Randomize</button>
                </div>
                <input type="number" id="seed-input" 
                    placeholder="-1 for random"
                    value="-1"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors">
            </div>
            
            <!-- Batch Count -->
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <label class="text-xs font-bold text-secondary uppercase tracking-wider">Batch Count</label>
                    <span id="batch-value" class="text-xs font-bold text-primary">1</span>
                </div>
                <input type="range" id="batch-slider" min="1" max="4" step="1" value="1" 
                    class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary">
            </div>
            
            <!-- Width & Height -->
            <div class="flex gap-4 flex-wrap">
                <div class="flex-1 min-w-[120px] flex flex-col gap-2">
                    <label class="text-xs font-bold text-secondary uppercase tracking-wider">Width</label>
                    <input type="number" id="width-input" 
                        placeholder="Auto"
                        value=""
                        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors">
                </div>
                <div class="flex-1 min-w-[120px] flex flex-col gap-2">
                    <label class="text-xs font-bold text-secondary uppercase tracking-wider">Height</label>
                    <input type="number" id="height-input" 
                        placeholder="Auto"
                        value=""
                        class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors">
                </div>
            </div>
            
            <!-- Reference Strength (for I2I models) -->
            <div class="flex flex-col gap-2">
                <div class="flex items-center justify-between">
                    <label class="text-xs font-bold text-secondary uppercase tracking-wider">Reference Strength</label>
                    <span id="reference-strength-value" class="text-xs font-bold text-primary">50%</span>
                </div>
                <input type="range" id="reference-strength-slider" min="0" max="100" step="5" value="50" 
                    class="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-primary">
                <p class="text-xs text-muted">How much to preserve the reference image characteristics</p>
            </div>
            
            <!-- LoRA Model Selection -->
            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-secondary uppercase tracking-wider">LoRA Model (Optional)</label>
                <input type="text" id="lora-input" 
                    placeholder="e.g., civitai:1642876@1864626"
                    class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors">
                <div class="flex items-center gap-2 mt-1">
                    <label class="text-xs font-bold text-secondary">LoRA Weight:</label>
                    <input type="number" id="lora-weight-input" 
                        value="1.0" min="0" max="4" step="0.1"
                        class="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-white text-sm focus:outline-none focus:border-primary/50 transition-colors">
                </div>
                <p class="text-xs text-muted">Enter a LoRA model ID from Civitai (format: civitai:id@version)</p>
            </div>
        </div>
    `;
    container.appendChild(advancedPanel);

    // Advanced panel toggle logic
    const toggleAdvanced = () => {
        showAdvanced = !showAdvanced;
        advancedPanel.classList.toggle('hidden', !showAdvanced);
        document.getElementById('advanced-btn-label').textContent = showAdvanced ? 'Less' : 'Advanced';
    };
    
    // Add tools panel and advanced panel to container first before accessing their elements
    container.appendChild(toolsPanel);
    container.appendChild(advancedPanel);
    
    // Now set up event handlers after elements are in DOM
    advancedBtn.onclick = toggleAdvanced;
    const closeAdvBtn = advancedPanel.querySelector('#close-adv-btn');
    if (closeAdvBtn) closeAdvBtn.onclick = toggleAdvanced;
    
    // Quick Tools Panel toggle
    const toggleTools = () => {
        showToolsPanel = !showToolsPanel;
        toolsPanel.classList.toggle('hidden', !showToolsPanel);
        if (showToolsPanel) {
            // Close advanced panel when opening tools
            if (!showAdvanced) {
                showAdvanced = true;
                advancedPanel.classList.remove('hidden');
            }
        }
        document.getElementById('tools-btn-label').textContent = showToolsPanel ? 'Tools' : 'Tools';
    };
    
    toolsBtn.onclick = toggleTools;
    const closeToolsBtn = toolsPanel.querySelector('#close-tools-btn');
    if (closeToolsBtn) closeToolsBtn.onclick = toggleTools;
    
    // Quick Starter buttons
    const quickStarterBtns = toolsPanel.querySelectorAll('.quick-starter-btn');
    quickStarterBtns.forEach(btn => {
        btn.onclick = () => {
            const prompt = btn.dataset.prompt;
            textarea.value = prompt;
            textarea.style.height = 'auto';
            const maxHeight = window.innerWidth < 768 ? 150 : 250;
            textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
            // Close tools panel after selection
            showToolsPanel = false;
            toolsPanel.classList.add('hidden');
        };
    });
    
    // Prompt Enhancer - selected tags state
    const enhanceSelectedTags = new Set();
    const basePromptInput = toolsPanel.querySelector('#base-prompt-input');
    const enhancedPromptDisplay = toolsPanel.querySelector('#enhanced-prompt-display');
    
    // Update enhanced prompt display
    const updateEnhancedPrompt = () => {
        const base = basePromptInput?.value?.trim() || '';
        const tags = Array.from(enhanceSelectedTags).join(', ');
        const enhanced = [base, tags].filter(p => p).join(', ');
        if (enhancedPromptDisplay) {
            enhancedPromptDisplay.textContent = enhanced || 'Your enhanced prompt will appear here...';
            enhancedPromptDisplay.classList.toggle('text-muted', !enhanced);
        }
    };
    
    // Base prompt input handler
    if (basePromptInput) {
        basePromptInput.oninput = updateEnhancedPrompt;
    }
    
    // Enhance tag buttons
    const enhanceTagBtns = toolsPanel.querySelectorAll('.enhance-tag-btn');
    enhanceTagBtns.forEach(btn => {
        btn.onclick = () => {
            const tag = btn.dataset.tag;
            if (enhanceSelectedTags.has(tag)) {
                enhanceSelectedTags.delete(tag);
                btn.classList.remove('bg-primary', 'text-black');
                btn.classList.add('bg-white/5', 'text-secondary');
            } else {
                enhanceSelectedTags.add(tag);
                btn.classList.remove('bg-white/5', 'text-secondary');
                btn.classList.add('bg-primary', 'text-black');
            }
            updateEnhancedPrompt();
        };
    });
    
    // Copy enhanced button
    const copyEnhancedBtn = toolsPanel.querySelector('#copy-enhanced-btn');
    if (copyEnhancedBtn) {
        copyEnhancedBtn.onclick = () => {
            const text = enhancedPromptDisplay?.textContent || '';
            if (text && text !== 'Your enhanced prompt will appear here...') {
                navigator.clipboard.writeText(text);
                copyEnhancedBtn.textContent = 'Copied!';
                setTimeout(() => { copyEnhancedBtn.textContent = 'Copy'; }, 1500);
            }
        };
    }
    
    // Use enhanced button
    const useEnhancedBtn = toolsPanel.querySelector('#use-enhanced-btn');
    if (useEnhancedBtn) {
        useEnhancedBtn.onclick = () => {
            const text = enhancedPromptDisplay?.textContent || '';
            if (text && text !== 'Your enhanced prompt will appear here...') {
                textarea.value = text;
                textarea.style.height = 'auto';
                const maxHeight = window.innerWidth < 768 ? 150 : 250;
                textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
                // Close tools panel after use
                showToolsPanel = false;
                toolsPanel.classList.add('hidden');
            }
        };
    }
    
    // Negative prompt
    const negPromptInput = advancedPanel.querySelector('#negative-prompt-input');
    if (negPromptInput) negPromptInput.oninput = (e) => { negativePrompt = e.target.value; };
    
    // Guidance scale slider
    const guidanceSlider = advancedPanel.querySelector('#guidance-slider');
    const guidanceValue = advancedPanel.querySelector('#guidance-value');
    if (guidanceSlider && guidanceValue) {
        guidanceSlider.oninput = (e) => {
            guidanceScale = parseFloat(e.target.value);
            guidanceValue.textContent = guidanceScale;
        };
    }
    
    // Steps slider
    const stepsSlider = advancedPanel.querySelector('#steps-slider');
    const stepsValue = advancedPanel.querySelector('#steps-value');
    if (stepsSlider && stepsValue) {
        stepsSlider.oninput = (e) => {
            steps = parseInt(e.target.value);
            stepsValue.textContent = steps;
        };
    }
    
    // Seed input
    const seedInput = advancedPanel.querySelector('#seed-input');
    if (seedInput) seedInput.oninput = (e) => { seed = parseInt(e.target.value) || -1; };
    
    // Randomize seed button
    const randSeedBtn = advancedPanel.querySelector('#randomize-seed-btn');
    if (randSeedBtn) {
        randSeedBtn.onclick = () => {
            seed = Math.floor(Math.random() * 999999999);
            if (seedInput) seedInput.value = seed;
        };
    }
    
    // Batch count slider
    const batchSlider = advancedPanel.querySelector('#batch-slider');
    const batchValueEl = advancedPanel.querySelector('#batch-value');
    if (batchSlider && batchValueEl) {
        batchSlider.oninput = (e) => {
            batchCount = parseInt(e.target.value);
            batchValueEl.textContent = batchCount;
        };
    }
    
    // Width input
    const widthInput = advancedPanel.querySelector('#width-input');
    if (widthInput) {
        widthInput.oninput = (e) => {
            customWidth = parseInt(e.target.value) || 0;
        };
    }
    
    // Height input
    const heightInput = advancedPanel.querySelector('#height-input');
    if (heightInput) {
        heightInput.oninput = (e) => {
            customHeight = parseInt(e.target.value) || 0;
        };
    }
    
    // Reference strength slider
    const refStrengthSlider = advancedPanel.querySelector('#reference-strength-slider');
    const refStrengthValue = advancedPanel.querySelector('#reference-strength-value');
    if (refStrengthSlider && refStrengthValue) {
        refStrengthSlider.oninput = (e) => {
            referenceStrength = parseInt(e.target.value);
            refStrengthValue.textContent = referenceStrength + '%';
        };
    }
    
    // LoRA input
    const loraInput = advancedPanel.querySelector('#lora-input');
    if (loraInput) {
        loraInput.oninput = (e) => {
            selectedLora = e.target.value.trim();
        };
    }
    
    // LoRA weight input
    const loraWeightInput = advancedPanel.querySelector('#lora-weight-input');
    if (loraWeightInput) {
        loraWeightInput.oninput = (e) => {
            loraWeight = parseFloat(e.target.value) || 1.0;
        };
    }
    
    // ==========================================
    // 3. DROPDOWNS (Professional implementation)
    // ==========================================
    const dropdown = document.createElement('div');
    dropdown.className = 'absolute bottom-[102%] left-2 z-50 transition-all opacity-0 pointer-events-none scale-95 origin-bottom-left glass rounded-3xl p-3 translate-y-2 w-[calc(100vw-3rem)] max-w-xs shadow-4xl border border-white/10 flex flex-col';

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
                            <input type="text" id="model-search" placeholder="Search models..." class="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0">
                        </div>
                    </div>
                    <div class="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 shrink-0">Available models${selectedStyle !== 'all' ? ` · ${IMAGE_STYLES.find(s => s.id === selectedStyle).label}` : ''}</div>
                    <div id="model-list-container" class="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2"></div>
                </div>
            `;
            const list = dropdown.querySelector('#model-list-container');

            const renderModels = (filter = '') => {
                list.innerHTML = '';
                const filtered = sortByPriceDesc(filterByStyle(getCurrentModels(), selectedStyle)).filter(m => m.name.toLowerCase().includes(filter.toLowerCase()) || m.id.toLowerCase().includes(filter.toLowerCase()));

                filtered.forEach(m => {
                    const item = document.createElement('div');
                    item.className = `flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 ${selectedModel === m.id ? 'bg-white/5 border-white/5' : ''}`;
                    item.innerHTML = `
                        <div class="flex items-center gap-3.5">
                             <div class="w-10 h-10 ${m.family === 'kontext' ? 'bg-blue-500/10 text-blue-400' : m.family === 'effects' ? 'bg-purple-500/10 text-purple-400' : 'bg-primary/10 text-primary'} border border-white/5 rounded-xl flex items-center justify-center font-black text-sm shadow-inner uppercase">${m.name.charAt(0)}</div>
                             <div class="flex flex-col gap-0.5">
                                <span class="text-xs font-bold text-white tracking-tight">${m.name}</span>
                             </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${priceChipHtml(m, document.getElementById('quality-btn-label')?.textContent)}
                            ${selectedModel === m.id ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                        </div>
                    `;
                    item.onclick = (e) => {
                        e.stopPropagation();
                        applyModel(m);
                        closeDropdown();
                    };
                    list.appendChild(item);
                });
            };

            renderModels();

            const searchInput = dropdown.querySelector('#model-search');
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
                    document.getElementById('ar-btn-label').textContent = r;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        } else if (type === 'style') {
            dropdown.classList.add('max-w-[240px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Image style</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';
            const pool = getCurrentModels();
            IMAGE_STYLES.forEach(st => {
                const count = filterByStyle(pool, st.id).length;
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.title = st.hint || 'Show every model';
                item.innerHTML = `<span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100"></span><span class="flex items-center gap-2"><span class="text-[10px] text-muted">${count} model${count === 1 ? '' : 's'}</span>${selectedStyle === st.id ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}</span>`;
                item.firstElementChild.textContent = st.label;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectedStyle = st.id;
                    document.getElementById('style-btn-label').textContent = `Style: ${st.id === 'all' ? 'All' : st.label}`;
                    const current = pool.find(m => m.id === selectedModel);
                    if (!current || !fitsStyle(current, st.id)) applyModel(pickForStyle(pool, selectedModel, st.id));
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        } else if (type === 'quality') {
            dropdown.classList.add('max-w-[200px]');
            dropdown.innerHTML = `<div class="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">Resolution</div>`;
            const list = document.createElement('div');
            list.className = 'flex flex-col gap-1';

            const options = getCurrentResolutions(selectedModel);

            options.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group';
                item.innerHTML = `
                    <span class="text-xs font-bold text-white opacity-80 group-hover:opacity-100">${opt}</span>
                     ${document.getElementById('quality-btn-label').textContent === opt ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2d2d" stroke-width="4"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    document.getElementById('quality-btn-label').textContent = opt;
                    closeDropdown();
                };
                list.appendChild(item);
            });
            dropdown.appendChild(list);
        }

        // Position dropdown
        const btnRect = anchorBtn.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Horizontal position
        if (window.innerWidth < 768) {
            // Center on mobile
            dropdown.style.left = '50%';
            dropdown.style.transform = 'translateX(-50%) translate(0, 8px)';
        } else {
            // Align with button on desktop
            dropdown.style.left = `${btnRect.left - containerRect.left}px`;
            dropdown.style.transform = 'translate(0, 8px)';
        }

        // Vertical position (always above button)
        dropdown.style.bottom = `${containerRect.bottom - btnRect.top + 8}px`;
    };

    const closeDropdown = () => {
        refreshCost();
        dropdown.classList.add('opacity-0', 'pointer-events-none');
        dropdown.classList.remove('opacity-100', 'pointer-events-auto');
        dropdownOpen = null;
    };

    modelBtn.onclick = (e) => {
        e.stopPropagation();
        if (dropdownOpen === 'model') closeDropdown();
        else {
            dropdownOpen = 'model';
            showDropdown('model', modelBtn);
        }
    };

    arBtn.onclick = (e) => {
        e.stopPropagation();
        if (dropdownOpen === 'ar') closeDropdown();
        else {
            dropdownOpen = 'ar';
            showDropdown('ar', arBtn);
        }
    };

    styleBtn.onclick = (e) => {
        e.stopPropagation();
        if (dropdownOpen === 'style') closeDropdown();
        else {
            dropdownOpen = 'style';
            showDropdown('style', styleBtn);
        }
    };

    qualityBtn.onclick = (e) => {
        e.stopPropagation();
        if (dropdownOpen === 'quality') closeDropdown();
        else {
            dropdownOpen = 'quality';
            showDropdown('quality', qualityBtn);
        }
    };

    window.onclick = () => closeDropdown();
    container.appendChild(dropdown);

    // ==========================================
    // 4. CANVAS AREA + HISTORY
    // ==========================================
    const generationHistory = [];

    // History sidebar
    const historySidebar = document.createElement('div');
    historySidebar.className = 'fixed right-0 top-0 h-full w-20 md:w-24 bg-black/60 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col items-center py-4 gap-3 overflow-y-auto transition-all duration-500 translate-x-full opacity-0';
    historySidebar.id = 'history-sidebar';

    const historyLabel = document.createElement('div');
    historyLabel.className = 'text-[9px] font-bold text-muted uppercase tracking-widest mb-2 rotate-0';
    historyLabel.textContent = 'History';
    historySidebar.appendChild(historyLabel);

    const historyList = document.createElement('div');
    historyList.className = 'flex flex-col gap-2 w-full px-2';
    historySidebar.appendChild(historyList);

    container.appendChild(historySidebar);

    // Main canvas
    const canvas = document.createElement('div');
    canvas.className = 'absolute inset-0 flex flex-col items-center justify-center p-4 min-[800px]:p-16 z-10 opacity-0 pointer-events-none transition-all duration-1000 translate-y-10 scale-95';

    const imageContainer = document.createElement('div');
    imageContainer.className = 'relative group';

    const resultImg = document.createElement('img');
    resultImg.className = 'max-h-[60vh] max-w-[80vw] rounded-3xl shadow-3xl border border-white/10 interactive-glow object-contain';
    imageContainer.appendChild(resultImg);

    // Canvas Controls
    const canvasControls = document.createElement('div');
    canvasControls.className = 'mt-6 flex gap-3 opacity-0 transition-opacity delay-500 duration-500 justify-center';

    const regenerateBtn = document.createElement('button');
    regenerateBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    regenerateBtn.textContent = '↻ Regenerate';

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'bg-primary text-black px-6 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-glow active:scale-95';
    downloadBtn.textContent = '↓ Download';

    const newPromptBtn = document.createElement('button');
    newPromptBtn.className = 'bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white';
    newPromptBtn.textContent = '+ New';

    canvasControls.appendChild(regenerateBtn);
    canvasControls.appendChild(downloadBtn);
    canvasControls.appendChild(newPromptBtn);

    canvas.appendChild(imageContainer);
    canvas.appendChild(canvasControls);
    container.appendChild(canvas);

    // --- Helper: Show image in canvas ---
    const showImageInCanvas = (imageUrl) => {
        // Fully hide hero and prompt
        hero.classList.add('hidden');
        promptWrapper.classList.add('hidden');

        resultImg.src = imageUrl;
        resultImg.onload = () => {
            canvas.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
            canvas.classList.add('opacity-100', 'translate-y-0', 'scale-100');
            canvasControls.classList.remove('opacity-0');
            canvasControls.classList.add('opacity-100');
        };
    };

    // --- Helper: Short error banner (used by background jobs) ---
    const flashBanner = (text, isError = true) => {
        const el = document.createElement('div');
        el.className = `fixed top-20 left-1/2 pointer-events-none -translate-x-1/2 z-[200] bg-[#111] border ${isError ? 'border-red-500/40' : 'border-primary/40'} text-white text-sm px-5 py-3 rounded-2xl shadow-xl`;
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 5000);
    };

    // --- History (pending cards are inserted the moment Generate is clicked) ---
    const revealHistory = () => {
        historySidebar.classList.remove('translate-x-full', 'opacity-0');
        historySidebar.classList.add('translate-x-0', 'opacity-100');
    };
    const queueHistory = createQueueHistory({
        history: generationHistory, storageKey: 'kie_history', limit: 50,
        render: () => renderHistory(), reveal: revealHistory,
    });
    const addToHistory = (entry) => queueHistory.resolve(null, entry);

    const renderHistory = () => {
        historyList.innerHTML = '';
        generationHistory.forEach((entry, idx) => {
            const thumb = document.createElement('div');
            thumb.className = `relative group/thumb ${entry.pending ? '' : 'cursor-pointer'} rounded-xl overflow-hidden border-2 transition-all duration-300 ${idx === 0 ? 'border-primary shadow-glow' : 'border-white/10 hover:border-white/30'}`;

            if (entry.pending) {
                thumb.title = entry.prompt ? `Generating: ${entry.prompt.slice(0, 80)}` : 'Generating…';
                thumb.innerHTML = pendingThumbHtml(entry);
                historyList.appendChild(thumb);
                return;
            }

            thumb.innerHTML = `
                <img src="${entry.url}" alt="${entry.prompt?.substring(0, 30) || 'Generated'}" class="w-full aspect-square object-cover">
                ${creditBadgeHtml(entry)}
                <div class="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <button class="hist-download p-1.5 bg-primary rounded-lg text-black hover:scale-110 transition-transform" title="Download">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    </button>
                </div>
            `;

            thumb.onclick = (e) => {
                if (e.target.closest('.hist-download')) {
                    downloadImage(entry.url, `kie-${entry.id || idx}.jpg`);
                    return;
                }
                showImageInCanvas(entry.url);
                // Update active border
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

    // --- Helper: Download image ---
    const downloadImage = async (url, filename) => {
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
            // Fallback: open in new tab
            window.open(url, '_blank');
        }
    };

    // --- Load history from localStorage ---
    try {
        const saved = JSON.parse(localStorage.getItem('kie_history') || '[]');
        if (saved.length > 0) {
            saved.forEach(e => generationHistory.push(e));
            historySidebar.classList.remove('translate-x-full', 'opacity-0');
            historySidebar.classList.add('translate-x-0', 'opacity-100');
            renderHistory();
        }
    } catch (e) { /* ignore */ }

    // --- Resume any pending image generations from a previous session ---
    (async () => {
        const pending = getPendingJobs('image');
        if (!pending.length) return;

        const apiKey = localStorage.getItem('kie_key');
        const cfLogged = !!localStorage.getItem('cf_backend');
        if (!apiKey && !localStorage.getItem('cf_backend')) return; // can't poll without key; jobs remain for next time

        const banner = document.createElement('div');
        banner.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-[#111] border border-white/10 text-white text-sm px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3 pointer-events-none';
        banner.innerHTML = `<span class="animate-spin text-primary">◌</span> <span class="banner-text">Resuming ${pending.length} pending generation${pending.length > 1 ? 's' : ''}…</span>`;
        document.body.appendChild(banner);
        // Brief notice only; the Queued cards in History show progress from here on.
        setTimeout(() => banner.remove(), 4000);

        let remaining = pending.length;
        pending.forEach(async (job) => {
            const tempId = queueHistory.addPending({ ...job.historyMeta });
            const elapsedAttempts = Math.floor((Date.now() - job.submittedAt) / job.interval);
            const attemptsLeft = Math.max(1, job.maxAttempts - elapsedAttempts);
            try {
                const result = await kie.pollForResult(job.requestId, apiKey, attemptsLeft, job.interval);
                const url = result.outputs?.[0] || result.url || result.output?.url;
                if (url) {
                    queueHistory.resolve(tempId, { id: job.requestId, url, ...job.historyMeta, timestamp: new Date().toISOString() });
                } else queueHistory.fail(tempId);
            } catch (e) {
                queueHistory.fail(tempId);
                console.warn('[ImageStudio] Pending job failed on resume:', job.requestId, e.message);
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
        const current = resultImg.src;
        if (current) {
            const entry = generationHistory.find(e => e.url === current);
            downloadImage(current, `kie-${entry?.id || 'image'}.jpg`);
        }
    };

    regenerateBtn.onclick = () => {
        // Inputs are cleared after every Generate, so restore the viewed image's settings first.
        const entry = generationHistory.find(e => e.url === resultImg.src);
        newPromptBtn.onclick();
        if (entry) {
            textarea.value = entry.prompt || '';
            const m = t2iModels.find(x => x.id === entry.model);
            if (m) {
                selectedModel = m.id; selectedModelName = m.name;
                document.getElementById('model-btn-label').textContent = selectedModelName;
                if (entry.aspect_ratio && getAspectRatiosForModel(m.id).includes(entry.aspect_ratio)) {
                    selectedAr = entry.aspect_ratio;
                    document.getElementById('ar-btn-label').textContent = selectedAr;
                }
                refreshCost();
            }
        }
        generateBtn.click();
    };

    newPromptBtn.onclick = () => {
        // Reset to prompt view
        canvas.classList.add('opacity-0', 'pointer-events-none', 'translate-y-10', 'scale-95');
        canvas.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
        canvasControls.classList.add('opacity-0');
        canvasControls.classList.remove('opacity-100');
        // Restore hero and prompt
        hero.classList.remove('hidden', 'opacity-0', 'scale-95', '-translate-y-10', 'pointer-events-none');
        promptWrapper.classList.remove('hidden', 'opacity-40');
        textarea.value = '';
        picker.reset();
        uploadedImageUrls = [];
        picker.setMaxImages(1);
        // Reset to t2i mode
        imageMode = false;
        { const first = pickForStyle(t2iModels, '', selectedStyle); selectedModel = first.id; selectedModelName = first.name; }
        selectedAr = getAspectRatiosForModel(selectedModel)[0];
        document.getElementById('model-btn-label').textContent = selectedModelName;
        document.getElementById('ar-btn-label').textContent = selectedAr;
        const resetResolutions = getResolutionsForModel(selectedModel);
        qualityBtn.style.display = resetResolutions.length > 0 ? 'flex' : 'none';
        if (resetResolutions.length > 0) document.getElementById('quality-btn-label').textContent = resetResolutions[0];
        textarea.placeholder = 'Describe the image you want to create';
        textarea.focus();
    };

    // Clear the prompt/reference after a submit. The chosen model and settings stay;
    // reference-image models fall back to the first text-to-image model.
    const resetInputs = () => {
        picker.reset();
        characterBtn.reset();
        uploadedImageUrls = [];
        if (imageMode) {
            imageMode = false;
            { const first = pickForStyle(t2iModels, '', selectedStyle); selectedModel = first.id; selectedModelName = first.name; }
            selectedAr = getAspectRatiosForModel(selectedModel)[0];
            document.getElementById('model-btn-label').textContent = selectedModelName;
            document.getElementById('ar-btn-label').textContent = selectedAr;
            const resolutions = getResolutionsForModel(selectedModel);
            qualityBtn.style.display = resolutions.length > 0 ? 'flex' : 'none';
            if (resolutions.length > 0) document.getElementById('quality-btn-label').textContent = resolutions[0];
            picker.setMaxImages(1);
        }
        textarea.placeholder = 'Describe the image you want to create';
        refreshCost();
    };

    // Switch to a model and reset its aspect ratio / resolution controls.
    function applyModel(m) {
        selectedModel = m.id;
        selectedModelName = m.name;
        selectedAr = getCurrentAspectRatios(selectedModel)[0];
        document.getElementById('model-btn-label').textContent = selectedModelName;
        document.getElementById('ar-btn-label').textContent = selectedAr;
        const validResolutions = getCurrentResolutions(selectedModel);
        qualityBtn.style.display = validResolutions.length > 0 ? 'flex' : 'none';
        if (validResolutions.length > 0) document.getElementById('quality-btn-label').textContent = validResolutions[0];
        if (imageMode) picker.setMaxImages(getMaxImagesForI2IModel(selectedModel));
    }

    // ==========================================
    // 5. GENERATION LOGIC
    // ==========================================
    generateBtn.onclick = async () => {
        const prompt = textarea.value.trim();
        if (imageMode) {
            if (uploadedImageUrls.length === 0) {
                alert('Please upload a reference image first.');
                return;
            }
        } else {
            if (!prompt) {
                alert('Please enter a prompt to generate an image.');
                return;
            }
        }

        const apiKey = localStorage.getItem('kie_key');
        const cfLogged = !!localStorage.getItem('cf_backend');
        if (!apiKey && !cfLogged) {
            AuthModal(() => generateBtn.click());
            return;
        }

        // Snapshot this run, then clear the form so the next prompt can start immediately.
        const submittedModel = selectedModel;
        const submittedAr = selectedAr;
        const submittedImages = uploadedImageUrls.slice();
        const submittedImageMode = imageMode;
        const qualityLabel = document.getElementById('quality-btn-label')?.textContent;
        const qualityField = getCurrentQualityField(selectedModel);
        const model = getCurrentModels().find(m => m.id === submittedModel);
        const cost = model ? costMeta(model, { resolution: qualityField ? qualityLabel : '' }) : {};
        const historyMeta = { prompt, model: submittedModel, aspect_ratio: submittedAr, ...cost };
        const styleHint = IMAGE_STYLES.find(st => st.id === selectedStyle)?.hint || '';
        const promptForModel = joinPrompt(prompt, styleHint);

        const tempId = queueHistory.addPending(historyMeta);
        textarea.value = '';
        textarea.style.height = 'auto';
        resetInputs();

        const buildParams = (queueRequest) => {
            const params = submittedImageMode
                ? { model: submittedModel, images_list: submittedImages, image_url: submittedImages[0], aspect_ratio: submittedAr }
                : { model: submittedModel, prompt: promptForModel, aspect_ratio: submittedAr };
            if (submittedImageMode && prompt) params.prompt = promptForModel;
            if (qualityField && qualityLabel) params[qualityField] = qualityLabel;
            if (cost.credits) params.estimatedCredits = cost.credits;
            params.onRequestId = queueRequest;
            return params;
        };

        // Not awaited: the studio stays usable while the job is queued and polled.
        startGenerationJob(
            { studioType: 'image', historyMeta, maxAttempts: 60, interval: 2000 },
            (queueRequest) => {
                const params = buildParams(queueRequest);
                return submittedImageMode ? kie.generateI2I(params) : kie.generateImage(params);
            },
            {
                onDone: (res) => {
                    if (!res?.url) {
                        console.error('[ImageStudio] No image URL in response:', res);
                        queueHistory.fail(tempId);
                        flashBanner('Image failed: no image URL returned by API');
                        return;
                    }
                    queueHistory.resolve(tempId, {
                        id: res.id || Date.now().toString(),
                        url: res.url,
                        ...historyMeta,
                        timestamp: new Date().toISOString(),
                    });
                    flashBanner('Image ready — open it from History on the right', false);
                },
                onFail: (e) => {
                    console.error('[ImageStudio] Generation failed:', e);
                    queueHistory.fail(tempId);
                    flashBanner(`Image failed: ${e.message.slice(0, 80)}`);
                },
            }
        ).catch((e) => {
            console.error('[ImageStudio] Could not queue generation:', e);
            queueHistory.fail(tempId);
            flashBanner(`Could not start image: ${e.message.slice(0, 80)}`);
        });
    };

    return container;
}
