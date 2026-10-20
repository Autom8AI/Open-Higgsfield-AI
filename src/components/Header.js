

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
    leftPart.appendChild(menu);

    const rightPart = document.createElement('div');
    rightPart.className = 'flex items-center gap-4';

    navBar.appendChild(leftPart);
    navBar.appendChild(rightPart);

    header.appendChild(navBar);

    return header;
}
