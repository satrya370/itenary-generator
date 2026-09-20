'use strict';

const ICONS = {
  transport: '<path d="M5 16h14l-1-7H6l-1 7Z"/><path d="M8 9 9 5h6l1 4M7 19h2m6 0h2"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
  sightseeing: '<path d="m12 3 2.2 5.2L20 10l-4.3 3.7L16.7 19 12 16.1 7.3 19l1-5.3L4 10l5.8-1.8L12 3Z"/>',
  food: '<path d="M6 3v8m3-8v8m-3 0h3m-1.5 0V21M15 3v18m0-18c3 1 3 5 0 6"/>',
  activity: '<circle cx="12" cy="12" r="8"/><path d="m12 7 1.5 3.5L17 12l-3.5 1.5L12 17l-1.5-3.5L7 12l3.5-1.5L12 7Z"/>',
  rest: '<path d="M4 12h16M5 12V9h5a2 2 0 0 1 2 2v1m0 0V9h5a2 2 0 0 1 2 2v1M4 18v-6m16 6v-6"/>',
  accommodation: '<path d="M4 18V8m0 7h16v3M7 13V9h4a2 2 0 0 1 2 2v2m0 0V9h4a2 2 0 0 1 2 2v2"/>',
  free: '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>'
};

const DEFAULT_PALETTE = { primary:'#175CD3', secondary:'#0E7490', accent:'#FF5B45', surface:'#F5F7FA', textDark:'#1D2433', textMuted:'#667085', border:'#E4E7EC', gradientStops:['#102A43','#175CD3','#0E7490'] };
const DEFAULT_VISIBILITY = { overview:true, practical:true, closing:true };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function textList(values) {
  return (Array.isArray(values) ? values : []).filter(Boolean).map((v) => esc(typeof v === 'object' ? (v.note || v.label || v.value || '') : v));
}
function tipEntries(values) {
  return (Array.isArray(values) ? values : []).filter(Boolean).map((v) => (typeof v === 'object' ? { topic: v.topic || v.label || '', note: v.note || v.value || '' } : { topic: '', note: v }));
}
const EMOJI_TO_TYPE = { '🌾':'sightseeing','🏛️':'sightseeing','🎨':'sightseeing','🚶':'activity','🍽️':'food','🍴':'food','🚗':'transport','🚕':'transport','🛌':'accommodation','🏨':'accommodation','☀️':'free','⛰️':'sightseeing' };
const KEYWORD_TO_TYPE = [[/kuliner|makan|santap|food/i,'food'],[/transport|kendaraan|jalan menuju|perjalanan/i,'transport'],[/menginap|akomodasi|hotel/i,'accommodation'],[/istirahat|santai|bebas/i,'rest'],[/budaya|seni|sejarah|museum|pura|lanskap|alam/i,'sightseeing']];
function resolveIconType(type, title='') {
  if (ICONS[type]) return type;
  if (EMOJI_TO_TYPE[type]) return EMOJI_TO_TYPE[type];
  const match = KEYWORD_TO_TYPE.find(([re]) => re.test(title));
  return match ? match[1] : 'activity';
}
function icon(type, className='', title='') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[resolveIconType(type, title)]}</svg>`;
}
function paletteVars(palette) {
  const p = { ...DEFAULT_PALETTE, ...(palette || {}) };
  return Object.entries(p).filter(([, value]) => !Array.isArray(value)).map(([key, value]) => `--${key}:${esc(value)}`).join(';');
}
function styles() {
  return `<style>
