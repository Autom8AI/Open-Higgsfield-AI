

import { BackendModal } from './BackendModal.js';
import { logoutBackend } from '../lib/api.js';
export function Header(navigate) {
    const header = document.createElement('header');
    header.className = 'w-full flex flex-col z-50 sticky top-0';


    // 2. Main Navigation Bar
    const navBar = document.createElement('div');
    navBar.className = 'w-full h-16 bg-black flex items-center justify-between px-4 md:px-6 border-b border-white/5 backdrop-blur-md bg-opacity-95';

    const leftPart = document.createElement('div');
    leftPart.className = 'flex items-center gap-8';

    // Logo + wordmark
    const logoContainer = document.createElement('div');
    logoContainer.className = 'flex items-center gap-3 cursor-pointer hover:scale-105 transition-transform';
    logoContainer.innerHTML = `
        <div class="w-8 h-8 bg-[#ff2d2d] rounded-lg flex items-center justify-center p-1.5 shadow-lg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white"/>
                <path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <span class="text-lg font-black tracking-tight text-white">MATAI</span>
    `;
    logoContainer.onclick = () => { navigate('library'); activate('Library'); };

    const menu = document.createElement('nav');
    menu.className = 'hidden lg:flex items-center gap-6 text-[13px] font-bold text-secondary';
    const items = ['Library', 'Image', 'Video', 'Lip Sync', 'Cinema Studio'];

    const pageForItem = { 'Library': 'library', 'Image': 'image', 'Video': 'video', 'Lip Sync': 'lipsync', 'Cinema Studio': 'cinema' };
    const links = {};

    const activate = (name) => {
        Object.entries(links).forEach(([label, link]) => {
            link.classList.remove('text-white');
            const d = link.querySelector('[data-nav-dot]');
            if (d) d.remove();
        });
        const link = links[name];
        link.classList.add('text-white');
        const dot = document.createElement('div');
        dot.className = 'absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full';
        dot.setAttribute('data-nav-dot', '1');
        link.appendChild(dot);
    };

    items.forEach(name => {
        const link = document.createElement('a');
        link.textContent = name;
        link.className = `hover:text-white transition-all cursor-pointer relative group ${name === 'Library' ? 'text-white' : ''}`;

        link.onclick = () => {
            activate(name);
            navigate(pageForItem[name]);
        };

        if (name === 'Library') {
            const dot = document.createElement('div');
            dot.className = 'absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full';
            dot.setAttribute('data-nav-dot', '1');
            link.appendChild(dot);
        }

        links[name] = link;
        menu.appendChild(link);
    });

    leftPart.appendChild(logoContainer);
    
    // Settings button for API key management
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'p-2 text-secondary hover:text-white transition-colors';
    settingsBtn.title = 'Update API Key';
    settingsBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3m-3-3l-2.25-2.25"/>
        </svg>
    `;
    settingsBtn.onclick = () => {
        // Toggle BackendModal for settings (no navigation)
        const existing = document.querySelector('.backend-modal-overlay');
        if (existing) {
            existing.remove();
        } else {
            const m = BackendModal(); m.classList.add('backend-modal-overlay'); document.body.appendChild(m);
        }
    };
    
    leftPart.appendChild(settingsBtn);
    leftPart.appendChild(menu);

    const rightPart = document.createElement('div');
    rightPart.className = 'flex items-center gap-4';

    // Sign out — clears the session cookie server-side, then reloads so
    // the sign-in gate in main.js takes over again.
    const signOutBtn = document.createElement('button');
    signOutBtn.textContent = 'Sign Out';
    signOutBtn.className = 'text-[13px] font-bold text-secondary hover:text-white transition-colors cursor-pointer';
    signOutBtn.title = 'Sign out';
    signOutBtn.onclick = async () => {
        signOutBtn.disabled = true;
        signOutBtn.textContent = 'Signing out…';
        try { await logoutBackend(); } catch { /* cookie may already be gone */ }
        window.location.reload();
    };
    rightPart.appendChild(signOutBtn);


    // Mobile navigation (bottom bar on small screens)
    const mobileNav = document.createElement("div");
    mobileNav.className = "lg:hidden w-full h-16 bg-black border-t border-white/5 flex items-center justify-around px-2";
    
    items.forEach(name => {
        const mLink = document.createElement("button");
        mLink.textContent = name;
        mLink.className = `flex-1 text-[11px] font-bold text-secondary hover:text-white transition-colors py-4 px-1 border-b-2 border-transparent hover:border-primary ${name === "Library" ? "text-white border-primary" : ""}`;
        mLink.onclick = () => {
            document.querySelectorAll(".mobile-nav-btn").forEach(btn => {
                btn.classList.remove("text-white", "border-primary");
                btn.classList.add("text-secondary", "border-transparent");
            });
            mLink.classList.add("text-white", "border-primary");
            mLink.classList.remove("text-secondary", "border-transparent");
            navigate(pageForItem[name]);
        };
        mLink.classList.add("mobile-nav-btn");
        if (name === "Library") {
            mLink.classList.add("text-white", "border-primary");
            mLink.classList.remove("text-secondary", "border-transparent");
        }
        mobileNav.appendChild(mLink);
    });
    
    header.appendChild(mobileNav);
    navBar.appendChild(leftPart);
    navBar.appendChild(rightPart);

    header.appendChild(navBar);

    return header;
}
