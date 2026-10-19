import { login } from '../lib/api.js';

export function BackendModal(onSuccess) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-sm px-6';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-md bg-panel-bg border border-white/10 rounded-3xl p-8 shadow-3xl animate-fade-in-up';

    modal.innerHTML = `
        <div class="flex flex-col items-center text-center mb-8">
            <div class="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center border border-primary/20 shadow-glow mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#d9ff00" stroke-width="2">
                    <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
                    <path d="M8.5 8.5v.01"/>
                </svg>
            </div>
            <h2 class="text-2xl font-black text-white uppercase tracking-wider mb-2">Sign in</h2>
            <p class="text-secondary text-sm">Use your content-factory account to enable credits, the shared library and prompt builder.</p>
        </div>

        <div class="space-y-6">
            <div class="space-y-2">
                <label class="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">First Name</label>
                <input type="text" id="cf-name-input" placeholder="Your account first name..."
                    class="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors shadow-inner">
            </div>
            <div class="space-y-2">
                <label class="text-[10px] font-bold text-muted uppercase tracking-widest ml-1">PIN</label>
                <input type="password" id="cf-pin-input" placeholder="Your PIN..."
                    class="w-full bg-black/40 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder:text-muted focus:outline-none focus:border-primary/50 transition-colors shadow-inner">
            </div>
            <p id="cf-login-error" class="hidden text-red-400 text-xs text-center"></p>

            <div class="flex flex-col gap-3">
                <button id="cf-login-btn" class="w-full bg-primary text-black font-black py-4 rounded-2xl hover:shadow-glow hover:scale-[1.02] active:scale-[0.98] transition-all">
                    Sign In
                </button>
                <button id="cf-cancel-btn" class="w-full text-[11px] font-bold text-muted hover:text-white transition-colors py-2 uppercase tracking-tighter">
                    Cancel
                </button>
            </div>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const nameInput = modal.querySelector('#cf-name-input');
    const pinInput = modal.querySelector('#cf-pin-input');
    const errorEl = modal.querySelector('#cf-login-error');
    const btn = modal.querySelector('#cf-login-btn');

    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Signing in...';
        errorEl.classList.add('hidden');
        try {
            await login(nameInput.value, pinInput.value);
            document.body.removeChild(overlay);
            if (onSuccess) onSuccess();
        } catch (error) {
            errorEl.textContent = error.message || 'Sign in failed.';
            errorEl.classList.remove('hidden');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    };

    modal.querySelector('#cf-cancel-btn').onclick = () => document.body.removeChild(overlay);

    return overlay;
}
