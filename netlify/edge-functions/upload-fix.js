export default async (request, context) => {
  const response = await context.next()
  const contentType = response.headers.get('content-type') || ''

  if (!contentType.includes('text/html')) return response

  let html = await response.text()

  html = html
    .replace(/<title>Content Factory<\/title>/i, '<title>MATAI</title>')
    .replace(/<h1>Content Factory<\/h1>/i, '<h1>MATAI</h1>')
    .replace(/<input\s+type="file"/g, '<input type="file" onclick="event.stopPropagation()"')

  const style = `
<style id="mataiSingleLoginStyle">
  :root {
    --tornado-red: #e10600;
    --tornado-red-soft: rgba(225, 6, 0, .16);
    --tornado-red-glow: rgba(225, 6, 0, .38);
  }
  html, body { min-height: 100%; background: #050505 !important; }
  .container { visibility: hidden; }
  body.matai-unlocked .container { visibility: visible; }
  #mataiLoginWall {
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: radial-gradient(circle at 50% 0%, rgba(225,6,0,.13), transparent 36%), #050505;
    color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  body.matai-unlocked #mataiLoginWall { display: none; }
  .matai-login-card {
    width: min(100%, 410px);
    padding: 32px;
    border: 1px solid #282828;
    border-radius: 18px;
    background: #0b0b0b;
    box-shadow: 0 24px 80px rgba(0,0,0,.68);
  }
  .matai-login-card h1 {
    margin: 0 0 8px;
    color: var(--tornado-red);
    font-size: 2rem;
    letter-spacing: .08em;
    text-align: center;
    text-shadow: 0 0 24px var(--tornado-red-glow);
  }
  .matai-login-card > p { margin: 0 0 24px; color: #999; text-align: center; }
  .matai-field { margin-top: 14px; }
  .matai-field label { display:block; margin-bottom:7px; color:#ddd; font-size:.88rem; font-weight:700; }
  .matai-field input {
    width: 100%; box-sizing: border-box; padding: 14px 15px; border:1px solid #343434;
    border-radius:10px; outline:none; background:#050505; color:#fff; font:inherit;
  }
  .matai-field input:focus { border-color: var(--tornado-red); box-shadow: 0 0 0 3px var(--tornado-red-soft); }
  .matai-captcha-row { display:grid; grid-template-columns: 1fr auto; gap:10px; align-items:end; }
  #mataiRefreshCaptcha { height:47px; padding:0 14px; border:1px solid #353535; border-radius:10px; background:#151515; color:#fff; font-weight:700; cursor:pointer; }
  #mataiLoginButton { width:100%; margin-top:18px; padding:14px 18px; border:0; border-radius:10px; background:var(--tornado-red); color:#fff; font:inherit; font-weight:800; cursor:pointer; }
  #mataiLoginButton:disabled, #mataiRefreshCaptcha:disabled { opacity:.55; cursor:wait; }
  #mataiLoginStatus { min-height:20px; margin-top:12px; color:#ff6b6b; font-size:.9rem; text-align:center; }
  #mataiCaptchaQuestion { min-height:21px; color:#fff; font-weight:700; }
  .file-input-label { position: relative !important; overflow: hidden !important; touch-action: manipulation; }
  .file-input-label input[type="file"] { display:block !important; position:absolute !important; inset:0 !important; width:100% !important; height:100% !important; opacity:0 !important; cursor:pointer !important; z-index:20 !important; }
</style>`

  const loginWall = `
<div id="mataiLoginWall" role="dialog" aria-modal="true" aria-labelledby="mataiLoginTitle">
  <div class="matai-login-card">
    <h1 id="mataiLoginTitle">MATAI</h1>
    <p>Sign in with your Airtable account.</p>
    <form id="mataiLoginForm">
      <div class="matai-field"><label for="mataiLoginName">First name</label><input id="mataiLoginName" name="name" type="text" autocomplete="given-name" required></div>
      <div class="matai-field"><label for="mataiLoginPin">PIN</label><input id="mataiLoginPin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" required></div>
      <div class="matai-field matai-captcha-row">
        <div><label for="mataiCaptchaAnswer">Human check</label><div id="mataiCaptchaQuestion">Loading…</div><input id="mataiCaptchaAnswer" name="captchaAnswer" type="text" autocomplete="off" required></div>
        <button id="mataiRefreshCaptcha" type="button">New</button>
      </div>
      <button id="mataiLoginButton" type="submit">Sign in</button>
      <div id="mataiLoginStatus" aria-live="polite"></div>
    </form>
  </div>
</div>`

  const gateScript = `
<script id="mataiSingleLoginScript">
(function () {
  var appLoaded = false;
  var captchaToken = '';
  var form = document.getElementById('mataiLoginForm');
  var nameInput = document.getElementById('mataiLoginName');
  var pinInput = document.getElementById('mataiLoginPin');
  var captchaInput = document.getElementById('mataiCaptchaAnswer');
  var captchaQuestion = document.getElementById('mataiCaptchaQuestion');
  var refreshButton = document.getElementById('mataiRefreshCaptcha');
  var loginButton = document.getElementById('mataiLoginButton');
  var status = document.getElementById('mataiLoginStatus');

  function installMataiShell() {
    if (document.querySelector('.matai-app-shell')) return;
    var container = document.querySelector('.container');
    var header = container && container.querySelector('.header');
    var oldTabs = container && container.querySelector('.tabs');
    var library = document.getElementById('library');
    var image = document.getElementById('image');
    var video = document.getElementById('video');
    var avatar = document.getElementById('influencer');
    if (!container || !header || !library || !image || !video || !avatar) return;

    var tornadoStyle = document.createElement('style');
    tornadoStyle.id = 'mataiTornadoTheme';
    tornadoStyle.textContent = [
      ':root{--tornado-red:#e10600;--tornado-red-dark:#970400;--tornado-red-soft:rgba(225,6,0,.16);--tornado-red-glow:rgba(225,6,0,.38)}',
      'body{padding:0!important;background:#050505!important}',
      '.container{max-width:none!important;margin:0!important}',
      '.matai-app-shell{display:grid;grid-template-columns:224px minmax(0,1fr);min-height:100vh;background:radial-gradient(circle at 75% -10%,rgba(225,6,0,.12),transparent 34%),#050505}',
      '.matai-sidebar{position:sticky;top:0;height:100vh;padding:26px 16px;border-right:1px solid #262626;background:linear-gradient(180deg,#101010 0%,#090909 100%);display:flex;flex-direction:column;gap:30px}',
      '.matai-brand{text-align:left!important;margin:0!important;padding:0 10px 24px;border-bottom:1px solid #252525}',
      '.matai-brand h1{font-size:1.65rem!important;margin:0 0 6px!important;color:var(--tornado-red)!important;letter-spacing:.08em;text-shadow:0 0 24px var(--tornado-red-glow)!important}',
      '.matai-brand p{font-size:.82rem!important;color:#8d8d8d!important;line-height:1.35}',
      '.matai-side-nav{display:flex;flex-direction:column;gap:8px}',
      '.matai-side-btn{display:flex;align-items:center;gap:12px;width:100%;padding:13px 14px;border:1px solid transparent;border-radius:10px;background:transparent;color:#9a9a9a;font:inherit;font-weight:700;text-align:left;cursor:pointer}',
      '.matai-side-btn.active{color:#fff;background:linear-gradient(135deg,var(--tornado-red),#b40500);border-color:#ff302a;box-shadow:0 10px 26px var(--tornado-red-soft)}',
      '.matai-side-icon{width:22px;font-size:1.05rem;text-align:center}',
      '.matai-main{min-width:0;padding:34px;overflow:hidden}',
      '.matai-page{display:none;max-width:1120px;margin:0 auto}.matai-page.active{display:block}',
      '.matai-page-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}',
      '.matai-page-heading h2{font-size:1.55rem;margin:0;color:#fff}.matai-page-heading p{margin:5px 0 0;color:#777;font-size:.9rem}',
      '.matai-create-tabs{display:flex;gap:8px;margin-bottom:20px;padding:5px;width:max-content;max-width:100%;border:1px solid #2a2a2a;border-radius:11px;background:#101010;overflow-x:auto}',
      '.matai-create-tab{padding:10px 20px;border:0;border-radius:7px;background:transparent;color:#8d8d8d;font:inherit;font-weight:750;cursor:pointer;white-space:nowrap}',
      '.matai-create-tab.active{color:#fff;background:var(--tornado-red);box-shadow:0 7px 18px var(--tornado-red-soft)}',
      '.matai-create-panel{display:none!important}.matai-create-panel.active{display:block!important}',
      '.matai-library-panel{display:none!important}.matai-library-panel.active{display:block!important}',
      '.header{color:var(--tornado-red)!important}.tabs{border-color:var(--tornado-red)!important}',
      '.tab-btn{color:var(--tornado-red)!important;border-color:var(--tornado-red)!important}',
      '.tab-btn.active,.submit-btn,.dl-btn{background:var(--tornado-red)!important;color:#fff!important}',
      '.form-card{border-color:#3a1715!important;box-shadow:0 12px 42px rgba(225,6,0,.12)!important;background:#141414!important}',
      '@media(max-width:760px){.matai-app-shell{grid-template-columns:84px minmax(0,1fr)}.matai-sidebar{padding:18px 8px}.matai-brand p{display:none}.matai-side-btn{padding:12px 4px;gap:4px;flex-direction:column;text-align:center;font-size:.68rem}.matai-main{padding:20px 14px}.matai-create-tab{padding:9px 14px}}'
    ].join('');
    document.head.appendChild(tornadoStyle);

    var shell = document.createElement('div'); shell.className = 'matai-app-shell';
    var sidebar = document.createElement('aside'); sidebar.className = 'matai-sidebar';
    header.className = 'matai-brand';
    var subtitle = header.querySelector('p'); if (subtitle) subtitle.textContent = 'AI content studio';
    var sideNav = document.createElement('nav'); sideNav.className = 'matai-side-nav';
    function sideButton(page, icon, label) { var b=document.createElement('button'); b.type='button'; b.className='matai-side-btn'; b.dataset.page=page; b.innerHTML='<span class="matai-side-icon">'+icon+'</span><span>'+label+'</span>'; b.onclick=function(){window.showMataiPage(page)}; return b; }
    sideNav.appendChild(sideButton('create','✦','Create')); sideNav.appendChild(sideButton('library','▦','Library'));
    sidebar.appendChild(header); sidebar.appendChild(sideNav);
    var main=document.createElement('main'); main.className='matai-main';
    var createPage=document.createElement('section'); createPage.id='mataiCreatePage'; createPage.className='matai-page';
    var heading=document.createElement('div'); heading.className='matai-page-heading'; heading.innerHTML='<div><h2>Create</h2><p>Choose a format and build your next asset.</p></div>';
    var tabs=document.createElement('div'); tabs.className='matai-create-tabs';
    function toolButton(tool,label){var b=document.createElement('button');b.type='button';b.className='matai-create-tab';b.dataset.tool=tool;b.textContent=label;b.onclick=function(){window.showMataiCreateTool(tool)};return b;}
    tabs.appendChild(toolButton('image','Image')); tabs.appendChild(toolButton('video','Video')); tabs.appendChild(toolButton('influencer','Avatar'));
    [image,video,avatar].forEach(function(panel){panel.classList.remove('tab-content','active');panel.classList.add('matai-create-panel')});
    library.classList.remove('tab-content','active'); library.classList.add('matai-library-panel');
    createPage.appendChild(heading); createPage.appendChild(tabs); createPage.appendChild(image); createPage.appendChild(video); createPage.appendChild(avatar);
    var libraryPage=document.createElement('section'); libraryPage.id='mataiLibraryPage'; libraryPage.className='matai-page';
    var libraryHeading=document.createElement('div'); libraryHeading.className='matai-page-heading'; libraryHeading.innerHTML='<div><h2>Library</h2><p>Review queued and completed generations.</p></div>'; libraryPage.appendChild(libraryHeading); libraryPage.appendChild(library);
    main.appendChild(createPage); main.appendChild(libraryPage); shell.appendChild(sidebar); shell.appendChild(main);
    if (oldTabs) oldTabs.remove(); container.innerHTML=''; container.appendChild(shell);
    window.showMataiCreateTool=function(tool){document.querySelectorAll('.matai-create-tab').forEach(function(b){b.classList.toggle('active',b.dataset.tool===tool)});document.querySelectorAll('.matai-create-panel').forEach(function(p){p.classList.toggle('active',p.id===tool)});if(tool==='influencer'&&typeof window.loadAvatars==='function')window.loadAvatars()};
    window.showMataiPage=function(page){document.querySelectorAll('.matai-side-btn').forEach(function(b){b.classList.toggle('active',b.dataset.page===page)});createPage.classList.toggle('active',page==='create');libraryPage.classList.toggle('active',page==='library');library.classList.toggle('active',page==='library');if(page==='library'&&typeof window.loadLibrary==='function')window.loadLibrary()};
    window.switchTab=function(tabName){if(tabName==='library')return window.showMataiPage('library');if(['image','video','influencer'].indexOf(tabName)>=0){window.showMataiPage('create');window.showMataiCreateTool(tabName)}};
    window.showMataiCreateTool('image'); window.showMataiPage('create');
  }

  function waitForAppCore() {
    var attempts=0; var timer=setInterval(function(){attempts+=1;if(typeof window.switchTab==='function'&&typeof window.loadLibrary==='function'){clearInterval(timer);installMataiShell()}else if(attempts>240){clearInterval(timer);console.error('[MATAI shell] App core did not become ready.')}},25);
  }

  function loadApp() {
    if (appLoaded) return;
    appLoaded = true;
    document.body.classList.add('matai-unlocked');
    var script = document.createElement('script');
    script.src = '/app.js?v=20260723-single-airtable-login-1';
    script.async = false;
    script.onload = waitForAppCore;
    document.body.appendChild(script);
  }

  async function loadCaptcha() {
    refreshButton.disabled = true;
    captchaQuestion.textContent = 'Loading…';
    captchaInput.value = '';
    try {
      var response = await fetch('/api/captcha', { cache:'no-store', credentials:'same-origin' });
      var body = await response.json();
      if (!response.ok || !body.captchaToken) throw new Error(body.error || 'Could not load human check.');
      captchaToken = body.captchaToken;
      captchaQuestion.textContent = body.question;
    } catch (error) {
      captchaToken = '';
      captchaQuestion.textContent = 'Human check unavailable.';
      status.textContent = error.message || 'Could not load human check.';
    } finally { refreshButton.disabled = false; }
  }

  async function checkSession() {
    try {
      var response = await fetch('/api/session', { cache:'no-store', credentials:'same-origin' });
      if (response.ok) { loadApp(); return true; }
    } catch (error) { console.error('[MATAI session]', error); }
    await loadCaptcha();
    setTimeout(function(){nameInput.focus()},0);
    return false;
  }

  refreshButton.addEventListener('click', loadCaptcha);
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    status.textContent = '';
    if (!captchaToken) { status.textContent = 'Load a new human check.'; await loadCaptcha(); return; }
    loginButton.disabled = true; refreshButton.disabled = true;
    try {
      var response = await fetch('/api/login', {
        method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({name:nameInput.value.trim(),pin:pinInput.value.trim(),captchaToken:captchaToken,captchaAnswer:captchaInput.value.trim()})
      });
      var body = await response.json().catch(function(){return {}});
      if (!response.ok) {
        status.textContent = body.error || 'Sign in failed.';
        pinInput.value = '';
        await loadCaptcha();
        return;
      }
      loadApp();
    } catch (error) {
      status.textContent = 'Could not sign in. Check your connection.';
      await loadCaptcha();
    } finally { loginButton.disabled=false; refreshButton.disabled=false; }
  });

  checkSession();
})();
</script>`

  html = html.replace('</head>', style + '\n</head>')
  html = html.replace(/<body([^>]*)>/i, '$&\n' + loginWall)
  html = html.replace(/<script\s+src="\/app\.js"><\/script>/i, gateScript)

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.set('cache-control', 'no-store, max-age=0')

  return new Response(html, { status: response.status, statusText: response.statusText, headers })
}
