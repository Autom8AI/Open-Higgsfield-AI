// Auto-generated from data/models.json
export const t2iModels = [
  {
    "id": "gpt-image-2-text-to-image",
    "label": "GPT Image 2",
    "kind": "image",
    "api": "jobs",
    "blurb": "Strong prompt adherence and legible text.",
    "aspects": [
      "auto",
      "1:1",
      "3:2",
      "2:3",
      "4:3",
      "3:4",
      "5:4",
      "4:5",
      "16:9",
      "9:16",
      "2:1",
      "1:2",
      "3:1",
      "1:3",
      "21:9",
      "9:21"
    ],
    "resolutions": [
      "1K",
      "2K",
      "4K"
    ],
    "resolutionDefault": null
  },
  {
    "id": "google/nano-banana",
    "label": "Nano Banana",
    "kind": "image",
    "api": "jobs",
    "blurb": "Text-to-image only.",
    "aspects": [
      "1:1",
      "9:16",
      "16:9",
      "3:4",
      "4:3",
      "3:2",
      "2:3",
      "5:4",
      "4:5",
      "21:9",
      "auto"
    ]
  },
  {
    "id": "ideogram/v3-text-to-image",
    "label": "Ideogram v3",
    "kind": "image",
    "api": "jobs",
    "blurb": "The only image model with a real style parameter.",
    "styleEnum": [
      "AUTO",
      "GENERAL",
      "REALISTIC",
      "DESIGN"
    ]
  }
];
export const i2iModels = [
  {
    "id": "nano-banana-pro",
    "label": "Nano Banana Pro",
    "kind": "image",
    "api": "jobs",
    "blurb": "Highest-fidelity Nano Banana. Edits or text-to-image.",
    "images": {
      "param": "image_input",
      "max": 14,
      "required": false
    },
    "aspects": [
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9",
      "auto"
    ],
    "resolutions": [
      "1K",
      "2K",
      "4K"
    ],
    "resolutionDefault": "1K"
  },
  {
    "id": "nano-banana-2",
    "label": "Nano Banana 2",
    "kind": "image",
    "api": "jobs",
    "blurb": "Best all-round. Text-to-image, or supply references to edit.",
    "images": {
      "param": "image_input",
      "max": 14,
      "required": false
    },
    "aspects": [
      "1:1",
      "1:4",
      "1:8",
      "2:3",
      "3:2",
      "3:4",
      "4:1",
      "4:3",
      "4:5",
      "5:4",
      "8:1",
      "9:16",
      "16:9",
      "21:9",
      "auto"
    ],
    "resolutions": [
      "1K",
      "2K",
      "4K"
    ],
    "resolutionDefault": "1K"
  },
  {
    "id": "nano-banana-2-lite",
    "label": "Nano Banana 2 Lite",
    "kind": "image",
    "api": "jobs",
    "blurb": "Cheaper, faster Nano Banana 2.",
    "images": {
      "param": "image_urls",
      "max": 10,
      "required": false
    },
    "aspects": [
      "1:1",
      "1:4",
      "1:8",
      "2:3",
      "3:2",
      "3:4",
      "4:1",
      "4:3",
      "4:5",
      "5:4",
      "8:1",
      "9:16",
      "16:9",
      "21:9",
      "auto"
    ]
  },
  {
    "id": "gpt-image-2-image-to-image",
    "label": "GPT Image 2 — Edit",
    "kind": "image",
    "api": "jobs",
    "blurb": "Edits an uploaded photo. Legible text.",
    "images": {
      "param": "input_urls",
      "max": 10,
      "required": false
    },
    "aspects": [
      "auto",
      "1:1",
      "3:2",
      "2:3",
      "4:3",
      "3:4",
      "5:4",
      "4:5",
      "16:9",
      "9:16",
      "2:1",
      "1:2",
      "3:1",
      "1:3",
      "21:9",
      "9:21"
    ],
    "resolutions": [
      "1K",
      "2K",
      "4K"
    ],
    "resolutionDefault": null
  },
  {
    "id": "google/nano-banana-edit",
    "label": "Nano Banana Edit",
    "kind": "image",
    "api": "jobs",
    "blurb": "Cheapest edit model.",
    "images": {
      "param": "image_urls",
      "max": 10,
      "required": false
    },
    "aspects": [
      "1:1",
      "9:16",
      "16:9",
      "3:4",
      "4:3",
      "3:2",
      "2:3",
      "5:4",
      "4:5",
      "21:9",
      "auto"
    ]
  }
];
export const t2vModels = [
  {
    "id": "bytedance/seedance-2",
    "label": "Seedance 2.0",
    "kind": "video",
    "api": "jobs",
    "blurb": "Flagship video. Billed per second.",
    "images": {
      "param": "reference_image_urls",
      "max": 10,
      "required": false
    },
    "aspects": [
      "1:1",
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "21:9",
      "adaptive"
    ],
    "resolutions": [
      "480p",
      "720p",
      "1080p",
      "4k"
    ],
    "resolutionDefault": "720p",
    "hasDuration": true
  },
  {
    "id": "bytedance/seedance-2-fast",
    "label": "Seedance 2.0 Fast",
    "kind": "video",
    "api": "jobs",
    "blurb": "Faster Seedance 2 tier.",
    "images": {
      "param": "reference_image_urls",
      "max": 10,
      "required": false
    },
    "aspects": [
      "1:1",
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "21:9",
      "adaptive"
    ],
    "resolutions": [
      "480p",
      "720p"
    ],
    "resolutionDefault": "720p",
    "hasDuration": true
  },
  {
    "id": "bytedance/seedance-1.5-pro",
    "label": "Seedance 1.5 Pro",
    "kind": "video",
    "api": "jobs",
    "blurb": "Cinematic, with audio.",
    "images": {
      "param": "input_urls",
      "max": 10,
      "required": false
    },
    "aspects": [
      "1:1",
      "4:3",
      "3:4",
      "16:9",
      "9:16",
      "21:9"
    ],
    "resolutions": [
      "480p",
      "720p",
      "1080p"
    ],
    "resolutionDefault": "720p",
    "hasDuration": true
  },
  {
    "id": "kling-3.0/video",
    "label": "Kling 3.0",
    "kind": "video",
    "api": "jobs",
    "blurb": "First/last frame control.",
    "images": {
      "param": "image_urls",
      "max": 10,
      "required": false
    },
    "aspects": [
      "16:9",
      "9:16",
      "1:1"
    ],
    "hasDuration": true
  },
  {
    "id": "kling/v3-turbo-text-to-video",
    "label": "Kling 3 Turbo",
    "kind": "video",
    "api": "jobs",
    "blurb": "Faster Kling tier.",
    "aspects": [
      "1:1",
      "9:16",
      "16:9"
    ],
    "resolutions": [
      "720p",
      "1080p"
    ],
    "resolutionDefault": "720p",
    "hasDuration": true
  },
  {
    "id": "wan/2-5-text-to-video",
    "label": "Wan 2.5",
    "kind": "video",
    "api": "jobs",
    "blurb": "Open-source video.",
    "aspects": [
      "16:9",
      "9:16",
      "1:1"
    ],
    "resolutions": [
      "720p",
      "1080p"
    ],
    "resolutionDefault": null,
    "hasDuration": true
  },
  {
    "id": "happyhorse-1-1/text-to-video",
    "label": "HappyHorse 1.1",
    "kind": "video",
    "api": "jobs",
    "blurb": "The only video model that supports 4:5.",
    "aspects": [
      "16:9",
      "9:16",
      "1:1",
      "4:3",
      "3:4",
      "4:5",
      "5:4",
      "9:21",
      "21:9"
    ],
    "resolutions": [
      "720p",
      "1080p"
    ],
    "resolutionDefault": "1080p",
    "hasDuration": true
  },
  {
    "id": "happyhorse-1-1/reference-to-video",
    "label": "HappyHorse 1.1 — Reference",
    "kind": "video",
    "api": "jobs",
    "blurb": "Reference-driven. Supports 4:5.",
    "aspects": [
      "16:9",
      "9:16",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "1:1",
      "9:21",
      "21:9"
    ],
    "resolutions": [
      "720p",
      "1080p"
    ],
    "resolutionDefault": "1080p",
    "hasDuration": true
  }
];
export const i2vModels = [];
export const v2vModels = [];
export const lipsyncModels = [
  {
    "id": "wan/2-2-a14b-speech-to-video-turbo",
    "label": "Wan 2.2 Speech-to-Video Turbo",
    "kind": "talk",
    "api": "jobs",
    "blurb": "Only lip-sync model with a real motion knob (guidance_scale) and a negative prompt.",
    "portrait": "image_url",
    "audio": "audio_url",
    "resolutionField": "resolution",
    "resolutions": [
      "480p",
      "580p",
      "720p"
    ],
    "resolutionDefault": "480p",
    "guidance": [
      1.5,
      7
    ],
    "fields": []
  },
  {
    "id": "kling/ai-avatar-pro",
    "label": "Kling AI Avatar — Pro",
    "kind": "talk",
    "api": "jobs",
    "blurb": "Highest realism and facial detail. Audio up to 5 minutes.",
    "portrait": "image_url",
    "audio": "audio_url",
    "promptRequired": true,
    "fields": [],
    "audioMaxSeconds": 300
  },
  {
    "id": "omnihuman-1-5",
    "label": "OmniHuman 1.5",
    "kind": "talk",
    "api": "jobs",
    "blurb": "ByteDance. Natural upper-body motion. Audio under 60 seconds.",
    "portrait": "image_url",
    "audio": "audio_url",
    "fields": [
      {
        "name": "output_resolution",
        "label": "Resolution",
        "type": "select",
        "options": [
          "720",
          "1080"
        ],
        "default": "1080"
      }
    ],
    "resolutionField": "output_resolution",
    "resolutions": [
      "720",
      "1080"
    ],
    "resolutionDefault": "1080",
    "audioMaxSeconds": 60
  },
  {
    "id": "kling/ai-avatar-standard",
    "label": "Kling AI Avatar — Standard",
    "kind": "talk",
    "api": "jobs",
    "blurb": "Cheaper Kling tier. Stable lip-sync, less facial detail.",
    "portrait": "image_url",
    "audio": "audio_url",
    "promptRequired": true,
    "fields": [],
    "audioMaxSeconds": 300
  },
  {
    "id": "infinitalk/from-audio",
    "label": "InfiniteTalk",
    "kind": "talk",
    "api": "jobs",
    "blurb": "Open-source. Long-form talking video from one portrait.",
    "portrait": "image_url",
    "audio": "audio_url",
    "fields": [
      {
        "name": "resolution",
        "label": "Resolution",
        "type": "select",
        "options": [
          "480p",
          "720p"
        ],
        "default": "480p"
      }
    ],
    "resolutionField": "resolution",
    "resolutions": [
      "480p",
      "720p"
    ],
    "resolutionDefault": "480p"
  }
];

