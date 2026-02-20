const loadingState = document.getElementById('loading-state');
const successState = document.getElementById('success-state');
const fallbackState = document.getElementById('fallback-state');
const preview = document.getElementById('payload-preview');
const ingestButton = document.getElementById('ingest-button');
const ingestResult = document.getElementById('ingest-result');
const manualIngestButton = document.getElementById('manual-ingest-button');
const manualResult = document.getElementById('manual-result');

let capturedPayload = null;

function showState(state) {
  loadingState.classList.add('hidden');
  successState.classList.add('hidden');
  fallbackState.classList.add('hidden');
  state.classList.remove('hidden');
}

function buildIngestBody(payload, source = 'share_target') {
  return {
    source,
    metadata: {
      capturedAt: payload.receivedAt || new Date().toISOString(),
      flow: 'pwa_share_target'
    },
    payload: {
      sharedTitle: payload.title || '',
      sharedText: payload.text || '',
      sharedUrl: payload.url || ''
    }
  };
}

async function ingestPayload(body, outputNode) {
  outputNode.textContent = 'Ingesting...';
  const response = await fetch('/api/v1/trips/ingest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.errors?.join(', ') || result.error || 'Ingestion failed');
  }

  outputNode.textContent = `Success. Trip ID: ${result.tripId}`;
}

async function consumeSharedPayloadFromServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  const controller = navigator.serviceWorker.controller;
  if (!controller) {
    return null;
  }

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      resolve(event.data?.payload || null);
    };

    controller.postMessage({ type: 'RYNNO_CONSUME_SHARE_TARGET' }, [channel.port2]);
  });
}

async function init() {
  capturedPayload = await consumeSharedPayloadFromServiceWorker();

  if (capturedPayload && (capturedPayload.url || capturedPayload.text || capturedPayload.title)) {
    preview.textContent = JSON.stringify(capturedPayload, null, 2);
    showState(successState);
    return;
  }

  showState(fallbackState);
}

ingestButton.addEventListener('click', async () => {
  if (!capturedPayload) {
    return;
  }

  try {
    await ingestPayload(buildIngestBody(capturedPayload), ingestResult);
  } catch (error) {
    ingestResult.textContent = error.message;
  }
});

manualIngestButton.addEventListener('click', async () => {
  const source = document.getElementById('manual-source').value || 'manual';
  const text = document.getElementById('manual-text').value;

  try {
    await ingestPayload(
      {
        source,
        metadata: { flow: 'manual_share_target_fallback' },
        payload: { sharedText: text }
      },
      manualResult
    );
  } catch (error) {
    manualResult.textContent = error.message;
  }
});

init().catch((error) => {
  console.error('Unable to initialize share target flow', error);
  showState(fallbackState);
});
