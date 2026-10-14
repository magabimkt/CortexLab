/* Córtex Lab — service worker
   - Arquivos do app (página, configuração): busca na rede primeiro (para
     receber atualizações) e, sem internet ou com rede lenta, usa a cópia salva.
   - Ícones: cópia salva primeiro.
   - Fontes e bibliotecas do Google (login): cópia salva e atualização em
     segundo plano, para o app abrir também sem internet.
   - Login e banco de dados (Firebase) nunca são guardados: sempre vão à rede. */
const VERSAO = 'cortexlab-v3';
const ARQUIVOS = [
  './',
  './index.html',
  './firebase-config.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSAO).then(cache => cache.addAll(ARQUIVOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(chaves => Promise.all(chaves.filter(c => c !== VERSAO).map(c => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

function comTempoLimite(promessa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tempo esgotado')), ms);
    promessa.then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}

function redePrimeiro(req, chaveCache, reserva) {
  return comTempoLimite(fetch(req), 4000)
    .then(resp => {
      if (resp && resp.ok) {
        const copia = resp.clone();
        caches.open(VERSAO).then(c => c.put(chaveCache, copia));
      }
      return resp;
    })
    .catch(() => caches.match(chaveCache).then(r => r || (reserva ? caches.match(reserva) : undefined)));
}

function salvoEAtualiza(req) {
  return caches.open(VERSAO).then(cache =>
    cache.match(req).then(salvo => {
      const rede = fetch(req).then(resp => {
        if (resp && (resp.ok || resp.type === 'opaque')) cache.put(req, resp.clone());
        return resp;
      }).catch(() => salvo);
      return salvo || rede;
    })
  );
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Página do app
  if (req.mode === 'navigate') {
    event.respondWith(redePrimeiro(req, './index.html', './'));
    return;
  }

  // Fontes e bibliotecas do Firebase (arquivos estáticos)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' ||
      (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/'))) {
    event.respondWith(salvoEAtualiza(req));
    return;
  }

  // Arquivos do próprio app
  if (url.origin === location.origin) {
    if (/\.png$/i.test(url.pathname)) {
      event.respondWith(caches.match(req).then(s => s || fetch(req)));
    } else {
      event.respondWith(redePrimeiro(req, req, null));
    }
  }
  // Todo o resto (login do Google, Firestore) segue direto para a rede.
});