@page{size:A4;margin:14mm 12mm}*{box-sizing:border-box}html{background:#eef2f6}body{margin:0;background:var(--surface);color:var(--textDark);font-family:"Segoe UI Variable","Aptos",Inter,ui-sans-serif,system-ui,-apple-system,Arial,sans-serif;line-height:1.55;font-size:15px}main{max-width:1120px;min-height:100vh;margin:auto;background:#fff}.brochure{overflow:hidden}.hero{position:relative;min-height:258px;padding:22px 20px 28px;display:flex;align-items:flex-end;color:#fff;isolation:isolate;background:linear-gradient(125deg,var(--primary),var(--secondary))}.hero::before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(circle at 82% 12%,rgba(255,255,255,.2),transparent 30%),linear-gradient(180deg,rgba(7,20,40,.05),rgba(7,20,40,.84))}.hero.has-photo{background-image:linear-gradient(180deg,rgba(7,20,40,.12),rgba(7,20,40,.86)),var(--hero-image);background-size:cover;background-position:center}.hero-top{position:absolute;inset:20px 20px auto;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.agency{display:flex;align-items:center;gap:8px}.agency::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 4px rgba(255,255,255,.14)}.scope{padding:5px 9px;border:1px solid rgba(255,255,255,.38);border-radius:999px;color:#fff}.hero-copy{max-width:730px}.hero-kicker{margin:0 0 8px;opacity:.8;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}.hero h1{margin:0;max-width:700px;font-size:clamp(32px,8vw,56px);font-weight:750;letter-spacing:-.048em;line-height:1.02}.hero-location{margin:11px 0 0;font-size:15px;font-weight:500;opacity:.9}.content{padding:0 20px 36px}.facts-strip{position:relative;z-index:2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0;margin:-16px 0 0;border:1px solid var(--border);border-radius:13px;background:#fff;box-shadow:0 12px 26px rgba(16,42,67,.1)}.fact{min-width:0;padding:12px 13px;border-bottom:1px solid var(--border)}.fact:nth-last-child(-n+2){border-bottom:0}.fact-label{display:block;color:var(--textMuted);font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase}.fact-value{display:block;margin-top:2px;font-size:13px;font-weight:700;line-height:1.3;overflow-wrap:break-word}.section{padding:30px 0;border-bottom:1px solid var(--border)}.section:last-child{border-bottom:0}.section-heading{display:flex;align-items:center;gap:10px;margin:0 0 13px;font-size:24px;font-weight:750;letter-spacing:-.03em;line-height:1.15}.section-heading::before{content:"";width:4px;height:23px;border-radius:999px;background:var(--accent)}.summary{max-width:720px;margin:0;color:#354052;font-size:16px}.route-line{display:flex;flex-wrap:wrap;gap:7px;align-items:center;margin:17px 0 0;color:var(--textMuted);font-size:13px;font-weight:650}.route-line strong{color:var(--textDark)}.route-line .route-stop{display:inline-flex;align-items:center;gap:7px}.route-line .route-stop:not(:last-child)::after{content:"";width:18px;height:1px;background:var(--border)}.highlights{display:grid;gap:0;margin-top:20px;border-top:1px solid var(--border)}.highlight{display:grid;grid-template-columns:28px 1fr;gap:10px;padding:13px 0;border-bottom:1px solid var(--border)}.icon{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}.highlight .icon{color:var(--primary)}.highlight strong{display:block;font-size:14px}.highlight span{display:block;margin-top:1px;color:var(--textMuted);font-size:13px}.day-index{display:flex;gap:8px;overflow:auto;padding:0 0 4px;margin:0 0 19px;scrollbar-width:none}.day-index::-webkit-scrollbar{display:none}.day-index span{flex:0 0 auto;padding:8px 11px;border:1px solid var(--border);border-radius:9px;background:#fff;color:var(--textMuted);font-size:12px;font-weight:700}.day-index span:first-child{border-color:var(--primary);background:color-mix(in srgb,var(--primary) 8%,#fff);color:var(--primary)}.day-section{padding:0 0 12px}.day-section+.day-section{padding-top:28px;border-top:1px solid var(--border)}.day-header{display:flex;gap:13px;align-items:flex-start;margin:0 0 14px}.day-number{display:grid;flex:0 0 auto;place-items:center;width:44px;height:44px;border-radius:12px;background:var(--primary);color:#fff;font-size:12px;font-weight:800;letter-spacing:.06em}.day-label{display:block;color:var(--primary);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.day-header h3{margin:2px 0 0;font-size:20px;font-weight:750;letter-spacing:-.025em;line-height:1.15}.day-header p{margin:4px 0 0;color:var(--textMuted);font-size:13px}.timeline{position:relative}.timeline::before{content:"";position:absolute;top:9px;bottom:19px;left:77px;width:2px;background:linear-gradient(var(--primary),color-mix(in srgb,var(--primary) 22%,transparent))}.timeline-stop{position:relative;display:grid;grid-template-columns:54px 34px minmax(0,1fr);gap:11px;padding:0 0 24px;break-inside:avoid;page-break-inside:avoid}.stop-time{padding-top:6px;color:var(--textMuted);font-size:12px;font-weight:750;letter-spacing:.01em;text-align:right}.stop-marker{position:relative;z-index:1;display:grid;place-items:center;width:34px;height:34px;border:2px solid var(--primary);border-radius:50%;background:#fff;color:var(--primary)}.stop-marker .icon{width:17px;height:17px}.stop-content{padding:2px 0 5px;border-bottom:1px solid var(--border)}.stop-topline{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}.stop-topline h4{margin:0;font-size:17px;font-weight:750;letter-spacing:-.02em;line-height:1.28}.stop-duration{color:var(--textMuted);font-size:12px;font-weight:650}.stop-description{margin:6px 0 0;color:#3d4757;font-size:14px}.stop-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px;color:var(--textMuted);font-size:12px;font-weight:650}.stop-meta span+span::before{content:"·";padding-right:7px;color:#98a2b3}.tip-callout{display:flex;gap:8px;align-items:flex-start;margin:11px 0 1px;padding:9px 10px;border-left:3px solid var(--accent);background:color-mix(in srgb,var(--accent) 10%,#fff);color:#495668;font-size:12px}.tip-callout b{color:var(--textDark)}.meal-row{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 0}.meal-chip{padding:3px 9px;border:1px solid var(--border);border-radius:999px;background:#fff;color:var(--textMuted);font-size:11px;font-weight:650}.block-transport-note{margin:8px 0 16px}.block-tip{margin:16px 0 0}.practical-item .topic-tip{margin:0 0 8px}.practical-item .topic-tip:last-child{margin-bottom:0}.topic-tip b{display:block;color:var(--textDark);font-size:12px;font-weight:700}.topic-tip span{display:block;margin-top:1px;color:#465367;font-size:13px}.travel-connector{position:relative;display:grid;grid-template-columns:54px 34px minmax(0,1fr);gap:11px;padding:0 0 18px;break-inside:avoid;page-break-inside:avoid}.travel-line{position:relative;z-index:1;width:34px;height:26px}.travel-line::before{content:"";position:absolute;top:0;bottom:0;left:16px;border-left:2px dashed color-mix(in srgb,var(--primary) 45%,transparent)}.travel-note{align-self:center;padding:6px 9px;border:1px dashed color-mix(in srgb,var(--primary) 34%,var(--border));border-radius:8px;color:var(--textMuted);font-size:12px;font-weight:650}.travel-note .icon{width:15px;height:15px;margin:0 6px -3px 0;color:var(--primary)}.timeline-stop.is-accommodation .stop-marker{border-color:var(--secondary);color:var(--secondary);background:color-mix(in srgb,var(--secondary) 8%,#fff)}.timeline-stop.is-accommodation .stop-content{padding:12px;border:1px solid color-mix(in srgb,var(--secondary) 22%,var(--border));border-radius:10px;background:color-mix(in srgb,var(--secondary) 5%,#fff)}.timeline-stop.is-accommodation .stop-content{border-bottom:1px solid color-mix(in srgb,var(--secondary) 22%,var(--border))}.guide-intro{max-width:720px;margin:-2px 0 19px;color:var(--textMuted)}.guide-groups{display:grid;gap:30px}.guide-group{position:relative}.guide-group-heading{display:flex;align-items:center;gap:10px;margin:0 0 12px}.group-number{color:var(--primary);font-size:12px;font-weight:800;letter-spacing:.1em}.guide-group h3{margin:0;font-size:20px;font-weight:750;letter-spacing:-.025em}.guide-group>p{margin:0 0 15px;color:var(--textMuted);font-size:13px}.spot-grid{display:grid;gap:12px}.spot-card{position:relative;padding:16px 0 16px 15px;border-top:1px solid var(--border);border-left:3px solid var(--accent);break-inside:avoid;page-break-inside:avoid}.spot-index{display:block;margin-bottom:5px;color:var(--primary);font-size:11px;font-weight:800;letter-spacing:.1em}.spot-card h4{margin:0;font-size:18px;font-weight:750;letter-spacing:-.025em}.spot-subtitle{margin:4px 0 0;color:var(--textMuted);font-size:12px;font-weight:650}.spot-description{margin:9px 0 0;color:#3d4757;font-size:14px}.spot-details{display:grid;grid-template-columns:1fr;gap:8px;margin-top:13px}.spot-details dt{margin:0;color:var(--textMuted);font-size:10px;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.spot-details dd{margin:1px 0 0;font-size:13px;font-weight:650}.spot-tip{margin:12px 0 0;color:#495668;font-size:12px}.spot-tip b{color:var(--textDark)}.practical-grid{display:grid;gap:0;border-top:1px solid var(--border)}.practical-item{padding:14px 0;border-bottom:1px solid var(--border)}.practical-item h3{display:flex;justify-content:space-between;gap:12px;margin:0;color:var(--textDark);font-size:15px;font-weight:750}.practical-item h3 span{color:var(--textMuted);font-size:12px;font-weight:650}.practical-item ul{margin:8px 0 0;padding-left:18px;color:#465367;font-size:13px}.closing{margin-top:1px;padding:25px 20px;background:var(--textDark);color:#fff}.closing h2{margin:0;font-size:22px;font-weight:750;letter-spacing:-.03em}.closing p{max-width:650px;margin:9px 0 0;color:rgba(255,255,255,.82);font-size:14px}.closing strong{color:#fff}.credits{margin-top:17px;color:rgba(255,255,255,.55);font-size:11px}@media(min-width:720px){.hero{min-height:365px;padding:34px 54px 43px}.hero-top{inset:28px 54px auto}.content{padding:0 54px 54px}.facts-strip{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:-21px}.fact{padding:15px 17px;border-right:1px solid var(--border);border-bottom:0}.fact:last-child{border-right:0}.section{padding:40px 0}.highlights{grid-template-columns:repeat(3,minmax(0,1fr));column-gap:22px}.highlight{padding:15px 0;border-bottom:0}.timeline::before{left:102px}.timeline-stop,.travel-connector{grid-template-columns:76px 34px minmax(0,1fr);gap:14px}.day-index{margin-bottom:25px}.spot-grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:34px;row-gap:0}.spot-details{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:16px}.practical-grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:32px}.practical-item:nth-child(odd){padding-right:14px}.practical-item:nth-child(even){padding-left:14px}.closing{margin:0 -54px;padding:36px 54px}.mode-half_day .section{padding-top:30px;padding-bottom:30px}.mode-half_day .hero{min-height:300px}.mode-half_day .timeline-stop{padding-bottom:18px}}@media print{html{background:#fff}body{font-size:12px}main{max-width:none}.hero,.closing{print-color-adjust:exact;-webkit-print-color-adjust:exact}.facts-strip{box-shadow:none}.section,.day-section,.timeline-stop,.travel-connector,.spot-card{break-inside:avoid;page-break-inside:avoid}.hero{min-height:230px}.content{padding:0 0 18px}.closing{margin:0;padding:20px}.day-index{overflow:visible}.day-index span{white-space:nowrap}}
.day-section+.day-section{padding-top:20px;border-top:0}.timeline-stop{padding-bottom:20px}.stop-content{padding-bottom:8px;border-bottom:0}.timeline-stop.is-accommodation .stop-content{padding:12px;border:1px solid color-mix(in srgb,var(--secondary) 22%,var(--border));border-radius:10px;background:color-mix(in srgb,var(--secondary) 5%,#fff)}.schedule-half .timeline{max-width:760px}.schedule-half .timeline-stop{padding-bottom:15px}.schedule-half .stop-time{font-size:13px;color:var(--primary)}.schedule-half .stop-description{font-size:13px}.schedule-full .stop-time{color:var(--primary);font-size:14px}.schedule-full .stop-marker{box-shadow:0 0 0 5px color-mix(in srgb,var(--primary) 7%,transparent)}.schedule-full .timeline-stop{padding-bottom:27px}.schedule-short .day-header{padding-bottom:10px;border-bottom:1px solid color-mix(in srgb,var(--primary) 15%,var(--border))}.schedule-short .day-number{border-radius:50%}.schedule-week .day-index{gap:0;border:1px solid var(--border);border-radius:10px;background:#fff}.schedule-week .day-index span{border:0;border-radius:0;border-right:1px solid var(--border);background:transparent}.schedule-week .day-index span:first-child{background:color-mix(in srgb,var(--primary) 8%,#fff)}.schedule-week .day-index span:last-child{border-right:0}.schedule-week .day-header{position:relative;padding:10px 0 12px}.schedule-week .day-header::after{content:"";position:absolute;right:0;bottom:0;width:calc(100% - 57px);height:1px;background:linear-gradient(90deg,var(--primary),transparent)}.schedule-week .day-number{border-radius:9px;box-shadow:inset 0 0 0 1px color-mix(in srgb,#fff 38%,transparent)}.schedule-long .day-index{gap:6px}.schedule-long .day-index span{padding:6px 8px;font-size:11px}.schedule-long .day-header{margin-top:5px}.schedule-long .day-number{width:36px;height:36px;border-radius:50%;font-size:10px}.schedule-long .day-header h3{font-size:18px}.schedule-long .timeline-stop{padding-bottom:16px}.schedule-long .stop-description{font-size:13px}@media(max-width:719px){.schedule-week .day-index{margin-left:0;margin-right:0}.schedule-week .day-index span{padding:8px 10px}.schedule-week .day-header::after{width:calc(100% - 57px)}}
</style>`;
}

function renderHero(itinerary) {
  const hero = itinerary.hero || {};
  const style = hero.photoUrl ? ` style="--hero-image:url('${esc(hero.photoUrl).replace(/'/g, '%27')}')"` : '';
  const location = [itinerary.destination, itinerary.region, itinerary.country].filter(Boolean).map(esc).join(' · ');
  return `<header class="hero${hero.photoUrl ? ' has-photo' : ''}"${style}><div class="hero-top"><span class="agency">${esc(itinerary.agencyName || 'Travel Studio')}</span><span class="scope">${esc(itinerary.scopeLabel || itinerary.itineraryMode || '')}</span></div><div class="hero-copy"><p class="hero-kicker">Curated route · ${esc(itinerary.paceLevel || 'Balanced')}</p><h1>${esc(itinerary.tripTitle || itinerary.destination || 'Your itinerary')}</h1><p class="hero-location">${location}</p></div></header>`;
}
function facts(itinerary) {
  const quick = itinerary.overview?.quickFacts || {};
  const themes = Array.isArray(quick.themes) ? quick.themes.join(', ') : (quick.themes || (itinerary.themes || []).join(', '));
  const values = [['Duration', quick.scope || itinerary.scopeLabel], ['Pace', quick.pace || itinerary.paceLevel], ['Best for', quick.bestSeason], ['Themes', themes]].filter(([, value]) => value);
  return values.length ? `<div class="facts-strip">${values.map(([label, value]) => `<div class="fact"><span class="fact-label">${esc(label)}</span><strong class="fact-value">${esc(value)}</strong></div>`).join('')}</div>` : '';
}
function renderOverview(itinerary) {
  const overview = itinerary.overview || {};
  const rawRoute = overview.routeSummary;
  const route = Array.isArray(rawRoute)
    ? rawRoute.filter(Boolean)
    : (typeof rawRoute === 'string' && rawRoute.trim() ? rawRoute.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean) : []);
  const highlights = Array.isArray(overview.highlights) ? overview.highlights.filter(Boolean) : [];
  if (!overview.summary && !route.length && !highlights.length) return '';
  const routeText = (stop) => esc(typeof stop === 'object' && stop ? (stop.note || stop.title || stop.day || stop.label || stop.value || '') : stop);
  return `<section class="section overview" id="overview"><h2 class="section-heading">Trip overview</h2>${overview.summary ? `<p class="summary">${esc(overview.summary)}</p>` : ''}${route.length ? `<div class="route-line"><strong>Route</strong>${route.map((stop) => `<span class="route-stop">${routeText(stop)}</span>`).join('')}</div>` : ''}${highlights.length ? `<div class="highlights">${highlights.map((highlight) => `<div class="highlight">${icon(highlight.icon || 'sightseeing', '', highlight.title || '')}<div><strong>${esc(highlight.title || '')}</strong><span>${esc(highlight.note || '')}</span></div></div>`).join('')}</div>` : ''}</section>`;
}
function blockLabel(block, index) {
  return block.blockLabel || block.dayLabel || block.day || `Day ${index + 1}`;
}
function renderTravel(activity) {
  const duration = activity.durationLabel || activity.duration;
  const label = [duration, activity.description || activity.title].filter(Boolean).map(esc).join(' · ');
  return `<div class="travel-connector"><span></span><span class="travel-line"></span><div class="travel-note">${icon('transport')} ${label || 'Travel to the next stop'}</div></div>`;
}
function renderStop(activity, fallbackTime='') {
  const type = activity.type || 'activity';
  const isStay = type === 'accommodation';
  const title = activity.title || activity.name || (isStay ? 'Accommodation' : 'Planned stop');
  const time = activity.timeLabel || activity.time || fallbackTime;
  const duration = activity.durationLabel || activity.duration;
  const metadata = [activity.area, activity.category].filter(Boolean);
  return `<article class="timeline-stop${isStay ? ' is-accommodation' : ''}"><time class="stop-time">${esc(time)}</time><div class="stop-marker">${icon(type, '', title)}</div><div class="stop-content"><div class="stop-topline"><h4>${esc(title)}</h4>${duration ? `<span class="stop-duration">${esc(duration)}</span>` : ''}</div>${activity.description ? `<p class="stop-description">${esc(activity.description)}</p>` : ''}${metadata.length ? `<div class="stop-meta">${metadata.map((value) => `<span>${esc(value)}</span>`).join('')}</div>` : ''}${activity.tip ? `<div class="tip-callout"><span>✦</span><div><b>Local tip</b> · ${esc(activity.tip)}</div></div>` : ''}</div></article>`;
}
function accommodationStop(block) {
  const accommodation = block.accommodation;
  if (!accommodation) return '';
  if (typeof accommodation === 'string') return renderStop({ type:'accommodation', title:'Overnight stay', description:accommodation });
  if (Array.isArray(accommodation)) return accommodation.filter(Boolean).map((entry) => renderStop({ type:'accommodation', title:'Overnight stay', description:typeof entry === 'string' ? entry : (entry.note || entry.description), area:typeof entry === 'object' ? entry.area : undefined })).join('');
  return renderStop({ type:'accommodation', title:accommodation.name || 'Overnight stay', description:accommodation.note || accommodation.description, area:accommodation.area, tip:accommodation.tip });
}
function renderScheduled(itinerary) {
  const blocks = Array.isArray(itinerary.schedule) ? itinerary.schedule : [];
  const multiDay = itinerary.itineraryMode === 'multi_day';
  const tripDays = Number(itinerary.durationDays) || blocks.length;
  const scale = multiDay ? (tripDays >= 8 ? 'long' : tripDays >= 5 ? 'week' : 'short') : itinerary.itineraryMode === 'half_day' ? 'half' : 'full';
  const index = multiDay ? `<nav class="day-index" aria-label="Itinerary days">${blocks.map((block, i) => `<span>${esc(blockLabel(block, i))}</span>`).join('')}</nav>` : '';
  const body = blocks.map((block, index) => {
    const activities = Array.isArray(block.activities) ? block.activities : [];
    const meals = textList(block.mealsIncluded);
    const mealsHtml = meals.length ? `<div class="meal-row">${meals.map((m) => `<span class="meal-chip">${m}</span>`).join('')}</div>` : '';
    const transportHtml = block.transportNote ? `<div class="travel-note block-transport-note">${icon('transport')} ${esc(block.transportNote)}</div>` : '';
    const tipHtml = block.blockTip ? `<div class="tip-callout block-tip"><span>✦</span><div><b>Tip</b> · ${esc(block.blockTip)}</div></div>` : '';
    const label = blockLabel(block, index);
    const subtitleParts = [...new Set([block.location, block.blockRangeLabel, block.date, block.area, block.summary].filter(Boolean).filter((part) => part !== label))];
    const header = multiDay
      ? `<header class="day-header day-header-${scale}"><div class="day-number">${String(index + 1).padStart(2, '0')}</div><div><span class="day-label">${esc(label)}</span><h3>${esc(block.title || label)}</h3>${subtitleParts.length ? `<p>${subtitleParts.map(esc).join(' · ')}</p>` : ''}${mealsHtml}</div></header>`
      : `${block.title ? `<p class="summary">${esc(block.title)}</p>` : ''}${mealsHtml}`;
    const stops = activities.map((activity) => activity?.type === 'transport' && !(activity?.timeLabel || activity?.time) ? renderTravel(activity) : renderStop(activity || {})).join('') + (multiDay ? accommodationStop(block) : '');
    return `<section class="day-section">${header}${transportHtml}<div class="timeline">${stops}</div>${tipHtml}</section>`;
  }).join('');
  return `<section class="section schedule schedule-${scale}" id="schedule"><h2 class="section-heading">${multiDay ? (scale === 'week' ? 'Your week at a glance' : scale === 'long' ? 'Your extended journey' : 'Your journey') : scale === 'half' ? 'Your half-day agenda' : 'Your day route'}</h2>${index}${body}</section>`;
}
function renderGuide(itinerary) {
  const spots = Array.isArray(itinerary.spots) ? itinerary.spots : [];
  const groups = [];
  spots.forEach((spot) => { const label = spot.groupLabel || ''; let group = groups.find((entry) => entry.label === label); if (!group) { group = { label, spots: [] }; groups.push(group); } group.spots.push(spot); });
  const groupMarkup = groups.map((group, groupIndex) => `<section class="guide-group">${group.label ? `<div class="guide-group-heading"><span class="group-number">AREA ${String(groupIndex + 1).padStart(2, '0')}</span><h3>${esc(group.label)}</h3></div><p>Explore these places as one area, with enough room to follow your own pace.</p>` : ''}<div class="spot-grid">${group.spots.map((spot, spotIndex) => `<article class="spot-card"><span class="spot-index">PLACE ${String(spotIndex + 1).padStart(2, '0')}</span><h4>${esc(spot.name || '')}</h4><p class="spot-subtitle">${[spot.area, spot.category].filter(Boolean).map(esc).join(' · ')}</p>${spot.description ? `<p class="spot-description">${esc(spot.description)}</p>` : ''}<dl class="spot-details"><div><dt>Suggested visit</dt><dd>${esc(spot.suggestedDuration || '')}</dd></div><div><dt>Best time</dt><dd>${esc(spot.bestTimeToVisit || '')}</dd></div><div><dt>Getting there</dt><dd>${esc(spot.gettingThere || '')}</dd></div>${spot.nearbyPairing ? `<div><dt>Pairs well with</dt><dd>${esc(spot.nearbyPairing)}</dd></div>` : ''}</dl>${textList(spot.tips).length ? `<p class="spot-tip"><b>Local tip</b> · ${textList(spot.tips)[0]}</p>` : ''}</article>`).join('')}</div></section>`).join('');
  return `<section class="section guide" id="guide"><h2 class="section-heading">Explore the destination</h2><p class="guide-intro">Choose the places that fit your interests and build each area at your own pace.</p><div class="guide-groups">${groupMarkup}</div></section>`;
}
function renderPractical(itinerary) {
  const practical = itinerary.practical || {};
  const groups = [['What to bring', practical.whatToBring], ['Included', practical.included], ['Not included', practical.notIncluded], ['Local notes', practical.localTips], ['Health & safety', practical.healthSafety], ['Emergency contacts', practical.emergencyContacts]].filter(([, values]) => Array.isArray(values) && values.length);
  if (!groups.length) return '';
  return `<section class="section practical" id="practical"><h2 class="section-heading">Know before you go</h2><div class="practical-grid">${groups.map(([title, values]) => {
    if (title === 'Local notes') {
      const tips = tipEntries(values);
      return `<div class="practical-item"><h3>${esc(title)}<span>${tips.length} item${tips.length === 1 ? '' : 's'}</span></h3>${tips.map((tip) => `<div class="topic-tip">${tip.topic ? `<b>${esc(tip.topic)}</b>` : ''}<span>${esc(tip.note)}</span></div>`).join('')}</div>`;
    }
    const items = textList(values);
    return `<div class="practical-item"><h3>${esc(title)}<span>${items.length} item${items.length === 1 ? '' : 's'}</span></h3><ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul></div>`;
  }).join('')}</div></section>`;
}
function renderClosing(itinerary) {
  const closing = itinerary.closing || {};
  const credits = Array.isArray(closing.photoCredits) ? closing.photoCredits.filter(Boolean) : [];
  if (!closing.closingNote && !closing.agencyContact && !closing.disclaimer && !credits.length) return '';
  return `<footer class="closing"><h2>Travel with confidence.</h2>${closing.closingNote ? `<p>${esc(closing.closingNote)}</p>` : ''}${closing.agencyContact ? `<p><strong>${esc(closing.agencyContact)}</strong></p>` : ''}${closing.disclaimer ? `<p>${esc(closing.disclaimer)}</p>` : ''}${credits.length ? `<div class="credits">Photo credits: ${credits.map((credit) => esc(credit.photographer || credit.source || '')).join(' · ')}</div>` : ''}</footer>`;
}
function renderItineraryHtml(itinerary = {}, options = {}) {
  const visibility = { ...DEFAULT_VISIBILITY, ...(options.visibility || itinerary.sectionVisibility || {}) };
  const mode = itinerary.itineraryMode || 'full_day';
  const body = mode === 'destination_guide' ? renderGuide(itinerary) : renderScheduled(itinerary);
  const sections = [facts(itinerary), visibility.overview ? renderOverview(itinerary) : '', body, visibility.practical ? renderPractical(itinerary) : ''].filter(Boolean).join('');
  const printFix = '<style>.closing{position:relative;margin:28px 20px 24px!important;padding:32px 28px!important;border-radius:18px;background:linear-gradient(135deg,#172B4D 0%,#102A43 58%,#0F766E 100%);overflow:hidden}.closing::before{content:"";position:absolute;inset:0 auto 0 0;width:5px;background:#B9D96B}.closing::after{content:"";position:absolute;right:-70px;top:-90px;width:220px;height:220px;border:1px solid rgba(255,255,255,.18);border-radius:50%;box-shadow:0 0 0 22px rgba(255,255,255,.04),0 0 0 44px rgba(255,255,255,.025)}.closing h2,.closing p,.closing .credits{position:relative;z-index:1}.closing h2{font-size:24px!important;letter-spacing:-.035em}.closing p{margin-top:10px!important}.closing .credits{margin-top:20px!important;padding-top:12px;border-top:1px solid rgba(255,255,255,.18)}@media print{main{min-height:0!important;overflow:visible!important}.content{padding-bottom:24px!important}.closing{margin:24px 12px 18px!important;padding:28px 32px!important;border-radius:14px;break-inside:avoid!important;page-break-inside:avoid!important}}</style>';
  return `<!doctype html><html lang="${itinerary.outputLanguage === 'en' ? 'en' : 'id'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(itinerary.tripTitle || itinerary.destination || 'Itinerary')}</title>${styles()}${printFix}</head><body><main class="brochure mode-${esc(mode)}" style="${paletteVars(itinerary.palette)}">${renderHero(itinerary)}<div class="content">${sections}</div>${visibility.closing ? renderClosing(itinerary) : ''}</main></body></html>`;
}

export { renderItineraryHtml, ICONS };

if (process.argv[1]?.replace(/\\/g, '/').endsWith('/render-itinerary-html.js')) {
  const fs = await import('node:fs');
  const input = process.argv[2];
  const output = process.argv[3] || 'itinerary.html';
  if (!input) throw new Error('Usage: node render-itinerary-html.js input.json [output.html]');
  fs.writeFileSync(output, renderItineraryHtml(JSON.parse(fs.readFileSync(input, 'utf8'))));
}
