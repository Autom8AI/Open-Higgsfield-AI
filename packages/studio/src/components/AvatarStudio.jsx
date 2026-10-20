"use client";

import { useState, useRef, useCallback } from "react";
import { generateI2I, uploadFile } from "../kie.js";
import { getAspectRatiosForI2IModel, getResolutionsForI2IModel } from "../models.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const AVATAR_MODEL_ID = "nano-banana-pro-edit";

const AVATAR_STYLES = [
  {
    name: "3D Pixar",
    prompt:
      "Reimagine this person as a 3D Pixar/Disney-style animated character: big expressive eyes, smooth stylized skin, vibrant colors, soft cinematic studio lighting.",
  },
  {
    name: "Anime",
    prompt:
      "Reimagine this person as a Japanese anime character: clean line art, cel-shaded coloring, expressive anime-style eyes, vibrant hair highlights.",
  },
  {
    name: "Studio Ghibli",
    prompt:
      "Reimagine this person in a Studio Ghibli watercolor illustration style: soft pastel tones, hand-painted background, gentle warm lighting.",
  },
  {
    name: "Cyberpunk",
    prompt:
      "Reimagine this person as a cyberpunk character portrait: neon rim lighting, futuristic techwear, glowing accents, moody night-city backdrop.",
  },
  {
    name: "Fantasy Art",
    prompt:
      "Reimagine this person as an epic fantasy character: painterly digital art style, dramatic rim lighting, ornate armor or flowing robes.",
  },
  {
    name: "Pop Art",
    prompt:
      "Reimagine this person in a bold pop art style: halftone dot shading, high-contrast comic-book coloring, thick black outlines.",
  },
  {
    name: "Watercolor",
    prompt:
      "Reimagine this person as a delicate watercolor portrait painting: soft flowing brushstrokes, visible paper texture, muted color palette.",
  },
  {
    name: "Professional Headshot",
    prompt:
      "Retouch this into a professional corporate headshot: even studio lighting, neutral seamless background, sharp focus, polished business attire.",
  },
  {
    name: "Pixel Art",
    prompt:
      "Reimagine this person as a retro 16-bit pixel art character portrait: limited color palette, crisp pixel edges, video-game character-select vibe.",
  },
  {
    name: "Claymation",
    prompt:
      "Reimagine this person as a claymation stop-motion character: sculpted clay texture, visible fingerprint detail, soft matte studio lighting.",
  },
];

const IDENTITY_GUARD =
  "Keep the person's facial identity, proportions, and expression clearly recognizable throughout the transformation.";

function buildAvatarPrompt(stylePrompt, extraNotes) {
  const parts = [stylePrompt, IDENTITY_GUARD];
  if (extraNotes && extraNotes.trim()) parts.push(extraNotes.trim());
  return parts.join(" ");
}

// ─── Upload slot ────────────────────────────────────────────────────────────────

function AvatarUploadSlot({ imageUrl, uploading, progress, onFileSelected, onClear }) {
  const inputRef = useRef(null);

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("Image is too large (max 10MB).");
      return;
    }
    onFileSelected(file);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleChange} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-40 h-40 md:w-52 md:h-52 rounded-3xl border-2 border-dashed border-white/15 hover:border-primary/60 bg-white/5 hover:bg-white/10 transition-all flex items-center justify-center overflow-hidden group"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Uploaded portrait"
            className={`w-full h-full object-cover transition-all ${uploading ? "opacity-40 blur-[2px]" : "opacity-100"}`}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-white/40 group-hover:text-primary transition-colors">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-xs font-bold uppercase tracking-wide">Upload a photo</span>
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-1" />
            <span className="text-xs font-black text-primary">{progress}%</span>
          </div>
        )}
      </button>
      {imageUrl && !uploading && (
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-bold text-white/40 hover:text-red-400 transition-colors uppercase tracking-wide"
        >
          Remove photo
        </button>
      )}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────

