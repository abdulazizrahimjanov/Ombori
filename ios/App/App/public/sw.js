/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-afac4cd2'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "pwa-maskable-512x512.png",
    "revision": "05f389b774aba02ee6bd034f5e242ba9"
  }, {
    "url": "pwa-512x512.png",
    "revision": "9815b9a14dcb10aea4d49d7dd209c127"
  }, {
    "url": "pwa-192x192.png",
    "revision": "ca3fcbe66f4f888bb5f5a0fef06b5a7a"
  }, {
    "url": "index.html",
    "revision": "07b257dd9cc700a386a632d6f812f096"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "f57ab7b0e6d79650c34dd60d4846b4a8"
  }, {
    "url": "assets/storefront_hero_banner_1794644386966-RJf20eSM.jpg",
    "revision": null
  }, {
    "url": "assets/product_leather_sneakers_1794644387638-D2iYJ8fA.jpg",
    "revision": null
  }, {
    "url": "assets/product_electronics_earbuds_1794644388086-2tXVKi_p.jpg",
    "revision": null
  }, {
    "url": "assets/product_cosmetics_serum_1794644389617-JW1g8Z5K.jpg",
    "revision": null
  }, {
    "url": "assets/product_apparel_jacket_1794644386775-DzyP-opd.jpg",
    "revision": null
  }, {
    "url": "assets/index-HmL7Zh66.js",
    "revision": null
  }, {
    "url": "assets/index-BZ6rsrMt.css",
    "revision": null
  }, {
    "url": "assets/aistudio/IMG_20261007_140535_653_64e97dff.jpg",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "f57ab7b0e6d79650c34dd60d4846b4a8"
  }, {
    "url": "pwa-192x192.png",
    "revision": "ca3fcbe66f4f888bb5f5a0fef06b5a7a"
  }, {
    "url": "pwa-512x512.png",
    "revision": "9815b9a14dcb10aea4d49d7dd209c127"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "05f389b774aba02ee6bd034f5e242ba9"
  }, {
    "url": "assets/aistudio/IMG_20261007_140535_653_64e97dff.jpg",
    "revision": "6090c96e00e2f24046e7f7bc42991cd7"
  }, {
    "url": "manifest.webmanifest",
    "revision": "6cf6faa0a46d8aa1909216b46daf7097"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html")));
  workbox.registerRoute(/^https:\/\/fonts\.googleapis\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "google-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');
  workbox.registerRoute(/^https:\/\/fonts\.gstatic\.com\/.*/i, new workbox.CacheFirst({
    "cacheName": "gstatic-fonts-cache",
    plugins: [new workbox.ExpirationPlugin({
      maxEntries: 10,
      maxAgeSeconds: 31536000
    }), new workbox.CacheableResponsePlugin({
      statuses: [0, 200]
    })]
  }), 'GET');

}));
