"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { generateImage } from '../kie.js';

// ─── Constants (inlined from promptUtils) ───────────────────────────────────

const CAMERA_MAP = {
    "Modular 8K Digital": "modular 8K digital cinema camera",
    "Full-Frame Cine Digital": "full-frame digital cinema camera",
    "Grand Format 70mm Film": "grand format 70mm film camera",
    "Studio Digital S35": "Super 35 studio digital camera",
    "Classic 16mm Film": "classic 16mm film camera",
    "Premium Large Format Digital": "premium large-format digital cinema camera"
};

const LENS_MAP = {
    "Creative Tilt Lens": "creative tilt lens effect",
    "Compact Anamorphic": "compact anamorphic lens",
    "Extreme Macro": "extreme macro lens",
    "70s Cinema Prime": "1970s cinema prime lens",
    "Classic Anamorphic": "classic anamorphic lens",
    "Premium Modern Prime": "premium modern prime lens",
    "Warm Cinema Prime": "warm-toned cinema prime lens",
    "Swirl Bokeh Portrait": "swirl bokeh portrait lens",
    "Vintage Prime": "vintage prime lens",
    "Halation Diffusion": "halation diffusion filter",
    "Clinical Sharp Prime": "ultra-sharp clinical prime lens"
};

const FOCAL_PERSPECTIVE = {
    8: "ultra-wide perspective",
    14: "wide-angle perspective",
    24: "wide-angle dynamic perspective",
    35: "natural cinematic perspective",
    50: "standard portrait perspective",
    85: "classic portrait perspective"
};

const APERTURE_EFFECT = {
    "f/1.4": "shallow depth of field, creamy bokeh",
    "f/4": "balanced depth of field",
    "f/11": "deep focus clarity, sharp foreground to background"
};

const ASSET_URLS = {
    "Modular 8K Digital": "/assets/cinema/modular_8k_digital.webp",
    "Full-Frame Cine Digital": "/assets/cinema/full_frame_cine_digital.webp",
    "Grand Format 70mm Film": "/assets/cinema/grand_format_70mm_film.webp",
    "Studio Digital S35": "/assets/cinema/studio_digital_s35.webp",
    "Classic 16mm Film": "/assets/cinema/classic_16mm_film.webp",
    "Premium Large Format Digital": "/assets/cinema/premium_large_format_digital.webp",
    "Creative Tilt Lens": "/assets/cinema/creative_tilt_lens.webp",
    "Compact Anamorphic": "/assets/cinema/compact_anamorphic.webp",
    "Extreme Macro": "/assets/cinema/extreme_macro.webp",
    "70s Cinema Prime": "/assets/cinema/70s_cinema_prime.webp",
    "Classic Anamorphic": "/assets/cinema/classic_anamorphic.webp",
    "Premium Modern Prime": "/assets/cinema/premium_modern_prime.webp",
    "Warm Cinema Prime": "/assets/cinema/warm_cinema_prime.webp",
    "Swirl Bokeh Portrait": "/assets/cinema/swirl_bokeh_portrait.webp",
    "Vintage Prime": "/assets/cinema/vintage_prime.webp",
    "Halation Diffusion": "/assets/cinema/halation_diffusion.webp",
    "Clinical Sharp Prime": "/assets/cinema/clinical_sharp_prime.webp",
    "f/1.4": "/assets/cinema/f_1_4.webp",
    "f/4": "/assets/cinema/f_4.webp",
    "f/11": "/assets/cinema/f_11.webp"
};

const ASPECT_RATIOS = ['16:9', '21:9', '9:16', '1:1', '4:5'];
const RESOLUTIONS = ['1K', '2K', '4K'];
const CAMERAS = Object.keys(CAMERA_MAP);
const LENSES = Object.keys(LENS_MAP);
const FOCAL_LENGTHS = Object.keys(FOCAL_PERSPECTIVE).map(k => parseInt(k));
const APERTURES = Object.keys(APERTURE_EFFECT);

