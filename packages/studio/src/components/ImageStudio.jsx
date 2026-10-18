"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { generateImage, generateI2I, uploadFile } from "../kie.js";
import {
  t2iModels,
  i2iModels,
  getAspectRatiosForModel,
  getResolutionsForModel,
  getQualityFieldForModel,
  getAspectRatiosForI2IModel,
  getResolutionsForI2IModel,
  getQualityFieldForI2IModel,
  getMaxImagesForI2IModel,
} from "../models.js";

// ─── helpers ────────────────────────────────────────────────────────────────


async function downloadImage(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// ─── UploadButton (inline picker) ───────────────────────────────────────────

function UploadButton({ apiKey, maxImages, onSelect, onClear }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState([]); // [{url, thumbnail}]
  const [uploadHistory, setUploadHistory] = useState([]); // [{id, name, url, thumbnail}]
  const [lastUploadProgress, setLastUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [panelOpen]);

  // When maxImages changes, trim excess selections
  useEffect(() => {
    if (selectedEntries.length > maxImages) {
      const trimmed = selectedEntries.slice(0, maxImages);
      setSelectedEntries(trimmed);
      if (trimmed.length === 0) onClear?.();
    }
    if (fileInputRef.current) {
      fileInputRef.current.multiple = maxImages > 1;
    }
  }, [maxImages]); // eslint-disable-line react-hooks/exhaustive-deps

  const fireOnSelect = useCallback(
    (entries) => {
      if (!entries.length) return;
      const urls = entries.map((e) => e.url);
      onSelect({ url: urls[0], urls, thumbnail: entries[0].url });
    },
    [onSelect]
  );

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter(f => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      alert(`The following images are too large (max 10MB): ${tooLarge.map(f => f.name).join(', ')}`);
      return;
    }

    setUploading(true);
    try {
      const toUpload =
        maxImages === 1 ? files.slice(0, 1) : files.slice(0, maxImages - selectedEntries.length || 1);

      await Promise.all(
        toUpload.map(async (file) => {
          const id = Date.now().toString() + Math.random();

          // Add a placeholder to history immediately without local preview
          const placeholder = { id, name: file.name, url: null, progress: 0 };
          setUploadHistory((prev) => [placeholder, ...prev]);

          try {
            const uploadedUrl = await uploadFile(apiKey, file, (pct) => {
              setLastUploadProgress(pct);
              setUploadHistory((prev) =>
                prev.map((h) => (h.id === id ? { ...h, progress: pct } : h))
              );
            });

            // Update history with real URL and Mark as 100%
            setUploadHistory((prev) =>
              prev.map((h) => {
                if (h.id === id) {
                  return { ...h, url: uploadedUrl, progress: 100 };
                }
                return h;
              })
            );

            // Auto-select if there's room
            if (selectedEntries.length < maxImages) {
              const newEntry = { url: uploadedUrl };
              setSelectedEntries((prev) => [...prev, newEntry]);

              if (maxImages === 1) {
                fireOnSelect([newEntry]);
                setPanelOpen(false);
              }
            }
          } catch (err) {
            console.error("[UploadButton] Upload failed for", file.name, err);
            setUploadHistory((prev) => prev.filter((h) => h.id !== id));
            throw err;
          }
        })
      );
    } catch (err) {
      alert(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setLastUploadProgress(0);
    }
  };

  const handleCellClick = (entry) => {
    const selIdx = selectedEntries.findIndex((e) => e.url === entry.url);
    const isSelected = selIdx !== -1;
    const atMax = maxImages > 1 && !isSelected && selectedEntries.length >= maxImages;
    if (atMax) return;

    if (maxImages === 1) {
      const newSelected = [{ url: entry.url, localUrl: entry.localUrl }];
      setSelectedEntries(newSelected);
      fireOnSelect(newSelected);
      setPanelOpen(false);
    } else {
      let next;
      if (isSelected) {
        next = selectedEntries.filter((_, i) => i !== selIdx);
        if (next.length === 0) onClear?.();
      } else {
        next = [...selectedEntries, { url: entry.url, localUrl: entry.localUrl }];
      }
      setSelectedEntries(next);
    }
  };

  const handleRemoveFromHistory = (e, entry) => {
    e.stopPropagation();
    if (entry.localUrl) URL.revokeObjectURL(entry.localUrl);
    setUploadHistory((prev) => prev.filter((h) => h.id !== entry.id));
    
    const next = selectedEntries.filter((s) => s.url !== entry.url);
    if (next.length !== selectedEntries.length) {
      setSelectedEntries(next);
      if (next.length === 0) onClear?.();
    }
  };

  const handleDone = (e) => {
    e.stopPropagation();
    fireOnSelect(selectedEntries);
    setPanelOpen(false);
  };

  const reset = () => {
    setSelectedEntries([]);
    setPanelOpen(false);
  };

  // expose reset via ref pattern — parent calls reset() directly
  // (handled by parent through uploadedImageUrls state reset)

  const isMulti = maxImages > 1;
  const count = selectedEntries.length;
  const hasSelection = count > 0;

  // Trigger icon content
  let triggerContent;
  if (hasSelection || uploading) {
    const mainEntry = selectedEntries[0] || uploadHistory[0];
    const canAddMore = isMulti && count < maxImages;
    let badge;
    if (uploading && !hasSelection) {
      badge = (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
          <div className="w-4 h-4 rounded-full border border-primary/30 border-t-primary animate-spin mb-0.5" />
          <span className="text-[8px] font-black text-primary">{lastUploadProgress}%</span>
        </div>
      );
    } else if (count > 1) {
      badge = (
        <div className="absolute bottom-0.5 right-0.5 min-w-[16px] h-4 bg-primary rounded-full flex items-center justify-center px-0.5">
          <span className="text-[9px] font-black text-black leading-none">{count}</span>
        </div>
      );
    } else if (canAddMore) {
      badge = (
        <div className="absolute bottom-0.5 right-0.5 min-w-[16px] h-4 bg-white/80 rounded-full flex items-center justify-center px-0.5 border border-primary/60">
          <span className="text-[9px] font-black text-black leading-none">+</span>
        </div>
      );
    } else {
      badge = (
        <div className="absolute bottom-0.5 right-0.5 min-w-[16px] h-4 bg-primary rounded-full flex items-center justify-center px-0.5">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      );
    }
    triggerContent = (
      <>
        {uploading && hasSelection && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
            <div className="w-4 h-4 rounded-full border border-primary/30 border-t-primary animate-spin mb-0.5" />
            <span className="text-[8px] font-black text-primary">{lastUploadProgress}%</span>
          </div>
        )}
        {mainEntry?.url ? (
          <img src={mainEntry.url} alt="" className={`w-full h-full object-cover transition-all duration-300 ${uploading && hasSelection ? 'blur-[2px] scale-110 opacity-60' : 'blur-0 scale-100 opacity-100'}`} />
        ) : (
           <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 animate-pulse">
             <div className="w-4 h-4 rounded-full border border-primary/20 border-t-primary animate-spin mb-0.5" />
             <span className="text-[8px] font-black text-primary">{lastUploadProgress}%</span>
           </div>
        )}
        {!uploading && badge}
      </>
    );
  } else {
    triggerContent = (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-muted group-hover:text-primary transition-colors"
      >
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    );
  }

  const triggerTitle = hasSelection
    ? count > 1
      ? `${count} of ${maxImages} images selected — click to manage`
      : isMulti
      ? `1 image selected — click to add more (up to ${maxImages})`
      : "Reference image"
    : isMulti
    ? `Add up to ${maxImages} images`
    : "Reference image";

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={isMulti}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        title={triggerTitle}
        onClick={(e) => {
          e.stopPropagation();
          setPanelOpen((o) => !o);
        }}
        className={`w-10 h-10 shrink-0 rounded-xl border transition-all flex items-center justify-center relative overflow-hidden mt-1.5 bg-white/5 hover:bg-white/10 group ${
          hasSelection
            ? "border-primary/60 hover:border-primary/40"
            : "border-white/10 hover:border-primary/40"
        }`}
      >
        {triggerContent}
      </button>

      {/* Panel */}
      {panelOpen && (
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute z-50 bottom-[calc(100%+8px)] left-0 bg-[#111] rounded-3xl p-3 shadow-4xl border border-white/10 w-72"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-white/5">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                Reference Images
              </span>
              {isMulti && (
                <span className="text-[9px] text-muted">
                  Select up to {maxImages} images
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isMulti && hasSelection && (
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
                >
                  ✓ Done ({count})
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold transition-all border border-primary/20"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {isMulti ? "Upload files" : "Upload new"}
              </button>
            </div>
          </div>

          {/* Grid or empty state */}
          {uploadHistory.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-2 opacity-40">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-secondary"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-xs text-secondary">No uploads yet</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
              {uploadHistory.map((entry) => {
                const selIdx = selectedEntries.findIndex((e) => e.url === entry.url);
                const isSelected = selIdx !== -1;
                const atMax = isMulti && !isSelected && selectedEntries.length >= maxImages;

                return (
                  <div
                    key={entry.id}
                    title={entry.name}
                    onClick={() => entry.url && handleCellClick(entry)}
                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer group/cell aspect-square transition-all ${
                      isSelected ? "border-primary shadow-glow" : "border-white/10 hover:border-white/30"
                    } ${atMax ? "opacity-40 cursor-not-allowed" : ""} ${!entry.url ? "cursor-wait" : ""}`}
                  >
                    {entry.url ? (
                      <img
                        src={entry.url}
                        alt={entry.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex flex-col items-center justify-center">
                         <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-1" />
                         <span className="text-[10px] font-black text-primary">{entry.progress}%</span>
                      </div>
                    )}

                    {/* Hover overlay with delete */}
                    {entry.url && (
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-end justify-end p-1">
                        <button
                          type="button"
                          title="Remove from history"
                          onClick={(e) => handleRemoveFromHistory(e, entry)}
                          className="w-5 h-5 bg-red-500/80 hover:bg-red-500 rounded-md flex items-center justify-center transition-colors"
                        >
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Selection badge */}
                    {isSelected && (
                      <div className="absolute top-1 left-1 min-w-[20px] h-5 bg-primary rounded-full flex items-center justify-center px-1">
                        {isMulti ? (
                          <span className="text-[10px] font-black text-black">{selIdx + 1}</span>
                        ) : (
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="4">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom bar for multi-select */}
          {isMulti && hasSelection && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-xs text-secondary">
                {count} of {maxImages} selected
              </span>
              <button
                type="button"
                onClick={handleDone}
                className="px-4 py-1.5 bg-primary text-black rounded-xl text-xs font-black transition-all hover:scale-105"
              >
                Use Selected
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ModelDropdown ────────────────────────────────────────────────────────────

function ModelDropdown({ models, selectedModel, onSelect, onClose }) {
  const [search, setSearch] = useState("");

  const filtered = models.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full max-h-[70vh]">
      <div className="px-2 pb-3 mb-2 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-2.5 border border-white/5 focus-within:border-primary/50 transition-colors">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none text-xs text-white focus:ring-0 w-full p-0 focus:outline-none"
          />
        </div>
      </div>
      <div className="text-[10px] font-bold text-secondary uppercase tracking-widest px-3 py-2 shrink-0">
        Available models
      </div>
      <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2">
        {filtered.map((m) => (
          <div
            key={m.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(m);
              onClose();
            }}
            className={`flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all border border-transparent hover:border-white/5 ${
              selectedModel === m.id ? "bg-white/5 border-white/5" : ""
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-10 h-10 ${
                  m.family === "kontext"
                    ? "bg-blue-500/10 text-blue-400"
                    : m.family === "effects"
                    ? "bg-purple-500/10 text-purple-400"
                    : "bg-primary/10 text-primary"
                } border border-white/5 rounded-xl flex items-center justify-center font-black text-sm shadow-inner uppercase`}
              >
                {m.name.charAt(0)}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-bold text-white tracking-tight">{m.name}</span>
              </div>
            </div>
            {selectedModel === m.id && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d9ff00" strokeWidth="4">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SimpleDropdown ───────────────────────────────────────────────────────────

function SimpleDropdown({ title, options, selected, onSelect, onClose }) {
  return (
    <>
      <div className="text-[10px] font-bold text-muted uppercase tracking-widest px-3 py-2 border-b border-white/5 mb-2">
        {title}
      </div>
      <div className="flex flex-col gap-1">
        {options.map((opt) => (
          <div
            key={opt}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(opt);
              onClose();
            }}
            className="flex items-center justify-between p-3.5 hover:bg-white/5 rounded-2xl cursor-pointer transition-all group"
          >
            <span className="text-xs font-bold text-white opacity-80 group-hover:opacity-100">
              {opt}
            </span>
            {selected === opt && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d9ff00" strokeWidth="4">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImageStudio({ apiKey, onGenerationComplete, historyItems }) {
  // ── Model / mode state ──────────────────────────────────────────────────
  const [imageMode, setImageMode] = useState(false); // false=t2i, true=i2i
  const [selectedModelId, setSelectedModelId] = useState(t2iModels[0].id);
  const [selectedModelName, setSelectedModelName] = useState(t2iModels[0].name);
  const [selectedAr, setSelectedAr] = useState(
    t2iModels[0].inputs?.aspect_ratio?.default || "1:1"
  );
  const [selectedQuality, setSelectedQuality] = useState(() => {
    const resolutions = getResolutionsForModel(t2iModels[0].id);
    return resolutions[0] || null;
  });
  const [maxImages, setMaxImages] = useState(1);

  // ── Prompt / upload state ───────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);

  // ── UI state ────────────────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(null); // 'model' | 'ar' | 'quality' | null
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);

  // ── Canvas / history state ──────────────────────────────────────────────
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);
  const [localHistory, setLocalHistory] = useState([]); // [{id,url,prompt,model,aspect_ratio,timestamp}]

  // Use prop history if provided, otherwise local
  const history = historyItems ?? localHistory;

  // ── Refs ────────────────────────────────────────────────────────────────
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const uploadPickerResetRef = useRef(null); // not used directly — managed via key

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [dropdownOpen]);

  // ── Textarea auto-resize ─────────────────────────────────────────────────
  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const maxHeight = window.innerWidth < 768 ? 150 : 250;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  };

  // ── Derived: current model lists & helpers ───────────────────────────────
  const currentModels = imageMode ? i2iModels : t2iModels;
  const currentAspectRatios = imageMode
    ? getAspectRatiosForI2IModel(selectedModelId)
    : getAspectRatiosForModel(selectedModelId);
  const currentResolutions = imageMode
    ? getResolutionsForI2IModel(selectedModelId)
    : getResolutionsForModel(selectedModelId);
  const currentQualityField = imageMode
    ? getQualityFieldForI2IModel(selectedModelId)
    : getQualityFieldForModel(selectedModelId);
  const showQualityBtn = currentResolutions.length > 0;

  // ── Upload picker callbacks ──────────────────────────────────────────────
  const handleUploadSelect = useCallback(
    ({ url, urls }) => {
      const newUrls = urls || [url];
      setUploadedImageUrls(newUrls);

      if (!imageMode) {
        const firstI2I = i2iModels[0];
        const ars = getAspectRatiosForI2IModel(firstI2I.id);
        const resolutions = getResolutionsForI2IModel(firstI2I.id);
        setImageMode(true);
        setSelectedModelId(firstI2I.id);
        setSelectedModelName(firstI2I.name);
        setSelectedAr(ars[0] || "1:1");
        setSelectedQuality(resolutions[0] || null);
        setMaxImages(getMaxImagesForI2IModel(firstI2I.id));
      }
    },
    [imageMode]
  );

  const handleUploadClear = useCallback(() => {
    setUploadedImageUrls([]);
    setImageMode(false);
    const firstT2I = t2iModels[0];
    const ars = getAspectRatiosForModel(firstT2I.id);
    const resolutions = getResolutionsForModel(firstT2I.id);
    setSelectedModelId(firstT2I.id);
    setSelectedModelName(firstT2I.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    setMaxImages(1);
  }, []);

  // ── Model selection ──────────────────────────────────────────────────────
  const handleModelSelect = (m) => {
    const ars = imageMode
      ? getAspectRatiosForI2IModel(m.id)
      : getAspectRatiosForModel(m.id);
    const resolutions = imageMode
      ? getResolutionsForI2IModel(m.id)
      : getResolutionsForModel(m.id);
    setSelectedModelId(m.id);
    setSelectedModelName(m.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    if (imageMode) setMaxImages(getMaxImagesForI2IModel(m.id));
  };

  // ── History helpers ──────────────────────────────────────────────────────
  const addToHistory = useCallback(
    (entry) => {
      if (!historyItems) {
        setLocalHistory((prev) => [entry, ...prev.slice(0, 49)]);
      }
      setActiveHistoryIdx(0);
      setCurrentImageUrl(entry.url);
    },
    [historyItems]
  );

  // ── View state: 'prompt' | 'canvas' ─────────────────────────────────────
  const showCanvas = currentImageUrl !== null;

  const resetToPrompt = () => {
    setCurrentImageUrl(null);
    setPrompt("");
    setUploadedImageUrls([]);
    setImageMode(false);
    const firstT2I = t2iModels[0];
    const ars = getAspectRatiosForModel(firstT2I.id);
    const resolutions = getResolutionsForModel(firstT2I.id);
    setSelectedModelId(firstT2I.id);
    setSelectedModelName(firstT2I.name);
    setSelectedAr(ars[0] || "1:1");
    setSelectedQuality(resolutions[0] || null);
    setMaxImages(1);
  };

  // ── Generation ───────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (generating) return;

    if (imageMode) {
      if (uploadedImageUrls.length === 0) {
        alert("Please upload a reference image first.");
        return;
      }
    } else {
      if (!prompt.trim()) {
        alert("Please enter a prompt to generate an image.");
        return;
      }
    }

    setGenerating(true);
    setGenerateError(null);

    try {
      let res;
      if (imageMode) {
        const genParams = {
          model: selectedModelId,
          images_list: uploadedImageUrls,
          image_url: uploadedImageUrls[0],
          aspect_ratio: selectedAr,
        };
        if (prompt.trim()) genParams.prompt = prompt.trim();
        if (currentQualityField && selectedQuality) {
          genParams[currentQualityField] = selectedQuality;
        }
        res = await generateI2I(apiKey, genParams);
      } else {
        const genParams = {
          model: selectedModelId,
          prompt: prompt.trim(),
          aspect_ratio: selectedAr,
        };
        if (currentQualityField && selectedQuality) {
          genParams[currentQualityField] = selectedQuality;
        }
        res = await generateImage(apiKey, genParams);
      }

      if (res && res.url) {
        const entry = {
          id: res.id || Date.now().toString(),
          url: res.url,
          prompt: prompt.trim(),
          model: selectedModelId,
          aspect_ratio: selectedAr,
          timestamp: new Date().toISOString(),
        };
        addToHistory(entry);
        onGenerationComplete?.({
          url: res.url,
          model: selectedModelId,
          prompt: prompt.trim(),
          type: "image",
        });
      } else {
        throw new Error("No image URL returned by API");
      }
    } catch (e) {
      console.error("[ImageStudio] Generation failed:", e);
      setGenerateError(e.message.slice(0, 80));
      setTimeout(() => setGenerateError(null), 4000);
    } finally {
      setGenerating(false);
    }
  };

  const placeholderText =
    uploadedImageUrls.length > 1
      ? `${uploadedImageUrls.length} images selected — describe the transformation (optional)`
      : imageMode
      ? "Describe how to transform this image (optional)"
      : "Describe the image you want to create";

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-y-auto custom-scrollbar overflow-x-hidden">

      {/* ── CANVAS VIEW ─────────────────────────────────────────────────── */}
      {showCanvas && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 min-[800px]:p-16 z-10">
          {/* History sidebar */}
          {history.length > 0 && (
            <div className="fixed right-0 top-0 h-full w-20 md:w-24 bg-black/60 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col items-center py-4 gap-3 overflow-y-auto">
              <div className="text-[9px] font-bold text-muted uppercase tracking-widest mb-2">
                History
              </div>
              <div className="flex flex-col gap-2 w-full px-2">
                {history.map((entry, idx) => (
                  <div
                    key={entry.id || idx}
                    onClick={() => {
                      setCurrentImageUrl(entry.url);
                      setActiveHistoryIdx(idx);
                    }}
                    className={`relative group/thumb cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                      idx === activeHistoryIdx
                        ? "border-primary shadow-glow"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <img
                      src={entry.url}
                      alt={entry.prompt?.substring(0, 30) || "Generated"}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1">
                      <button
                        type="button"
                        title="Download"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadImage(entry.url, `kie-${entry.id || idx}.jpg`);
                        }}
                        className="p-1.5 bg-primary rounded-lg text-black hover:scale-110 transition-transform"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Main image */}
          <div className="relative group">
            <img
              src={currentImageUrl}
              alt={history[activeHistoryIdx]?.prompt || "Generated image"}
              className="max-h-[60vh] max-w-[80vw] rounded-3xl shadow-3xl border border-white/10 interactive-glow object-contain"
            />
          </div>

          {/* Canvas controls */}
          <div className="mt-6 flex gap-3 justify-center">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white disabled:opacity-50"
            >
              ↻ Regenerate
            </button>
            <button
              type="button"
              onClick={() => {
                const entry = history[activeHistoryIdx];
                downloadImage(currentImageUrl, `kie-${entry?.id || "image"}.jpg`);
              }}
              className="bg-primary text-black px-6 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-glow active:scale-95"
            >
              ↓ Download
            </button>
            <button
              type="button"
              onClick={resetToPrompt}
              className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white"
            >
              + New
            </button>
          </div>
        </div>
      )}

      {/* ── PROMPT VIEW ─────────────────────────────────────────────────── */}
      {!showCanvas && (
        <>
          {/* Hero */}
          <div className="flex flex-col items-center mb-10 md:mb-20 animate-fade-in-up transition-all duration-700">
            <div className="mb-10 relative group">
              <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000" />
              <div className="relative w-24 h-24 md:w-32 md:h-32 bg-teal-900/40 rounded-3xl flex items-center justify-center border border-white/5 overflow-hidden">
                <svg
                  width="80"
                  height="80"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-primary opacity-20 absolute -right-4 -bottom-4"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                </svg>
                <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-glow relative z-10">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-primary"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
                <div className="absolute top-4 right-4 text-primary animate-pulse">✨</div>
              </div>
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-7xl font-black text-white tracking-widest uppercase mb-4 selection:bg-primary selection:text-black text-center px-4">
              Image Studio
            </h1>
            <p className="text-secondary text-sm font-medium tracking-wide opacity-60">
              Transform images with AI — upscale, stylize, animate and more
            </p>
          </div>

          {/* Prompt bar */}
          <div className="w-full max-w-4xl relative z-40 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
            <div className="w-full bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2.5rem] p-3 md:p-5 flex flex-col gap-3 md:gap-5 shadow-3xl">

              {/* Top row: upload picker + textarea */}
              <div className="flex items-start gap-5 px-2">
                <UploadButton
                  apiKey={apiKey}
                  maxImages={maxImages}
                  onSelect={handleUploadSelect}
                  onClear={handleUploadClear}
                />
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onInput={handleTextareaInput}
                  placeholder={placeholderText}
                  rows={1}
                  className="flex-1 bg-transparent border-none text-white text-base md:text-xl placeholder:text-muted focus:outline-none resize-none pt-2.5 leading-relaxed min-h-[40px] max-h-[150px] md:max-h-[250px] overflow-y-auto custom-scrollbar"
                />
              </div>

              {/* Bottom row: controls + generate */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 px-2 pt-4 border-t border-white/5 relative">

                {/* Left controls */}
                <div className="flex items-center gap-1.5 md:gap-2.5 relative flex-wrap pb-1 md:pb-0">

                  {/* Model button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpen((o) => (o === "model" ? null : "model"));
                      }}
                      className="flex items-center gap-1.5 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap"
                    >
                      <div className="w-5 h-5 bg-primary rounded-md flex items-center justify-center shadow-lg shadow-primary/20">
                        <span className="text-[10px] font-black text-black">G</span>
                      </div>
                      <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                        {selectedModelName}
                      </span>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="opacity-20 group-hover:opacity-100 transition-opacity"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>

                    {dropdownOpen === "model" && (
                      <div
                        ref={dropdownRef}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-[calc(100%+8px)] left-0 z-50 bg-[#111] rounded-3xl p-3 shadow-4xl border border-white/10 w-[calc(100vw-3rem)] max-w-xs"
                      >
                        <ModelDropdown
                          models={currentModels}
                          selectedModel={selectedModelId}
                          onSelect={handleModelSelect}
                          onClose={() => setDropdownOpen(null)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Aspect ratio button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDropdownOpen((o) => (o === "ar" ? null : "ar"));
                      }}
                      className="flex items-center gap-1.5 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="opacity-60 text-secondary"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      </svg>
                      <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                        {selectedAr}
                      </span>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        className="opacity-20 group-hover:opacity-100 transition-opacity"
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>

                    {dropdownOpen === "ar" && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-[calc(100%+8px)] left-0 z-50 bg-[#111] rounded-3xl p-3 shadow-4xl border border-white/10 max-w-[240px]"
                      >
                        <SimpleDropdown
                          title="Aspect Ratio"
                          options={currentAspectRatios}
                          selected={selectedAr}
                          onSelect={(val) => setSelectedAr(val)}
                          onClose={() => setDropdownOpen(null)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Quality/resolution button */}
                  {showQualityBtn && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDropdownOpen((o) => (o === "quality" ? null : "quality"));
                        }}
                        className="flex items-center gap-1.5 md:gap-2.5 px-3 md:px-4 py-2 md:py-2.5 bg-white/5 hover:bg-white/10 rounded-xl md:rounded-2xl transition-all border border-white/5 group whitespace-nowrap"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="opacity-60 text-secondary"
                        >
                          <path d="M6 2L3 6v15a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z" />
                        </svg>
                        <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                          {selectedQuality || currentResolutions[0]}
                        </span>
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="4"
                          className="opacity-20 group-hover:opacity-100 transition-opacity"
                        >
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>

                      {dropdownOpen === "quality" && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute bottom-[calc(100%+8px)] left-0 z-50 bg-[#111] rounded-3xl p-3 shadow-4xl border border-white/10 max-w-[200px]"
                        >
                          <SimpleDropdown
                            title="Resolution"
                            options={currentResolutions}
                            selected={selectedQuality}
                            onSelect={(val) => setSelectedQuality(val)}
                            onClose={() => setDropdownOpen(null)}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Generate button */}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="bg-primary text-black px-6 md:px-8 py-3 md:py-3.5 rounded-xl md:rounded-[1.5rem] font-black text-sm md:text-base hover:shadow-glow hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2.5 w-full sm:w-auto shadow-lg disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {generating ? (
                    <>
                      <span className="animate-spin inline-block text-black">◌</span>
                      Generating...
                    </>
                  ) : generateError ? (
                    `Error: ${generateError}`
                  ) : (
                    "Generate ✨"
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
