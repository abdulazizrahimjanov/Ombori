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
    "revision": "08084494ffeb81a4c2c28241750fee9b"
  }, {
    "url": "pwa-512x512.png",
    "revision": "dde50840f171c7c588df02bbff357fcc"
  }, {
    "url": "pwa-192x192.png",
    "revision": "aa0968a4659b8677ed78724a76ebfe55"
  }, {
    "url": "index.html",
    "revision": "27d4521a695763f5e79d1c99af53bbdc"
  }, {
    "url": "icon.svg",
    "revision": "62c1a31b73111cc15ad3e1e6034ec249"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "d95d873b6ce54a6070ba55ad3161f894"
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
    "url": "assets/index-DCr5Qr9N.js",
    "revision": null
  }, {
    "url": "assets/index-Cfgjocnp.css",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261114-165153_Chrome_58411814.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261114-164451_Chrome_1c5e73cd.jpg",
    "revision": null
  }, {
    "url": "assets/aistudio/Screenshot_20261114-163846_Chrome_882e93a4.jpg",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "d95d873b6ce54a6070ba55ad3161f894"
  }, {
    "url": "icon.svg",
    "revision": "62c1a31b73111cc15ad3e1e6034ec249"
  }, {
    "url": "pwa-192x192.png",
    "revision": "aa0968a4659b8677ed78724a76ebfe55"
  }, {
    "url": "pwa-512x512.png",
    "revision": "dde50840f171c7c588df02bbff357fcc"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "08084494ffeb81a4c2c28241750fee9b"
  }, {
    "url": "manifest.webmanifest",
    "revision": "c0082e6a1f3a688ee81fe543f43fa695"
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
