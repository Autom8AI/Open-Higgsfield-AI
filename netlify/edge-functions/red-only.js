// Final HTML pass: the legacy blue interface is never painted.
// The original form nodes remain available for app-core.js, but the container is
// not revealed until the Tornado Red sidebar shell has replaced the old layout.
export default async (request, context) => {
  const response = await context.next()
  const contentType = response.headers.get('content-type') || ''

  if (!contentType.includes('text/html')) return response

  let html = await response.text()

  // Remove the old cyan palette from the delivered HTML itself. This also
  // protects against a blue fallback if a future script takes longer to load.
  html = html
    .replace(/#00bfff/gi, '#e10600')
    .replace(/#0099cc/gi, '#b40500')
    .replace(/rgba\(0\s*,\s*191\s*,\s*255\s*,/gi, 'rgba(225, 6, 0,')
    .replace(/body\.matai-unlocked \.container \{ visibility: visible; \}/g,
      'body.matai-ready .container { visibility: visible; }')
    // upload-fix.js historically used a long-lived July 23 URL. Replace it in
    // the final HTML pass so iOS/PWA caches cannot keep the obsolete Kie-based
    // Video Edit handler that expects a token from /api/upload-ticket.
    .replace(/\/app\.js\?v=20260723-single-airtable-login-1/g,
      '/app.js?v=20260727-fal-upload-contract-2')

  const redOnlyStyle = `
<style id="mataiRedOnlyBoot">
  html, body { background: #050505 !important; }
  .container {
    display: none !important;
    visibility: hidden !important;
  }
  body.matai-ready .container {
    display: block !important;
    visibility: visible !important;
  }
</style>
<meta name="theme-color" content="#e10600">`

  const revealScript = `
<script>
(function () {
  function revealRedShell() {
    var shell = document.querySelector('.matai-app-shell');
    var createPage = document.getElementById('mataiCreatePage');
    var activePanel = document.querySelector('.matai-create-panel.active');
    if (!shell || !createPage || !activePanel) return false;

    document.body.classList.add('matai-ready');
    return true;
  }

  if (revealRedShell()) return;

  var observer = new MutationObserver(function () {
    if (revealRedShell()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
})();
</script>`

  html = html.replace('</head>', `${redOnlyStyle}\n</head>`)
  html = html.replace('</body>', `${revealScript}\n</body>`)

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.set('cache-control', 'no-store, max-age=0')

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}