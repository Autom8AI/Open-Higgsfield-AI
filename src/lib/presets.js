// Prompt presets shared by the studios. Each preset is a short label plus the
// text appended to the user's prompt when it is used.

// Camera moves for video generation.
export const CAMERA_PRESETS = [
    { id: 'none', label: 'Auto', text: '' },
    { id: 'static', label: 'Static', text: 'Locked-off static camera, no camera movement.' },
    { id: 'dolly-in', label: 'Dolly in', text: 'Slow, smooth dolly-in toward the subject.' },
    { id: 'dolly-out', label: 'Dolly out', text: 'Slow dolly-out pulling back to reveal the scene.' },
    { id: 'crash-zoom', label: 'Crash zoom', text: 'Sudden fast crash zoom into the subject.' },
    { id: 'orbit', label: 'Orbit 360', text: 'Camera orbits smoothly around the subject in a full circle.' },
    { id: 'arc', label: 'Arc left', text: 'Camera arcs slowly to the left around the subject.' },
    { id: 'crane-up', label: 'Crane up', text: 'Crane shot rising up and over the scene.' },
    { id: 'crane-down', label: 'Crane down', text: 'Crane shot descending down toward the subject.' },
    { id: 'tracking', label: 'Tracking', text: 'Tracking shot following alongside the subject as it moves.' },
    { id: 'follow', label: 'Follow behind', text: 'Camera follows closely behind the subject.' },
    { id: 'fpv', label: 'FPV drone', text: 'Fast, swooping FPV drone flight through the scene.' },
    { id: 'aerial', label: 'Aerial', text: 'High aerial drone shot slowly gliding over the scene.' },
    { id: 'handheld', label: 'Handheld', text: 'Handheld camera with natural, subtle shake.' },
    { id: 'whip-pan', label: 'Whip pan', text: 'Quick whip pan to the subject with motion blur.' },
    { id: 'pan-left', label: 'Pan left', text: 'Smooth horizontal pan to the left.' },
    { id: 'pan-right', label: 'Pan right', text: 'Smooth horizontal pan to the right.' },
    { id: 'tilt-up', label: 'Tilt up', text: 'Camera tilts up from the ground to the subject.' },
    { id: 'tilt-down', label: 'Tilt down', text: 'Camera tilts down from the sky to the subject.' },
    { id: 'bullet-time', label: 'Bullet time', text: 'Bullet-time effect: action frozen while the camera sweeps around the subject.' },
    { id: 'push-focus', label: 'Rack focus', text: 'Rack focus shifting from the foreground to the subject.' },
    { id: 'dutch', label: 'Dutch angle', text: 'Tilted dutch-angle framing with slow movement.' },
    { id: 'pov', label: 'POV', text: 'First-person point-of-view camera.' },
    { id: 'low-angle', label: 'Low angle', text: 'Low-angle hero shot looking up at the subject, slow push-in.' },
    { id: 'top-down', label: 'Top down', text: 'Overhead top-down shot slowly rotating.' },
    { id: 'zoom-out', label: 'Zoom out', text: 'Slow zoom out revealing the wider environment.' },
];

// Whole-video looks for Remix (video edit). Applied as an edit instruction.
export const RESTYLE_PRESETS = [
    { id: 'cel', label: 'Cel animation', text: 'hand-painted 2D cel animation' },
    { id: 'felt', label: 'Felt stop-motion', text: 'felt puppet stop-motion animation' },
    { id: 'retro3d', label: 'Retro game 3D', text: 'retro 1990s video-game 3D graphics with low-poly models' },
    { id: 'clay', label: 'Claymation', text: 'claymation with visible fingerprints and handmade texture' },
    { id: 'anime', label: 'Anime', text: 'modern anime with clean line art and vivid colours' },
    { id: 'comic', label: 'Comic book', text: 'bold comic-book illustration with halftone shading and ink outlines' },
    { id: 'watercolor', label: 'Watercolour', text: 'soft watercolour painting' },
    { id: 'pixel', label: 'Pixel art', text: '16-bit pixel art' },
    { id: 'oil', label: 'Oil painting', text: 'textured oil painting with visible brush strokes' },
    { id: 'lego', label: 'Toy bricks', text: 'plastic toy-brick world' },
    { id: 'cyberpunk', label: 'Neon cyberpunk', text: 'neon-lit cyberpunk night scene' },
    { id: 'noir', label: 'Film noir', text: 'black-and-white film noir with hard shadows' },
    { id: 'vintage', label: 'Vintage film', text: '1970s vintage film with grain and warm faded colours' },
    { id: 'sketch', label: 'Pencil sketch', text: 'animated pencil sketch on paper' },
];

export const restyleInstruction = (preset) =>
    `Restyle the entire video as ${preset.text}. Keep the original motion, timing, camera movement and composition.`;
