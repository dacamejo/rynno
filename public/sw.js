const SHARE_CACHE = 'rynno-share-target-v1';
const SHARE_PAYLOAD_KEY = '/__share-target-payload__';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function persistSharePayload(payload) {
  const cache = await caches.open(SHARE_CACHE);
  await cache.put(
    SHARE_PAYLOAD_KEY,
    new Response(JSON.stringify(payload), {
      headers: { 'content-type': 'application/json' }
    })
  );
}

async function consumeSharePayload() {
  const cache = await caches.open(SHARE_CACHE);
  const match = await cache.match(SHARE_PAYLOAD_KEY);
  if (!match) {
    return null;
  }

  const payload = await match.json();
  await cache.delete(SHARE_PAYLOAD_KEY);
  return payload;
}

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const isShareTargetPost = event.request.method === 'POST' && requestUrl.pathname === '/share-target';

  if (!isShareTargetPost) {
    return;
  }

  event.respondWith((async () => {
    const formData = await event.request.clone().formData();
    const payload = {
      title: formData.get('title') || '',
      text: formData.get('text') || '',
      url: formData.get('url') || '',
      receivedAt: new Date().toISOString()
    };

    await persistSharePayload(payload);
    return Response.redirect('/share-target?ingested=1', 303);
  })());
});

self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'RYNNO_CONSUME_SHARE_TARGET') {
    return;
  }

  event.waitUntil((async () => {
    const payload = await consumeSharePayload();
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ payload });
    }
  })());
});
