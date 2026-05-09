/* ============================================================
   THROUGH THE TREES — main.js
   Scroll-scrubbed canvas + GSAP ScrollTrigger
============================================================ */

(function () {
  'use strict';

  // ── Capability checks ─────────────────────────────────────
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (isMobile || prefersReducedMotion) {
    // Show mobile/reduced-motion fallback
    const fb = document.getElementById('mobile-fallback');
    if (fb) { fb.hidden = false; fb.classList.add('visible'); }
    // Still set up below-fold reveals
    setupReveal();
    return;
  }

  // ── Config ────────────────────────────────────────────────
  const FRAME_COUNT   = 241;
  const SCROLL_VH     = 6;          // pinned section = 6× viewport height of scroll
  const SCRUB_LAG     = 0.6;        // seconds of GSAP scrub lag (smoothness)
  const PRELOAD_EAGER = 30;         // frames to preload before interaction
  const PRELOAD_BATCH = 40;         // frames to load ahead of current position
  const IS_RETINA     = window.devicePixelRatio > 1.5;
  const FRAME_DIR     = IS_RETINA ? 'public/frames@2x' : 'public/frames';

  // ── State ─────────────────────────────────────────────────
  const images      = new Array(FRAME_COUNT).fill(null);
  const loaded      = new Uint8Array(FRAME_COUNT);  // 0|1
  let currentFrame  = 0;
  let rafPending    = false;
  let sceneActive   = false;

  // ── DOM refs ──────────────────────────────────────────────
  const canvas       = document.getElementById('hero-canvas');
  const ctx          = canvas.getContext('2d');
  const vignette     = document.getElementById('canvas-vignette');
  const laptopUI     = document.getElementById('laptop-ui');
  const scene        = document.getElementById('scroll-scene');
  const wifi1        = document.getElementById('wifi-1');
  const wifi2        = document.getElementById('wifi-2');

  // ── Frame URL ─────────────────────────────────────────────
  function frameUrl(idx) {
    const n = String(idx + 1).padStart(4, '0');
    return `${FRAME_DIR}/frame_${n}.jpg`;
  }

  // ── Frame loader ──────────────────────────────────────────
  function loadFrames(start, end, onFirst) {
    for (let i = start; i < Math.min(end, FRAME_COUNT); i++) {
      if (loaded[i]) continue;
      const img = new Image();
      img.onload = () => {
        loaded[i] = 1;
        if (i === 0 && onFirst) onFirst();
      };
      img.src = frameUrl(i);
      images[i] = img;
    }
  }

  // ── Canvas resize ─────────────────────────────────────────
  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    drawFrame(currentFrame);
  }
  window.addEventListener('resize', resizeCanvas, { passive: true });

  // ── Draw a single frame (cover-fill) ──────────────────────
  function drawFrame(idx) {
    const img = images[idx];
    if (!img || !img.complete || !img.naturalWidth) {
      // Find nearest loaded frame
      for (let d = 1; d < 15; d++) {
        const prev = idx - d;
        if (prev >= 0 && images[prev]?.complete && images[prev].naturalWidth) {
          drawFrame(prev); return;
        }
        const next = idx + d;
        if (next < FRAME_COUNT && images[next]?.complete && images[next].naturalWidth) {
          drawFrame(next); return;
        }
      }
      return;
    }

    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const scale = Math.max(cw / iw, ch / ih);
    const sw = iw * scale, sh = ih * scale;
    const sx = (cw - sw) / 2, sy = (ch - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh);
  }

  // ── RAF-throttled draw ────────────────────────────────────
  function scheduleDraw(idx) {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      drawFrame(idx);
      rafPending = false;
    });
  }

  // ── Init: preload first 30 frames ─────────────────────────
  resizeCanvas();
  loadFrames(0, PRELOAD_EAGER, () => {
    drawFrame(0);
    canvas.classList.add('ready');
  });

  // ── GSAP setup ────────────────────────────────────────────
  gsap.registerPlugin(ScrollTrigger);

  // Set the scene height so GSAP has a defined scroll distance
  const scrollDistance = window.innerHeight * SCROLL_VH;
  scene.style.height = scrollDistance + 'px';

  // Set all overlay blocks to initial hidden state
  gsap.set('.scene-block', { opacity: 0, y: 20 });
  gsap.set('#laptop-ui', { opacity: 0, scale: 0.28, transformOrigin: 'center center' });
  gsap.set('.wifi-signal', { opacity: 0 });

  // Master timeline (duration = 10 "units" representing 0–100% scroll)
  const T = 10; // timeline length
  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: scene,
      start: 'top top',
      end: () => `+=${scrollDistance}`,
      pin: true,
      scrub: SCRUB_LAG,
      onToggle: (self) => {
        sceneActive = self.isActive;
        vignette.classList.toggle('active', self.isActive);
        canvas.style.display = self.isActive ? '' : '';
      },
      onUpdate: (self) => {
        // Frame scrubbing
        const frame = Math.min(FRAME_COUNT - 1, Math.floor(self.progress * FRAME_COUNT));
        if (frame !== currentFrame) {
          currentFrame = frame;
          scheduleDraw(frame);
        }
        // Batch preload ahead
        loadFrames(frame, frame + PRELOAD_BATCH);
      }
    },
    defaults: { ease: 'none' }
  });

  // ── Helper: fade block in then out (no overlap guarantee) ──
  // FADE_T = 0.4 time-units = 4% scroll. Each block is fully
  // invisible before the next one starts (1% gap built in).
  const FADE_T = 0.4;

  function block(id, startT, endT) {
    tl
      .fromTo(id,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: FADE_T, ease: 'power2.out' },
        startT)
      .to(id,
        { opacity: 0, y: -10, duration: FADE_T, ease: 'power2.in' },
        endT - FADE_T);
  }

  // ── Content blocks (times in T units; 1 unit = 10% scroll) ─
  // Each block ends BEFORE the next begins — 0.1 T gap between.
  //
  //  0.0 –  1.0  Headline        (0 – 10%)
  //  1.1 –  2.5  Mission        (11 – 25%)
  //  2.6 –  4.4  Programs       (26 – 44%)
  //  4.5 –  5.9  Stats          (45 – 59%)
  //  6.0 –  7.4  Serve          (60 – 74%)
  //  7.5 –  8.9  Why            (75 – 89%)
  //  9.0 – 10.0  Laptop UI      (90 – 100%)

  block('#block-headline', 0.0, 1.0);
  block('#block-mission',  1.1, 2.5);

  // Programs — whole block fades; cards stagger within the in-window
  tl
    .fromTo('#block-programs',
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: FADE_T, ease: 'power2.out' }, 2.6)
    .fromTo('#prog-1',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 2.7)
    .fromTo('#prog-2',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 3.0)
    .fromTo('#prog-3',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 3.3)
    .to('#block-programs',
      { opacity: 0, y: -10, duration: FADE_T, ease: 'power2.in' }, 4.4 - FADE_T);

  block('#block-stats', 4.5, 5.9);
  block('#block-serve', 6.0, 7.4);
  block('#block-why',   7.5, 8.9);

  // Laptop UI — scales in, stays to end
  tl.fromTo('#laptop-ui',
    { opacity: 0, scale: 0.28 },
    { opacity: 1, scale: 1, duration: 0.8, ease: 'power3.out' },
    9.0);

  // ── Wifi signals ──────────────────────────────────────────
  // Wifi 1: inside the programs window (~30–42%)
  tl
    .to('#wifi-1', { opacity: 1, duration: 0.15 }, 3.0)
    .to('#wifi-1', { opacity: 0, duration: 0.2  }, 4.1);

  // Wifi 2: inside the stats window (~55–62%)
  tl
    .to('#wifi-2', { opacity: 1, duration: 0.15 }, 5.4)
    .to('#wifi-2', { opacity: 0, duration: 0.2  }, 6.1);

  // CSS animation classes for wifi rings
  ScrollTrigger.create({
    trigger: scene,
    start: 'top top',
    end: () => `+=${scrollDistance}`,
    onUpdate: (self) => {
      const p = self.progress;
      wifi1.classList.toggle('animating', p >= 0.30 && p <= 0.42);
      wifi2.classList.toggle('animating', p >= 0.54 && p <= 0.63);
      laptopUI.classList.toggle('active', p >= 0.90);
    }
  });


  // ── Below-fold scroll reveals ─────────────────────────────
  setupReveal();

  function setupReveal() {
    document.querySelectorAll('.section-header, .detail-card, .donate-card, .team-card, .about-story, .cta-compact').forEach(el => {
      el.classList.add('reveal');
    });

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12 });
      document.querySelectorAll('.reveal').forEach(el => io.observe(el));
    } else {
      document.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));
    }
  }

})();
