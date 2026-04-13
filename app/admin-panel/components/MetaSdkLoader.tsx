"use client";

// Facebook JavaScript SDK loader.
//
// Meta's JS SDK is loaded asynchronously — there are no files to host, we
// just drop this snippet into the page and the SDK attaches itself to
// window.FB. The App ID is public (it's exposed in every OAuth URL anyway),
// so we read it from NEXT_PUBLIC_META_APP_ID.
//
// The actual OAuth flow + token storage is still server-side via
// /api/meta/connect + /api/meta/callback — this SDK is only loaded so Meta
// SDK-powered client features (login status checks, share dialogs, etc.)
// work on pages that need them.

import Script from "next/script";

export default function MetaSdkLoader() {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  if (!appId) return null;

  return (
    <>
      <div id="fb-root" />
      <Script
        id="meta-fb-sdk-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.fbAsyncInit = function() {
              FB.init({
                appId: '${appId}',
                cookie: true,
                xfbml: true,
                version: 'v19.0'
              });
              FB.AppEvents.logPageView();
            };
            (function(d, s, id){
              var js, fjs = d.getElementsByTagName(s)[0];
              if (d.getElementById(id)) return;
              js = d.createElement(s); js.id = id;
              js.src = "https://connect.facebook.net/en_US/sdk.js";
              fjs.parentNode.insertBefore(js, fjs);
            }(document, 'script', 'facebook-jssdk'));
          `,
        }}
      />
    </>
  );
}
