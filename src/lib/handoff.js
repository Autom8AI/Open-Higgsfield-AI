// Passes a Library item to a studio: "make a video from this image", "edit
// this image", or "redo with the same prompt and settings". The studio takes
// it once when it opens.
let pending = null;

export function sendTo(target, data) {
    pending = { target, ...data };
    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: `${target}-create` } }));
}

export function takeHandoff(target) {
    if (!pending || pending.target !== target) return null;
    const h = pending;
    pending = null;
    return h;
}