export function getModelById(id) { return [t2iModels, i2iModels].flat().find(m => m.id === id); }
export function getVideoModelById(id) { return [t2vModels, i2vModels, v2vModels].flat().find(m => m.id === id); }
export function getI2IModelById(id) { return i2iModels.find(m => m.id === id); }
export function getI2VModelById(id) { return i2vModels.find(m => m.id === id); }
export function getLipSyncModelById(id) { return lipsyncModels.find(m => m.id === id); }

export function getAspectRatiosForModel(modelId) {
  const m = getModelById(modelId);
  return m?.aspects || ['1:1'];
}
export function getResolutionsForModel(modelId) {
  const m = getModelById(modelId);
  return m?.resolutions || [];
}
export function getQualityFieldForModel(modelId) {
  const m = getModelById(modelId);
  return m?.resolutionField || 'quality';
}

export function getAspectRatiosForI2IModel(modelId) {
  const m = i2iModels.find(x => x.id === modelId);
  return m?.aspects || ['1:1'];
}
export function getResolutionsForI2IModel(modelId) {
  const m = i2iModels.find(x => x.id === modelId);
  return m?.resolutions || [];
}
export function getQualityFieldForI2IModel(modelId) {
  const m = i2iModels.find(x => x.id === modelId);
  return m?.resolutionField || 'quality';
}
export function getMaxImagesForI2IModel(modelId) {
  const m = i2iModels.find(x => x.id === modelId);
  return m?.images?.max || 1;
}

export function getAspectRatiosForVideoModel(modelId) {
  const m = getVideoModelById(modelId);
  return m?.aspects || ['16:9'];
}
export function getDurationsForModel(modelId) {
  const m = getVideoModelById(modelId);
  return m?.durations || [];
}
export function getResolutionsForVideoModel(modelId) {
  const m = getVideoModelById(modelId);
  return m?.resolutions || [];
}

export function getAspectRatiosForI2VModel(modelId) {
  const m = i2vModels.find(x => x.id === modelId);
  return m?.aspects || ['16:9'];
}
export function getDurationsForI2VModel(modelId) {
  const m = i2vModels.find(x => x.id === modelId);
  return m?.durations || [];
}
export function getResolutionsForI2VModel(modelId) {
  const m = i2vModels.find(x => x.id === modelId);
  return m?.resolutions || [];
}

export function getModesForModel(modelId) {
  const m = getVideoModelById(modelId);
  return m?.modes || [];
}

export function getResolutionsForLipSyncModel(modelId) {
  const m = getLipSyncModelById(modelId);
  return m?.resolutions || [];
}
