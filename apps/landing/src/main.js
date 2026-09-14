import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { initShaders } from './shaders.js';
import './styles.css';

gsap.registerPlugin(ScrollTrigger);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const lenis = new Lenis({ duration: reduceMotion ? 0 : 1.05, smoothWheel: !reduceMotion });

const releaseUrl = 'https://github.com/ivasuy/SpokeUI/releases/tag/v0.1.2';
const downloads = {
  macArm: {
    label: 'Download for macOS',
    shortLabel: 'Download for Mac',
    meta: 'Apple Silicon · DMG · v0.1.2',
    url: 'https://github.com/ivasuy/SpokeUI/releases/download/v0.1.2/SpokeUI-0.1.2-arm64.dmg',
  },
  macIntel: {
    label: 'Download for macOS',
    shortLabel: 'Download for Mac',
    meta: 'Intel · DMG · v0.1.2',
    url: 'https://github.com/ivasuy/SpokeUI/releases/download/v0.1.2/SpokeUI-0.1.2-x64.dmg',
  },
  windows: {
    label: 'Download for Windows',
    shortLabel: 'Download for Windows',
    meta: 'x64 · Installer · v0.1.2',
    url: 'https://github.com/ivasuy/SpokeUI/releases/download/v0.1.2/SpokeUI-0.1.2.Setup.exe',
  },
  linux: {
    label: 'Download for Linux',
    shortLabel: 'Download for Linux',
    meta: 'x64 · Debian package · v0.1.2',
    url: 'https://github.com/ivasuy/SpokeUI/releases/download/v0.1.2/spokeui_0.1.2_amd64.deb',
  },
  unknown: {
    label: 'Download SpokeUI',
    shortLabel: 'Download',
    meta: 'Choose a build for your system',
    url: releaseUrl,
  },
};