export default function AvatarStudio({ apiKey, onGenerationComplete, historyItems, onAnimateAvatar }) {
  // ── Upload state ──
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // ── Style / options state ──
  const [selectedStyle, setSelectedStyle] = useState(AVATAR_STYLES[0].name);
  const [extraNotes, setExtraNotes] = useState("");
  const [aspectRatio, setAspectRatio] = useState(
    getAspectRatiosForI2IModel(AVATAR_MODEL_ID)[0] || "1:1"
  );
  const [resolution, setResolution] = useState(
    getResolutionsForI2IModel(AVATAR_MODEL_ID)[0] || "1k"
  );
  const [openDropdown, setOpenDropdown] = useState(null); // 'ar' | 'res' | null

  // ── Generation / canvas state ──
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [canvasUrl, setCanvasUrl] = useState(null);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);
  const [internalHistory, setInternalHistory] = useState([]);

  const history = historyItems ?? internalHistory;
  const aspectRatioOptions = getAspectRatiosForI2IModel(AVATAR_MODEL_ID);
  const resolutionOptions = getResolutionsForI2IModel(AVATAR_MODEL_ID);

  const handleFileSelected = useCallback(
    async (file) => {
      setUploading(true);
      setUploadProgress(0);
      try {
        const url = await uploadFile(apiKey, file, setUploadProgress);
        setUploadedImageUrl(url);
      } catch (err) {
        alert(`Upload failed: ${err.message}`);
      } finally {
        setUploading(false);
      }
    },
    [apiKey]
  );

  const handleClearUpload = useCallback(() => {
    setUploadedImageUrl(null);
  }, []);

  const handleGenerate = async () => {
    if (generating || uploading) return;
    if (!uploadedImageUrl) {
      alert("Please upload a photo first.");
      return;
    }
    const style = AVATAR_STYLES.find((s) => s.name === selectedStyle) || AVATAR_STYLES[0];

    setGenerating(true);
    setGenerateError(null);

    try {
      const res = await generateI2I(apiKey, {
        model: AVATAR_MODEL_ID,
        image_url: uploadedImageUrl,
        images_list: [uploadedImageUrl],
        prompt: buildAvatarPrompt(style.prompt, extraNotes),
        aspect_ratio: aspectRatio,
        resolution,
      });

      if (res && res.url) {
        const entry = {
          id: res.id || Date.now().toString(),
          url: res.url,
          style: style.name,
          sourceUrl: uploadedImageUrl,
          timestamp: new Date().toISOString(),
        };
        if (!historyItems) setInternalHistory((prev) => [entry, ...prev.slice(0, 49)]);
        setActiveHistoryIdx(0);
        setCanvasUrl(res.url);
        onGenerationComplete?.({ url: res.url, model: AVATAR_MODEL_ID, prompt: style.name, type: "avatar" });
      } else {
        throw new Error("No image URL returned by API");
      }
    } catch (e) {
      console.error("[AvatarStudio] Generation failed:", e);
      setGenerateError(e.message.slice(0, 80));
      setTimeout(() => setGenerateError(null), 4000);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerate = () => {
    setCanvasUrl(null);
    setTimeout(() => handleGenerate(), 50);
  };

  const resetToPrompt = () => {
    setCanvasUrl(null);
  };

  const downloadImage = async (url, filename) => {
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
    } catch (err) {
      console.warn("[AvatarStudio] Direct download failed, falling back to window.open", err);
      window.open(url, "_blank");
    }
  };

  const showCanvas = canvasUrl !== null;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-y-auto custom-scrollbar overflow-x-hidden">
      {/* ── CANVAS VIEW ── */}
      {showCanvas && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 min-[800px]:p-16 z-10">
          {history.length > 0 && (
            <div className="fixed right-0 top-0 h-full w-20 md:w-24 bg-black/60 backdrop-blur-xl border-l border-white/5 z-50 flex flex-col items-center py-4 gap-3 overflow-y-auto">
              <div className="text-[9px] font-bold text-muted uppercase tracking-widest mb-2">History</div>
              <div className="flex flex-col gap-2 w-full px-2">
                {history.map((entry, idx) => (
                  <div
                    key={entry.id || idx}
                    onClick={() => {
                      setCanvasUrl(entry.url);
                      setActiveHistoryIdx(idx);
                    }}
                    className={`relative group/thumb cursor-pointer rounded-xl overflow-hidden border-2 transition-all duration-300 ${
                      idx === activeHistoryIdx ? "border-primary shadow-glow" : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <img src={entry.url} alt={entry.style || "Generated avatar"} className="w-full aspect-square object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="relative group">
            <img
              src={canvasUrl}
              alt="Generated avatar"
              className="max-h-[60vh] max-w-[80vw] rounded-3xl shadow-3xl border border-white/10 interactive-glow object-contain"
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={generating}
              className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white disabled:opacity-50"
            >
              ↻ Regenerate
            </button>
            <button
              type="button"
              onClick={() => downloadImage(canvasUrl, `avatar-${selectedStyle.toLowerCase().replace(/\s+/g, "-")}.jpg`)}
              className="bg-primary text-black px-6 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-glow active:scale-95"
            >
              ↓ Download
            </button>
            {onAnimateAvatar && (
              <button
                type="button"
                onClick={() => onAnimateAvatar(canvasUrl)}
                className="bg-white/10 hover:bg-white/20 px-6 py-2.5 rounded-2xl text-xs font-bold transition-all border border-white/5 backdrop-blur-lg text-white"
                title="Send this avatar to Lip Sync Studio to make it talk"
              >
                🎬 Animate as Talking Avatar
              </button>
            )}
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

      {/* ── PROMPT VIEW ── */}
      {!showCanvas && (
        <>
          <div className="flex flex-col items-center mb-8 md:mb-12 animate-fade-in-up">
            <h1 className="text-2xl sm:text-4xl md:text-6xl font-black text-white tracking-widest uppercase mb-3 text-center px-4">
              Avatar Studio
            </h1>
            <p className="text-secondary text-sm font-medium tracking-wide opacity-60 text-center px-4">
              Upload a photo, pick a style, get a stylized avatar
            </p>
          </div>

          <div className="w-full max-w-3xl bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-[2rem] p-5 md:p-8 flex flex-col gap-6 shadow-3xl animate-fade-in-up">
            {/* Upload */}
            <div className="flex justify-center">
              <AvatarUploadSlot
                imageUrl={uploadedImageUrl}
                uploading={uploading}
                progress={uploadProgress}
                onFileSelected={handleFileSelected}
                onClear={handleClearUpload}
              />
            </div>

            {/* Style grid */}
            <div>
              <div className="text-[10px] font-bold text-secondary uppercase tracking-widest mb-3 text-center">
                Choose a style
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {AVATAR_STYLES.map((style) => (
                  <button
                    key={style.name}
                    type="button"
                    onClick={() => setSelectedStyle(style.name)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                      selectedStyle === style.name
                        ? "bg-primary text-black border-primary shadow-glow-sm"
                        : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {style.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Extra notes */}
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder='Optional: add extra details (e.g. "add glasses", "blue background")'
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-muted focus:outline-none focus:border-primary/50 resize-none"
            />

            {/* Controls + generate */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 relative">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown((d) => (d === "ar" ? null : "ar"))}
                    className="flex items-center gap-2 px-3.5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 text-xs font-bold text-white"
                  >
                    {aspectRatio}
                  </button>
                  {openDropdown === "ar" && (
                    <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 bg-[#111] rounded-2xl p-2 shadow-4xl border border-white/10 max-w-[200px]">
                      {aspectRatioOptions.map((opt) => (
                        <div
                          key={opt}
                          onClick={() => {
                            setAspectRatio(opt);
                            setOpenDropdown(null);
                          }}
                          className="px-3 py-2 hover:bg-white/5 rounded-lg cursor-pointer text-xs font-bold text-white"
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {resolutionOptions.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenDropdown((d) => (d === "res" ? null : "res"))}
                      className="flex items-center gap-2 px-3.5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 text-xs font-bold text-white"
                    >
                      {resolution}
                    </button>
                    {openDropdown === "res" && (
                      <div className="absolute bottom-[calc(100%+8px)] left-0 z-50 bg-[#111] rounded-2xl p-2 shadow-4xl border border-white/10 max-w-[160px]">
                        {resolutionOptions.map((opt) => (
                          <div
                            key={opt}
                            onClick={() => {
                              setResolution(opt);
                              setOpenDropdown(null);
                            }}
                            className="px-3 py-2 hover:bg-white/5 rounded-lg cursor-pointer text-xs font-bold text-white"
                          >
                            {opt}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating || uploading || !uploadedImageUrl}
                className="bg-primary text-black px-8 py-3.5 rounded-[1.5rem] font-black text-sm hover:shadow-glow hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2.5 w-full sm:w-auto shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
              >
                {generating ? (
                  <>
                    <span className="animate-spin inline-block text-black">◌</span>
                    Generating...
                  </>
                ) : generateError ? (
                  `Error: ${generateError}`
                ) : (
                  "Generate Avatar ✨"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
