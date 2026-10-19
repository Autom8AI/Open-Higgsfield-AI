export default async (request, context) => {
  const response = await context.next()
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('text/html')) return response

  let html = await response.text()

  html = html
    .replace(/<script\s+src="\/auth-gate\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/app-branding\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/app-logo-safe\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/hero-editor\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/hero-carousel-fast\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/video-hero-carousel\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/video-car-interior\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/video-real-estate-interior\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/video-cost-cap\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/avatar-direct-store\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/avatar-create-fields\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/avatar-video-fix\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/library-queue\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/mobile-library-actions\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/upload-client\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/talk-direct-queue\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/generation-submit-stable\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/credits-page-only\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/creator-frontend-cleanup\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/video-custom-submit-fix\.js\?v=[^"]+"><\/script>\s*/ig, '')
    .replace(/<script\s+src="\/library-cost-labels\.js\?v=[^"]+"><\/script>\s*/ig, '')

  html = html.replace(
    /<div\s+id="(?:imageCost|videoCost|talkCost|infImageCost|infVideoCost)"[^>]*class="[^"]*cost-est[^"]*"[^>]*>\s*<\/div>\s*/ig,
    ''
  )

  const runtimeVersionGuard = `
<script id="mataiRuntimeVersionGuard">
(function () {
  var originalAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function (node) {
    try {
      if (node && node.tagName === 'SCRIPT') {
        var source = node.getAttribute('src') || '';
        if (/^\\/app\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/app.js?v=20260728-avatar-video-fix-1');
        } else if (/^\\/app-existing\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/app-existing.js?v=20260728-avatar-video-fix-1');
        } else if (/^\\/avatar-video-fix\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/avatar-video-fix.js?v=20260728-avatar-video-fix-1');
        } else if (/^\\/video-edit-layout-fix\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/video-edit-layout-fix.js?v=20260728-simple-creator-2');
        } else if (/^\\/model-dropdown-stable\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/model-dropdown-stable.js?v=20260728-selector-description-cost-2');
        } else if (/^\\/creator-frontend-cleanup\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/creator-frontend-cleanup.js?v=20260728-custom-video-ratios-1');
        } else if (/^\\/video-custom-submit-fix\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/video-custom-submit-fix.js?v=20260728-provider-payload-1');
        } else if (/^\\/library-cost-labels\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/library-cost-labels.js?v=20260728-credits-only-3');
        } else if (/^\\/credits-page-only\\.js(?:\\?|$)/.test(source)) {
          node.setAttribute('src', '/credits-page-only.js?v=20260728-fal-topup-link-5');
        }
      }
    } catch (error) {
      console.error('[MATAI version guard]', error);
    }
    return originalAppendChild.call(this, node);
  };
})();
</script>`

  const creditsOnlyStyle = `
<style id="creditsPageOnlyBoot">
  #imageCost,
  #videoCost,
  #talkCost,
  #infImageCost,
  #infVideoCost,
  .matai-page:not(#mataiCreditsPage) .cost-est,
  .tab-content .cost-est,
  .matai-page:not(#mataiCreditsPage) .credit-grid,
  .matai-page:not(#mataiCreditsPage) .credit-actions,
  .matai-page:not(#mataiCreditsPage) .credit-table,
  .matai-page:not(#mataiCreditsPage) .credit-card,
  .tab-content .credit-grid,
  .tab-content .credit-actions,
  .tab-content .credit-table,
  .tab-content .credit-card {
    display: none !important;
  }
  #mataiCreditsPage { display: none !important; }
  #mataiCreditsPage.active { display: block !important; }
</style>`

  html = html.replace('</head>', `${runtimeVersionGuard}\n${creditsOnlyStyle}\n</head>`)

  const falVideoEditEnforcer = `
<script id="falVideoEditEnforcer">
(function () {
  var attempts = 0;
  var timer = setInterval(function () {
    attempts += 1;
    var handler = window.handleVideoSubmit;
    if (typeof handler === 'function' && !handler.__falHappyHorseFixed) {
      var script = document.createElement('script');
      script.src = '/video-edit-layout-fix.js?v=20260728-simple-enforcer-' + attempts;
      script.async = false;
      document.body.appendChild(script);
    }
    if (attempts >= 20 || (typeof window.handleVideoSubmit === 'function' && window.handleVideoSubmit.__falHappyHorseFixed)) {
      clearInterval(timer);
    }
  }, 750);
})();
</script>`

  html = html.replace(
    '</body>',
    '<script src="/avatar-direct-store.js?v=20260718-avatar-airtable-direct-1"></script>\n'
      + '<script src="/avatar-create-fields.js?v=20260718-simple-avatar-form-1"></script>\n'
      + '<script src="/library-queue.js?v=20260728-actual-costs-2"></script>\n'
      + '<script src="/mobile-library-actions.js?v=20260717-native-save-one-button-2"></script>\n'
      + '<script src="/upload-client.js?v=20260727-fal-video-ready-2"></script>\n'
      + '<script src="/talk-direct-queue.js?v=20260718-talk-async-voice-2"></script>\n'
      + '<script src="/generation-submit-stable.js?v=20260718-parallel-forms-1"></script>\n'
      + '<script src="/app-logo-safe.js?v=20260718-user-icon-small-1"></script>\n'
      + '<script src="/credits-page-only.js?v=20260728-fal-topup-link-5"></script>\n'
      + falVideoEditEnforcer
      + '</body>'
  )

  const headers = new Headers(response.headers)
  headers.delete('content-length')
  headers.set('cache-control', 'no-store, max-age=0')

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
