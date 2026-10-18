export function SettingsModal(onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '100';

    const modal = document.createElement('div');
    modal.className = 'bg-card p-6 rounded-xl border border-border-color w-96 glass';
    modal.style.background = 'var(--bg-card)';
    modal.style.padding = '1.5rem';
    modal.style.borderRadius = 'var(--border-radius-xl)';
    modal.style.border = '1px solid var(--border-color)';
    modal.style.width = '24rem';

    const title = document.createElement('h2');
    title.textContent = 'Settings';
    title.className = 'text-xl font-bold mb-4';
    title.style.marginBottom = '1rem';

    const label = document.createElement('label');
    label.textContent = 'Kie.ai API Key';
    label.className = 'block text-sm text-secondary mb-2';

    const input = document.createElement('input');
    input.type = 'password';
    input.className = 'w-full mb-4 p-2 rounded bg-input border border-border-color';
    input.value = localStorage.getItem('kie_key') || '';
    input.placeholder = 'Enter your Kie.ai API key...';
    input.style.width = '100%';
    input.style.marginBottom = '1rem';

    const btnContainer = document.createElement('div');
    btnContainer.className = 'flex justify-end gap-2';
    btnContainer.style.display = 'flex';
    btnContainer.style.justifyContent = 'flex-end';
    btnContainer.style.gap = '0.5rem';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'px-4 py-2 rounded hover:bg-white/5';
    cancelBtn.onclick = () => {
        document.body.removeChild(overlay);
        if (onClose) onClose();
    };

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'px-4 py-2 rounded bg-primary text-black font-medium';
    saveBtn.style.backgroundColor = 'var(--color-primary)';
    saveBtn.style.color = 'black';
    saveBtn.style.fontWeight = '500';

    saveBtn.onclick = () => {
        const key = input.value.trim();
        if (key) {
            localStorage.setItem('kie_key', key);
            alert('API Key saved!');
            document.body.removeChild(overlay);
            if (onClose) onClose();
        } else {
            alert('Please enter a valid key');
        }
    };

    modal.appendChild(title);
    modal.appendChild(label);
    modal.appendChild(input);

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(saveBtn);
    modal.appendChild(btnContainer);

    overlay.appendChild(modal);

    // Close on outside click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            document.body.removeChild(overlay);
            if (onClose) onClose();
        }
    });

    return overlay;
}