function buildNanoBananaPrompt(basePrompt, camera, lens, focalLength, aperture) {
    const cameraDesc = CAMERA_MAP[camera] || camera;
    const lensDesc = LENS_MAP[lens] || lens;
    const perspective = FOCAL_PERSPECTIVE[focalLength] || "";
    const depthEffect = APERTURE_EFFECT[aperture] || "";
    const qualityTags = ["professional photography", "ultra-detailed", "8K resolution"];
    const parts = [
        basePrompt,
        `shot on a ${cameraDesc}`,
        `using a ${lensDesc} at ${focalLength}mm ${perspective ? `(${perspective})` : ''}`,
        `aperture ${aperture}`,
        depthEffect,
        "cinematic lighting",
        "natural color science",
        "high dynamic range",
        qualityTags.join(", ")
    ];
    return parts.filter(p => p && p.trim() !== "").join(", ");
}

// ─── Dropdown ────────────────────────────────────────────────────────────────

function Dropdown({ items, selected, onSelect, triggerRef, onClose }) {
    const menuRef = useRef(null);
    const [position, setPosition] = useState({ bottom: 0, left: 0 });

    useEffect(() => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setPosition({
                bottom: window.innerHeight - rect.top + 8,
                left: rect.left
            });
        }

        const handler = (e) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target) &&
                triggerRef.current &&
                !triggerRef.current.contains(e.target)
            ) {
                onClose();
            }
        };
        const timer = setTimeout(() => document.addEventListener('click', handler), 0);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('click', handler);
        };
    }, [triggerRef, onClose]);

    return (
        <div
            ref={menuRef}
            className="custom-dropdown fixed bg-[#1a1a1a] border border-white/10 rounded-xl py-1 shadow-2xl z-50 flex flex-col min-w-[100px] animate-fade-in"
            style={{ bottom: position.bottom, left: position.left }}
        >
            {items.map(item => (
                <button
                    key={item}
                    className={`px-3 py-2 text-xs font-bold text-left hover:bg-white/10 transition-colors ${item === selected ? 'text-primary' : 'text-white'}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelect(item);
                        onClose();
                    }}
                >
                    {item}
                </button>
            ))}
        </div>
    );
}

// ─── Scroll Column (Camera Controls) ─────────────────────────────────────────

function ScrollColumn({ title, items, columnKey, value, onChange }) {
    const listRef = useRef(null);
    const isDragging = useRef(false);
    const startY = useRef(0);
    const scrollTopStart = useRef(0);
    const isSnapEnabled = useRef(true);

    // Scroll to initial value on mount
    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        const timer = setTimeout(() => {
            const target = Array.from(list.children).find(
                c => c.dataset.value == String(value)
            );
            if (target) target.scrollIntoView({ block: 'center' });
        }, 100);
        return () => clearTimeout(timer);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleScroll = useCallback(() => {
        const list = listRef.current;
        if (!list) return;
        const centerY = list.scrollTop + list.clientHeight / 2;
        let closest = null;
        let minDist = Infinity;

        const children = Array.from(list.children).filter(c => c.dataset.value);
        children.forEach(child => {
            const childCenter = child.offsetTop + child.offsetHeight / 2;
            const dist = Math.abs(centerY - childCenter);
            if (dist < minDist) {
                minDist = dist;
                closest = child;
            }
        });

        children.forEach(child => {
            const imgBox = child.querySelector('[data-imgbox]');
            const label = child.querySelector('[data-label]');
            const focalSpan = imgBox?.querySelector('[data-focal-text]');
            const isClosest = child === closest;

            if (isClosest) {
                child.classList.remove('opacity-30', 'scale-75', 'blur-[1px]');
                child.classList.add('opacity-100', 'scale-100', 'blur-0', 'z-30');
                if (imgBox) {
                    imgBox.classList.add('border-primary/50', 'shadow-glow-sm', 'scale-110');
                    imgBox.classList.remove('border-white/10', 'bg-white/5');
                }
                if (focalSpan) focalSpan.classList.add('text-primary');
                if (label) label.classList.add('text-primary', 'text-shadow-sm');
            } else {
                child.classList.add('opacity-30', 'scale-75', 'blur-[1px]');
                child.classList.remove('opacity-100', 'scale-100', 'blur-0', 'z-30');
                if (imgBox) {
                    imgBox.classList.remove('border-primary/50', 'shadow-glow-sm', 'scale-110');
                    imgBox.classList.add('border-white/10', 'bg-white/5');
                }
                if (focalSpan) focalSpan.classList.remove('text-primary');
                if (label) label.classList.remove('text-primary', 'text-shadow-sm');
            }
        });

        if (closest) {
            const newVal = columnKey === 'focal'
                ? parseInt(closest.dataset.value)
                : closest.dataset.value;
            if (String(newVal) !== String(value)) {
                onChange(newVal);
            }
        }
    }, [columnKey, value, onChange]);

    // Attach scroll handler with initial check
    useEffect(() => {
        const list = listRef.current;
        if (!list) return;
        list.addEventListener('scroll', handleScroll);
        const timer = setTimeout(handleScroll, 150);
        return () => {
            list.removeEventListener('scroll', handleScroll);
            clearTimeout(timer);
        };
    }, [handleScroll]);

    // Mouse drag handlers
    const onMouseDown = (e) => {
        isDragging.current = true;
        isSnapEnabled.current = false;
        listRef.current.classList.add('cursor-grabbing');
        listRef.current.classList.remove('snap-y');
        startY.current = e.pageY - listRef.current.offsetTop;
        scrollTopStart.current = listRef.current.scrollTop;
        e.preventDefault();
    };

    const onMouseLeave = () => {
        isDragging.current = false;
        listRef.current.classList.remove('cursor-grabbing');
        listRef.current.classList.add('snap-y');
    };

    const onMouseUp = () => {
        isDragging.current = false;
        listRef.current.classList.remove('cursor-grabbing');
        listRef.current.classList.add('snap-y');
    };

    const onMouseMove = (e) => {
        if (!isDragging.current) return;
        e.preventDefault();
        const y = e.pageY - listRef.current.offsetTop;
        const walk = (y - startY.current) * 1.5;
        listRef.current.scrollTop = scrollTopStart.current - walk;
    };

    const onItemClick = (item) => {
        const list = listRef.current;
        if (!list) return;
        const target = Array.from(list.children).find(
            c => c.dataset.value == String(item)
        );
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <div className="flex flex-col items-center relative w-[140px] md:w-[160px] shrink-0 snap-center group">
            <div className="mb-3 text-[9px] font-black text-white/40 uppercase tracking-[0.2em] text-center">
                {title}
            </div>
            <div className="relative overflow-hidden w-full h-[40vh] md:h-[320px] bg-[#1a1a1a]/80 rounded-[2rem] border border-white/5 shadow-2xl backdrop-blur-xl transition-transform duration-300 hover:scale-[1.02] hover:border-white/10">
                {/* Top mask */}
                <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-[#1a1a1a] via-[#1a1a1a]/80 to-transparent z-20 pointer-events-none rounded-t-[2rem]" />
                {/* Bottom mask */}
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/80 to-transparent z-20 pointer-events-none rounded-b-[2rem]" />
                {/* Center glow */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-[80px] bg-primary/5 blur-xl rounded-full pointer-events-none z-0" />

                <div
                    ref={listRef}
                    className="h-full overflow-y-auto no-scrollbar snap-y snap-mandatory relative z-10"
                    onMouseDown={onMouseDown}
                    onMouseLeave={onMouseLeave}
                    onMouseUp={onMouseUp}
                    onMouseMove={onMouseMove}
                >
                    {/* Top spacer */}
                    <div style={{ height: 'calc(50% - 50px)' }} />

                    {items.map(item => {
                        const imageUrl = ASSET_URLS[item];
                        return (
                            <div
                                key={item}
                                data-value={item}
                                className="h-[100px] flex flex-col items-center justify-center gap-3 snap-center cursor-pointer transition-all duration-500 ease-out text-white p-2 select-none opacity-30 scale-75 blur-[1px]"
                                onClick={() => onItemClick(item)}
                            >
                                <div
                                    data-imgbox="true"
                                    className="w-14 h-14 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center transition-all duration-500 shadow-inner overflow-hidden relative"
                                >
                                    {imageUrl ? (
                                        <img
                                            src={imageUrl}
                                            alt={String(item)}
                                            className="w-full h-full object-cover opacity-80"
                                        />
                                    ) : columnKey === 'focal' ? (
                                        <span data-focal-text="true" className="text-lg font-bold text-white/50">
                                            {item}
                                        </span>
                                    ) : (
                                        <div className="w-3 h-3 bg-white/20 rounded-full" />
                                    )}
                                </div>
                                <span
                                    data-label="true"
                                    className="text-[9px] md:text-[10px] font-bold uppercase text-center leading-tight max-w-full truncate px-1 tracking-wider"
                                >
                                    {item}
                                </span>
                            </div>
                        );
                    })}

                    {/* Bottom spacer */}
                    <div style={{ height: 'calc(50% - 50px)' }} />
                </div>
            </div>
        </div>
    );
}

// ─── Camera Controls Overlay ─────────────────────────────────────────────────

function CameraControlsOverlay({ isOpen, onClose, settings, onSettingsChange }) {
    const backdropRef = useRef(null);

    const handleBackdropClick = (e) => {
        if (e.target === backdropRef.current) onClose();
    };

    const updateSetting = (key) => (val) => {
        onSettingsChange(prev => ({ ...prev, [key]: val }));
    };

    return (
        <div
            ref={backdropRef}
            className={`fixed inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
            onClick={handleBackdropClick}
        >
            <div
                className={`w-full max-w-4xl bg-[#141414] border border-white/10 rounded-3xl p-4 md:p-8 shadow-2xl transform transition-transform duration-300 flex flex-col max-h-[90vh] ${isOpen ? 'scale-100' : 'scale-95'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex gap-4">
                        <button className="px-4 py-2 bg-white text-black text-xs font-bold rounded-full">All</button>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white/50 hover:text-white transition-colors"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Scroll columns */}
                <div className="w-full flex justify-start md:justify-center gap-3 md:gap-6 py-4 md:py-8 overflow-x-auto no-scrollbar snap-x px-4 md:px-0">
                    <ScrollColumn
                        title="Camera"
                        items={CAMERAS}
                        columnKey="camera"
                        value={settings.camera}
                        onChange={updateSetting('camera')}
                    />
                    <ScrollColumn
                        title="Lens"
                        items={LENSES}
                        columnKey="lens"
                        value={settings.lens}
                        onChange={updateSetting('lens')}
                    />
                    <ScrollColumn
                        title="Focal Length"
                        items={FOCAL_LENGTHS}
                        columnKey="focal"
                        value={settings.focal}
                        onChange={updateSetting('focal')}
                    />
                    <ScrollColumn
                        title="Aperture"
                        items={APERTURES}
                        columnKey="aperture"
                        value={settings.aperture}
                        onChange={updateSetting('aperture')}
                    />
                </div>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CinemaStudio({ apiKey, onGenerationComplete, historyItems }) {
    // ── Settings state ──
    const [settings, setSettings] = useState({
        prompt: '',
        aspect_ratio: '16:9',
        camera: CAMERAS[0],
        lens: LENSES[0],
        focal: 35,
        aperture: 'f/1.4'
    });
    const [resolution, setResolution] = useState('2K');

    // ── UI state ──
    const [isOverlayOpen, setIsOverlayOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [canvasUrl, setCanvasUrl] = useState(null);   // null = prompt view
    const [activeHistoryIndex, setActiveHistoryIndex] = useState(null);

    // ── Internal history state (used when historyItems prop is not provided) ──
    const [internalHistory, setInternalHistory] = useState([]);

    // ── Dropdown state ──
    const [openDropdown, setOpenDropdown] = useState(null); // 'ar' | 'res' | null
    const arBtnRef = useRef(null);
    const resBtnRef = useRef(null);

    // ── Textarea auto-grow ──
    const textareaRef = useRef(null);
    const resultImgRef = useRef(null);

    // Derive effective history (prop wins over internal)
    const history = historyItems != null ? historyItems : internalHistory;

    const formatSummaryValue = () =>
        `${settings.lens}, ${settings.focal}mm, ${settings.aperture}`;

    // ── Textarea auto-height ──
    const handleTextareaInput = (e) => {
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = el.scrollHeight + 'px';
        setSettings(prev => ({ ...prev, prompt: el.value }));
    };

    // ── Generate ──
    const handleGenerate = useCallback(async () => {
        const basePrompt = settings.prompt.trim();
        if (!basePrompt || isGenerating) return;

        setIsGenerating(true);

        const finalPrompt = buildNanoBananaPrompt(
            basePrompt,
            settings.camera,
            settings.lens,
            settings.focal,
            settings.aperture
        );

        try {
            const res = await generateImage(apiKey, {
                model: 'nano-banana-pro',
                prompt: finalPrompt,
                aspect_ratio: settings.aspect_ratio,
                resolution: resolution.toLowerCase(),
                negative_prompt: 'blurry, low quality, distortion, bad composition'
            });

            if (res && res.url) {
                const entry = {
                    url: res.url,
                    timestamp: Date.now(),
                    settings: {
                        prompt: basePrompt,
                        camera: settings.camera,
                        lens: settings.lens,
                        focal: settings.focal,
                        aperture: settings.aperture,
                        aspect_ratio: settings.aspect_ratio,
                        resolution
                    }
                };

                // Only update internal history if not using prop-driven history
                if (historyItems == null) {
                    setInternalHistory(prev => [entry, ...prev].slice(0, 50));
                }

                setActiveHistoryIndex(0);
                setCanvasUrl(res.url);

                if (onGenerationComplete) {
                    onGenerationComplete({
                        url: res.url,
                        model: 'nano-banana-pro',
                        prompt: basePrompt,
                        type: 'cinema'
                    });
                }
            } else {
                throw new Error('No data returned');
            }
        } catch (e) {
            console.error(e);
            alert('Generation Failed: ' + e.message);
        } finally {
            setIsGenerating(false);
        }
    }, [settings, resolution, apiKey, isGenerating, onGenerationComplete, historyItems]);

    // ── Regenerate ──
    const handleRegenerate = useCallback(() => {
        setCanvasUrl(null);
        // Small delay then generate
        setTimeout(() => handleGenerate(), 300);
    }, [handleGenerate]);

    // ── Download ──
    const handleDownload = useCallback(async () => {
        if (!canvasUrl) return;
        try {
            const response = await fetch(canvasUrl);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `cinema-shot-${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        } catch {
            window.open(canvasUrl, '_blank');
        }
    }, [canvasUrl]);

    // ── Load history item ──
    const loadHistoryItem = (entry, idx) => {
        if (entry.settings) {
            setSettings(prev => ({
                ...prev,
                camera: entry.settings.camera ?? prev.camera,
                lens: entry.settings.lens ?? prev.lens,
                focal: entry.settings.focal ?? prev.focal,
                aperture: entry.settings.aperture ?? prev.aperture,
                aspect_ratio: entry.settings.aspect_ratio ?? prev.aspect_ratio,
                prompt: entry.settings.prompt ?? prev.prompt
            }));
            if (entry.settings.resolution) setResolution(entry.settings.resolution);

            // Sync textarea height
            if (textareaRef.current) {
                textareaRef.current.value = entry.settings.prompt || '';
                textareaRef.current.style.height = 'auto';
                textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
            }
        }
        setActiveHistoryIndex(idx);
        setCanvasUrl(entry.url);
    };

    const resetToPrompt = () => {
        setCanvasUrl(null);
        setSettings(prev => ({ ...prev, prompt: '' }));
        if (textareaRef.current) {
            textareaRef.current.value = '';
            textareaRef.current.style.height = 'auto';
            setTimeout(() => textareaRef.current?.focus(), 50);
        }
    };

    const showCanvas = canvasUrl !== null;

    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black relative overflow-hidden">

            {/* ── 1. Hero Section (Empty State) ── */}
            <div
                className={`flex flex-col items-center justify-center text-center px-4 animate-fade-in-up transition-all duration-700 ${showCanvas ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'}`}
            >
                <div className="mb-4 text-xs font-bold text-white/40 tracking-[0.2em] uppercase">
                    Cinema Studio 2.0
                </div>
                <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/50 tracking-tight leading-tight mb-2">
                    What would you shoot<br />with infinite budget?
                </h1>
            </div>

            {/* ── 2. Canvas Area (Result View) ── */}
            <div
                className={`absolute inset-0 flex flex-col items-center justify-center p-4 min-[800px]:p-16 z-30 transition-all duration-1000 bg-black/90 backdrop-blur-3xl ${showCanvas ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-10 scale-95 pointer-events-none'}`}
            >
                <div className="relative group max-w-full max-h-[70vh] flex items-center justify-center">
                    {canvasUrl && (
                        <img
                            ref={resultImgRef}
                            src={canvasUrl}
                            alt="Generated cinema shot"
                            className="max-h-[60vh] max-w-[90vw] rounded-2xl shadow-2xl border border-white/10 object-contain"
                        />
                    )}
                </div>

                {/* Canvas Controls */}
                <div
                    className={`mt-8 flex gap-3 justify-center transition-opacity duration-500 delay-500 ${showCanvas ? 'opacity-100' : 'opacity-0'}`}
                >
                    <button
                        onClick={() => handleRegenerate()}
                        className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border border-white/5 backdrop-blur-lg text-white hover:border-white/20"
                    >
                        ↻ Regenerate
                    </button>
                    <button
                        onClick={handleDownload}
                        className="bg-[#d9ff00] text-black px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wide hover:bg-white transition-colors shadow-glow-sm hover:scale-105 active:scale-95"
                    >
                        ↓ Download
                    </button>
                    <button
                        onClick={resetToPrompt}
                        className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border border-white/5 backdrop-blur-lg text-white hover:border-white/20"
                    >
                        + New Shot
                    </button>
                </div>
            </div>

            {/* ── 3. Floating Prompt Bar ── */}
            <div
                className={`absolute bottom-8 left-4 right-4 md:left-0 md:right-0 md:mx-auto md:max-w-4xl z-30 transition-all duration-700 ${showCanvas ? 'opacity-0 pointer-events-none translate-y-20' : 'opacity-100 translate-y-0'}`}
            >
                <div className="bg-[#1a1a1a] border border-white/10 rounded-[2rem] p-4 flex justify-between shadow-3xl items-end relative">

                    {/* Left Column */}
                    <div className="flex-1 flex flex-col gap-3 min-h-[80px] justify-between py-1 px-1">
                        {/* Input Row */}
                        <div className="flex items-start gap-3 w-full">
                            <textarea
                                ref={textareaRef}
                                placeholder="Describe your scene - use @ to add characters & props"
                                className="flex-1 bg-transparent border-none text-white text-lg font-medium placeholder:text-white/20 focus:outline-none resize-none h-[28px] leading-relaxed overflow-hidden"
                                rows={1}
                                onInput={handleTextareaInput}
                            />
                        </div>

                        {/* Settings Toolbar */}
                        <div className="flex items-center gap-3">
                            {/* Aspect Ratio Button */}
                            <div className="relative">
                                <button
                                    ref={arBtnRef}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white/50 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-lg border border-white/5"
                                    onClick={() => setOpenDropdown(d => d === 'ar' ? null : 'ar')}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="2" y="7" width="20" height="10" rx="2" ry="2" />
                                    </svg>
                                    {settings.aspect_ratio}
                                </button>
                                {openDropdown === 'ar' && (
                                    <Dropdown
                                        items={ASPECT_RATIOS}
                                        selected={settings.aspect_ratio}
                                        onSelect={(val) => setSettings(prev => ({ ...prev, aspect_ratio: val }))}
                                        triggerRef={arBtnRef}
                                        onClose={() => setOpenDropdown(null)}
                                    />
                                )}
                            </div>

                            {/* Resolution Button */}
                            <div className="relative">
                                <button
                                    ref={resBtnRef}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-white/50 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-lg border border-white/5"
                                    onClick={() => setOpenDropdown(d => d === 'res' ? null : 'res')}
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    </svg>
                                    {resolution}
                                </button>
                                {openDropdown === 'res' && (
                                    <Dropdown
                                        items={RESOLUTIONS}
                                        selected={resolution}
                                        onSelect={setResolution}
                                        triggerRef={resBtnRef}
                                        onClose={() => setOpenDropdown(null)}
                                    />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right Group */}
                    <div className="flex items-center gap-2 h-full self-end mb-1">
                        {/* Summary Card (triggers overlay) */}
                        <button
                            className="flex flex-col items-start justify-center px-4 py-2 bg-[#2a2a2a] rounded-xl border border-white/5 hover:border-white/20 transition-colors text-left flex-1 min-w-[100px] md:min-w-[140px] max-w-[240px] h-[56px] relative group overflow-hidden"
                            onClick={() => setIsOverlayOpen(true)}
                        >
                            <div className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full shadow-glow-sm" />
                            <span className="text-[10px] font-bold text-white uppercase truncate w-full tracking-wide">
                                {settings.camera}
                            </span>
                            <span className="text-[10px] font-medium text-white/60 truncate w-full">
                                {formatSummaryValue()}
                            </span>
                        </button>

                        {/* Generate Button */}
                        <button
                            className="h-[56px] px-8 bg-[#d9ff00] text-black rounded-xl font-black text-xs uppercase hover:bg-white transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={isGenerating || !settings.prompt.trim()}
                            onClick={handleGenerate}
                        >
                            {isGenerating ? 'SHOOTING...' : 'GENERATE ✨'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── 4. History Sidebar ── */}
            <div className="fixed right-0 top-0 h-full w-20 md:w-24 bg-black/60 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col items-center py-4 gap-3 overflow-y-auto transition-all duration-500">
                <div className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-2">
                    History
                </div>
                <div className="flex flex-col gap-2 w-full px-2">
                    {history.map((entry, idx) => (
                        <div
                            key={entry.timestamp ?? idx}
                            className={`relative group/thumb cursor-pointer rounded-lg overflow-hidden border-2 transition-all duration-300 aspect-square ${idx === activeHistoryIndex ? 'border-[#d9ff00] shadow-glow-sm' : 'border-white/10 hover:border-white/30'}`}
                            onClick={() => loadHistoryItem(entry, idx)}
                        >
                            <img
                                src={entry.url}
                                alt={`History item ${idx + 1}`}
                                className="w-full h-full object-cover opacity-80 group-hover/thumb:opacity-100 transition-opacity"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-[8px] font-bold text-white uppercase">Load</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── 5. Camera Controls Overlay ── */}
            <CameraControlsOverlay
                isOpen={isOverlayOpen}
                onClose={() => setIsOverlayOpen(false)}
                settings={settings}
                onSettingsChange={setSettings}
            />
        </div>
    );
}
