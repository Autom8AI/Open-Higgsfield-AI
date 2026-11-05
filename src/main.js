import './style.css';
import { Header } from './components/Header.js';
import { ImageStudio } from './components/ImageStudio.js';
import { BackendModal } from './components/BackendModal.js';

const app = document.querySelector('#app');
let contentArea;
let booted = false;

// Router
function navigate(page) {
  if (!contentArea) return;
  contentArea.innerHTML = '';

  if (page === 'image') {
    contentArea.appendChild(ImageStudio());
  } else if (page === 'video') {
    import('./components/VideoStudio.js').then(({ VideoStudio }) => {
      contentArea.appendChild(VideoStudio());
    });
  } else if (page === 'factory') {
    import('./components/FactoryStudio.js').then(({ FactoryStudio }) => {
      contentArea.appendChild(FactoryStudio());
    });
  } else if (page === 'remix') {
    import('./components/RemixStudio.js').then(({ RemixStudio }) => {
      contentArea.appendChild(RemixStudio());
    });
  } else if (page === 'library') {
    import('./components/LibraryPage.js').then(({ LibraryPage }) => {
      contentArea.appendChild(LibraryPage());
    });
  } else if (page === 'cinema') {
    import('./components/CinemaStudio.js').then(({ CinemaStudio }) => {
      contentArea.appendChild(CinemaStudio());
    });
  } else if (page === 'lipsync') {
    import('./components/LipSyncStudio.js').then(({ LipSyncStudio }) => {
      contentArea.appendChild(LipSyncStudio());
    });
  }
}

// Event Listener for Navigation
window.addEventListener('navigate', (e) => {
  navigate(e.detail.page);
});

// --- Sign-in gate -------------------------------------------------------
// Nothing in the app renders until the visitor is signed in with their
// content-factory account (first name + PIN). The session cookie is
// httpOnly, so the only way to know is to ask the backend's /session
// endpoint, which answers 401 when there is no valid session.
async function hasValidSession() {
  try {
    const res = await fetch('/.netlify/functions/session', { credentials: 'include' });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data && data.ok ? String(data.sub || 'account') : false;
  } catch {
    return false;
  }
}

function showCheckingScreen() {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'flex-1 flex items-center justify-center';
  screen.innerHTML = '<p class="text-muted text-xs font-bold uppercase tracking-widest animate-pulse">Loading…</p>';
  app.appendChild(screen);
}

function showSignInGate() {
  app.innerHTML = '';
  const screen = document.createElement('div');
  screen.className = 'flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center';
  screen.innerHTML = `
    <h1 class="text-3xl md:text-5xl font-black text-white tracking-widest uppercase">MATAI</h1>
    <p class="text-secondary text-sm font-medium tracking-wide opacity-60">AI Image &amp; Video Studio — sign in to continue.</p>
  `;
  app.appendChild(screen);

  // BackendModal renders the name + PIN sign-in form and calls back on
  // success. Remove its Cancel button: behind the gate there is nothing
  // to cancel back to.
  const modal = BackendModal(() => bootApp());
  modal.querySelector('#cf-cancel-btn')?.remove();
}

function bootApp() {
  if (booted) return;
  booted = true;

  app.innerHTML = '';
  // Pass navigate to Header so links work
  app.appendChild(Header(navigate));

  contentArea = document.createElement('main');
  contentArea.id = 'content-area';
  contentArea.className = 'flex-1 relative w-full overflow-hidden flex flex-col bg-app-bg';
  app.appendChild(contentArea);

  // Initial Route
  navigate('library');
}

// Boot sequence: confirm the session before rendering anything (the check is
// a signature check on the backend, so it is quick), otherwise show only the
// sign-in screen. The Library cache is tied to the signed-in account.
showCheckingScreen();
hasValidSession().then((sub) => {
  if (sub) {
    if (localStorage.getItem('library_cache_owner') !== sub) localStorage.removeItem('library_cache');
    localStorage.setItem('library_cache_owner', sub);
    localStorage.setItem('cf_backend', '1');
    bootApp();
  } else {
    localStorage.removeItem('cf_backend');
    localStorage.removeItem('library_cache');
    showSignInGate();
  }
});