function detectDownload(architecture = '') {
  const platform = `${navigator.userAgentData?.platform || navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (platform.includes('win')) return downloads.windows;
  if (platform.includes('mac')) return /x86|x64|amd64/.test(architecture.toLowerCase()) ? downloads.macIntel : downloads.macArm;
  if (platform.includes('linux')) return downloads.linux;
  return downloads.unknown;
}

function applyDownload(download) {
  document.querySelectorAll('[data-download-cta]').forEach((link) => {
    link.href = download.url;
    link.setAttribute('aria-label', `${download.label}. ${download.meta}`);
    const label = link.querySelector('[data-download-label]');
    if (label) label.textContent = link.dataset.downloadLabelStyle === 'short' ? download.shortLabel : download.label;
  });
  document.querySelectorAll('[data-download-meta]').forEach((meta) => { meta.textContent = download.meta; });
}

function initDownloads() {
  applyDownload(detectDownload());
  const userAgentData = navigator.userAgentData;
  if (userAgentData?.getHighEntropyValues) {
    userAgentData.getHighEntropyValues(['architecture'])
      .then(({ architecture }) => applyDownload(detectDownload(architecture)))
      .catch(() => {});
  }

  const platformPicker = document.querySelector('.download-options');
  document.addEventListener('pointerdown', (event) => {
    if (platformPicker?.open && !platformPicker.contains(event.target)) platformPicker.removeAttribute('open');
  });
}

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);
lenis.on('scroll', ScrollTrigger.update);

function splitWords(element) {
  const text = element.textContent.trim();
  element.textContent = '';
  text.split(/\s+/).forEach((word, index, words) => {
    const span = document.createElement('span');
    span.textContent = word;
    element.append(span);
    if (index < words.length - 1) element.append(document.createTextNode(' '));
  });
  return [...element.querySelectorAll('span')];
}

function runPreloader() {
  const count = document.querySelector('.preloader-status strong');
  const progress = document.querySelector('.preloader-track i');
  const preloader = document.querySelector('.preloader');
  const value = { current: 0 };
  const timeline = gsap.timeline({ defaults: { ease: 'expo.out' } });
  if (preloader && count && progress) {
    timeline
      .to(value, { current: 100, duration: reduceMotion ? 0.05 : 1.25, onUpdate: () => { count.textContent = String(Math.round(value.current)).padStart(3, '0'); progress.style.transform = `scaleX(${value.current / 100})`; } })
      .to('.preloader-center', { y: -18, opacity: 0, duration: .35 }, '>-0.05')
      .to(preloader, { clipPath: 'inset(0 0 100% 0)', duration: reduceMotion ? 0.05 : .85, ease: 'expo.inOut' })
      .set(preloader, { display: 'none' });
  }
  timeline
    .from('.site-nav', { y: -24, opacity: 0, duration: .65 })
    .from('.hero-kicker', { y: 16, opacity: 0, duration: .55 }, '-=.5')
    .from('.hero h1 > span', { yPercent: 115, rotate: 2, stagger: .08, duration: .85 }, '-=.45')
    .from('.hero-copy-row', { y: 20, opacity: 0, duration: .6 }, '-=.55')
    .from('.hero-product', { y: 110, scale: .94, opacity: 0, duration: 1.1 }, '-=.55')
    .from('.hero-meta span', { y: 10, opacity: 0, stagger: .06, duration: .45 }, '-=.5');
}

function initHeroMotion() {
  gsap.to('.hero-backdrop canvas', {
    scale: 1.035,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
  });
  gsap.to('.hero-product', {
    y: 70,
    scale: .98,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: '35% top', end: 'bottom top', scrub: true },
  });
}

function initFillText() {
  const heading = document.querySelector('[data-fill-text]');
  const words = splitWords(heading);
  gsap.set(words, { color: 'rgba(28, 31, 38, .18)' });
  gsap.to(words, {
    color: '#1c1f26',
    stagger: .05,
    ease: 'none',
    scrollTrigger: { trigger: heading, start: 'top 80%', end: 'bottom 45%', scrub: true },
  });
}

function initWorkflow() {
  const steps = [...document.querySelectorAll('.workflow-step')];
  steps.forEach((step, index) => {
    ScrollTrigger.create({
      trigger: step,
      start: 'top 52%',
      end: 'bottom 52%',
      onEnter: () => steps.forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === index)),
      onEnterBack: () => steps.forEach((item, itemIndex) => item.classList.toggle('active', itemIndex === index)),
    });
  });
  gsap.fromTo('.workflow-visual', { rotateY: -7, scale: .9 }, {
    rotateY: 0,
    scale: 1,
    ease: 'none',
    scrollTrigger: { trigger: '.workflow-stage', start: 'top 78%', end: 'bottom 72%', scrub: true },
  });
  gsap.to('.context-one', { y: -18, x: 10, ease: 'none', scrollTrigger: { trigger: '.workflow-stage', start: 'top bottom', end: 'bottom top', scrub: 1 } });
  gsap.to('.context-two', { y: 22, x: -12, ease: 'none', scrollTrigger: { trigger: '.workflow-stage', start: 'top bottom', end: 'bottom top', scrub: 1 } });
}

function initReview() {
  gsap.from('.review-art', {
    clipPath: 'inset(16% 22% 16% 22% round 28px)',
    scale: .93,
    ease: 'none',
    scrollTrigger: { trigger: '.review-section', start: 'top 80%', end: 'top 18%', scrub: true },
  });
  gsap.from('[data-review-card]', {
    y: 90,
    rotate: 2.5,
    opacity: 0,
    ease: 'expo.out',
    scrollTrigger: { trigger: '[data-review-card]', start: 'top 86%', end: 'top 58%', scrub: 1 },
  });
  gsap.fromTo('.after-ui .component-cta', {
    scaleX: .58,
    transformOrigin: 'left center',
  }, {
    scaleX: 1,
    transformOrigin: 'left center',
    ease: 'power3.out',
    scrollTrigger: { trigger: '.review-card', start: 'top 65%', toggleActions: 'play none none reverse' },
  });
}

function initDebug() {
  const items = [...document.querySelectorAll('.debug-menu button')];
  const answers = [
    ['The selected component is rendered by <code>src/app/page.tsx</code>. Its failure originates in a duplicate seeding call, not the component layout.', 'Source + console + network attached'],
    ['This component owns the page-level data request, renders the hero state, and passes the selected record into its child view.', 'Structure + props + dependencies attached'],
    ['The selected element maps to <code>src/app/page.tsx</code> and inherits its visual tokens from <code>src/app/globals.css</code>.', 'Source mapping attached'],
    ['The active error is an E11000 duplicate-key failure triggered while starter records are seeded concurrently.', 'Console trace attached'],
    ['Two homepage requests call the same seed path before the first write completes.', 'Request timeline attached'],
    ['The selected body is fixed to the desktop viewport and clips its error actions below 768px.', 'Three responsive breakpoints checked'],
  ];
  const answer = document.querySelector('.agent-answer');
  items.forEach((item, index) => {
    item.addEventListener('click', () => {
      items.forEach((button, buttonIndex) => {
        const active = buttonIndex === index;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      answer.querySelector('p').innerHTML = answers[index][0];
      answer.querySelector('footer').textContent = answers[index][1];
      gsap.fromTo(answer, { y: 8, opacity: .65 }, { y: 0, opacity: 1, duration: .35, ease: 'power2.out' });
    });
  });
  gsap.from('.agent-answer', { x: 70, opacity: 0, duration: .9, ease: 'expo.out', scrollTrigger: { trigger: '.debug-demo', start: 'top 55%', toggleActions: 'play none none reverse' } });
}

function initReveals() {
  document.querySelectorAll('.section-index, .workflow-header h2, .review-copy > *, .debug-heading > *, .runtime-name').forEach((element) => {
    gsap.from(element, { y: 32, opacity: 0, duration: .8, ease: 'expo.out', scrollTrigger: { trigger: element, start: 'top 88%', toggleActions: 'play none none reverse' } });
  });
  gsap.to('.cta-field canvas', { scale: 1.04, ease: 'none', scrollTrigger: { trigger: '.final-cta', start: 'top bottom', end: 'bottom top', scrub: true } });
}

function initMagneticButtons() {
  document.querySelectorAll('.nav-cta, .primary-cta').forEach((button) => {
    button.addEventListener('pointermove', (event) => {
      if (reduceMotion) return;
      const rect = button.getBoundingClientRect();
      gsap.to(button, { x: (event.clientX - rect.left - rect.width / 2) * .12, y: (event.clientY - rect.top - rect.height / 2) * .12, duration: .35, ease: 'power3.out' });
    });
    button.addEventListener('pointerleave', () => gsap.to(button, { x: 0, y: 0, duration: .5, ease: 'expo.out' }));
  });
}

initDownloads();
initShaders({ reduceMotion });

if (!reduceMotion) {
  runPreloader();
  initHeroMotion();
  initFillText();
  initWorkflow();
  initReview();
  initDebug();
  initReveals();
  initMagneticButtons();
} else {
  document.querySelector('.preloader')?.remove();
}
