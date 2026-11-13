import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { parseDocument } from '../../src/server/import/parse/extract.js';
import { readTimeLine, toTime24, durationIn } from '../../src/server/import/parse/time.js';
import { dayMarkerFor } from '../../src/server/import/parse/days.js';
import { classifyLines, headingFor } from '../../src/server/import/parse/lines.js';
import { fold } from '../../src/server/import/parse/text.js';
import { kindFromText, matchGuide, matchOption, dateFromText } from '../../src/server/import/normalize.js';
import type { ItineraryMode } from '../../src/contracts/types.js';

const FIXTURES = path.resolve('tests/fixtures/web/import');
const load = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8');

function parseFixture(name: string, mode: ItineraryMode) {
  return parseDocument(load(name), mode);
}

test('full day tidy (id): header fields, times in 24h, durations, lists, and only the summary left for later', () => {
  const r = parseFixture('id-full-day-tidy.txt', 'full_day');
  assert.equal(r.fields.trip.title, 'Tur Ubud dan Tegallalang');
  assert.equal(r.fields.trip.destination, 'Ubud');
  assert.equal(r.fields.trip.country, 'Indonesia');
  assert.equal(r.fields.trip.startDate, '2026-12-12');
  assert.equal(r.fields.guide.name, 'Made Surya');
  assert.equal(r.fields.guide.phone, '0812-3456-7890');
  assert.equal(r.fields.meeting.place, 'Hotel Puri Ayu, Ubud');
  assert.equal(r.fields.meeting.time, '07:30');
  assert.deepEqual(r.fields.lists.included, ['Pemandu wisata lokal', 'Makan siang', 'Transportasi ber-AC']);
  assert.deepEqual(r.fields.lists.notIncluded, ['Tip untuk pemandu', 'Pengeluaran pribadi']);
  assert.equal(r.fields.days.length, 1);
  const acts = r.fields.days[0].activities;
  assert.deepEqual(acts.map((a) => a.time), ['07:30', '08:30', '11:00', '12:30', '14:00']);
  assert.deepEqual(acts.map((a) => a.durationMinutes), [60, 120, 90, null, null]);
  assert.equal(acts[0].title, 'Jemput di hotel');
  assert.equal(acts[2].title, 'Pasar seni Ubud');
  assert.equal(acts[0].kind, 'transport');
  assert.deepEqual(r.unconsumed.map((u) => u.text), ['Perjalanan sehari ke sawah terasering dan pasar seni Ubud.']);
  assert.equal(r.consumedLines, 21);
  assert.equal(r.totalLines, 22);
});

test('half day messy (en): 12-hour clock, ranges, meeting time, phone, and the emoji title are read without guessing', () => {
  const r = parseFixture('en-half-day-messy.txt', 'half_day');
  assert.equal(r.fields.trip.title, 'Half day Kyoto walk 🌸');
  assert.equal(r.fields.trip.country, 'Japan');
  assert.equal(r.fields.guide.name, 'Hiro');
  assert.equal(r.fields.guide.phone, '+81 90-1234-5678');
  assert.equal(r.fields.meeting.time, '08:00');
  const acts = r.fields.days[0].activities;
  assert.deepEqual(acts.map((a) => a.time), ['08:00', '10:00', '12:00', '14:00']);
  assert.deepEqual(acts.map((a) => a.durationMinutes), [90, null, null, null]);
  assert.deepEqual(acts.map((a) => a.kind), ['sightseeing', 'sightseeing', 'food', 'free']);
  assert.equal(acts[0].title, 'Fushimi Inari shrine walk', 'the duration phrase leaves the title');
  assert.equal(r.unconsumed.length, 0);
  assert.equal(r.consumedLines, r.totalLines);
});

test('multi-day (id): each marker starts a day in order; activities keep their own times and durations', () => {
  const r = parseFixture('id-multi-day-3.txt', 'multi_day');
  assert.deepEqual(r.fields.days.map((d) => [d.dayNumber, d.title]), [[1, 'Ubud'], [2, 'Kintamani'], [3, 'Pantai']]);
  assert.deepEqual(r.fields.days[1].activities.map((a) => [a.time, a.durationMinutes]), [['07:00', 120], ['10:00', 180]]);
  assert.equal(r.fields.days[2].activities[1].time, '12:00');
  assert.equal(r.fields.days[2].activities[1].kind, 'transport');
  assert.equal(r.unconsumed.length, 0);
});

test('destination guide: places stay for the AI step, emergency contacts are read from their section', () => {
  const r = parseFixture('id-destination-guide.txt', 'destination_guide');
  assert.equal(r.fields.days.length, 0, 'destination guides have no day structure');
  assert.deepEqual(r.fields.lists.included, ['Air mineral']);
  assert.deepEqual(r.fields.emergencyContacts, [{ label: 'Polisi', value: '110' }, { label: 'Ambulans', value: '118' }]);
  assert.deepEqual(r.unconsumed.map((u) => u.text), ['- Candi Prambanan (Sleman)', '- Malioboro (Kota Yogyakarta)']);
});

test('injected instruction inside the document never becomes a value; an unclear hour keeps its text and drops the time', () => {
  const r = parseFixture('id-whatsapp-injection.txt', 'half_day');
  assert.equal(JSON.stringify(r.fields).includes('Raja Ampat'), false, 'injected place must not reach any field');
  assert.ok(r.unconsumed.some((u) => /abaikan instruksi/.test(u.text)), 'the injected line is kept as plain text');
  const acts = r.fields.days[0].activities;
  const unclear = acts.find((a) => a.title.includes('makan malam'));
  assert.ok(unclear, 'the unclear activity keeps its text');
  assert.equal(unclear.time, null, 'no time is guessed from "jam 8"');
  assert.equal(unclear.ambiguousTime, true);
  assert.ok(r.notes.some((n) => n.includes('jam tidak jelas')));
});

test('more than 14 days: only the first 14 are read and the rest is reported', () => {
  const r = parseFixture('id-multi-day-15.txt', 'multi_day');
  assert.equal(r.fields.days.length, 14);
  assert.ok(r.notes.some((n) => n.includes('lebih dari 14 hari')));
  assert.ok(!r.fields.days.some((d) => d.dayNumber === 15));
});

test('half or full day with several day markers reads day 1 only and says to choose multi-day', () => {
  const r = parseDocument('Hari 1\n09:00 Pagi\nHari 2\n10:00 Siang', 'half_day');
  assert.equal(r.fields.days.length, 1);
  assert.equal(r.fields.days[0].activities[0].title, 'Pagi');
  assert.ok(r.notes.some((n) => n.includes('Beberapa hari')));
  assert.ok(r.unconsumed.some((u) => u.text === '10:00 Siang'));
});

test('every parsed text value is traceable to the source text (copy or direct reformat, never new words)', () => {
  for (const [name, mode] of [['id-full-day-tidy.txt', 'full_day'], ['en-half-day-messy.txt', 'half_day'], ['id-multi-day-3.txt', 'multi_day'], ['id-destination-guide.txt', 'destination_guide'], ['id-whatsapp-injection.txt', 'half_day']] as Array<[string, ItineraryMode]>) {
    const source = load(name);
    const folded = fold(source);
    const r = parseFixture(name, mode);
    const texts = [r.fields.trip.title, r.fields.trip.destination, r.fields.trip.country, r.fields.guide.name, r.fields.meeting.place,
      ...Object.values(r.fields.lists).flat(), ...r.fields.days.flatMap((d) => d.activities.map((a) => a.title))].filter((v): v is string => Boolean(v));
    for (const value of texts) assert.ok(folded.includes(fold(value)), `${name}: "${value}" is not in the source`);
  }
});

test('headings, day markers, time and duration readers', () => {
  assert.equal(headingFor('Termasuk:'), 'included');
  assert.equal(headingFor('Syarat & ketentuan'), 'policies');
  assert.equal(headingFor('Ringkasan trip hari ini'), undefined);
  assert.equal(dayMarkerFor('Hari ke-2: Kintamani')?.number, 2);
  assert.equal(dayMarkerFor('Day 3 - Kintamani')?.title, 'Kintamani');
  assert.equal(dayMarkerFor('Hari pertama: Ubud')?.number, 1);
  assert.equal(dayMarkerFor('D4')?.number, 4);
  assert.equal(dayMarkerFor('Harga 150 ribu'), null);
  assert.equal(toTime24(8, 0, 'am'), '08:00');
  assert.equal(toTime24(12, 0, 'am'), '00:00');
  assert.equal(toTime24(12, 0, 'pm'), '12:00');
  assert.equal(toTime24(1, 30, 'day'), '13:30');
  assert.equal(toTime24(7, 0, 'pm'), '19:00');
  assert.equal(toTime24(25, 0, null), null);
  assert.equal(durationIn('(1,5 jam)')?.minutes, 90);
  assert.equal(durationIn('90 menit')?.minutes, 90);
  assert.equal(durationIn('2 hours')?.minutes, 120);
  assert.equal(durationIn('0 menit'), null);
  assert.equal(readTimeLine('08:00-07:00 Mundur')?.durationMinutes, null, 'an end before the start is never used');
  assert.equal(readTimeLine('2 orang dewasa'), null, 'a bare number is not a time');
  assert.equal(readTimeLine('jam 8 malam')?.time, '20:00');
  assert.equal(readTimeLine('pukul 08.00 WIB')?.time, '08:00');
  assert.equal(classifyLines('- a\n1. b\nHarga: 100').map((l) => l.kind).join(','), 'bullet,bullet,key-value');
});

test('normalizers: kind keywords, guide match, OTA option match, explicit dates only', () => {
  assert.equal(kindFromText('Makan siang di warung'), 'food');
  assert.equal(kindFromText('Jemput hotel'), 'transport');
  assert.equal(kindFromText('Kunjungan Pura'), 'sightseeing');
  assert.equal(kindFromText('Snorkeling di Amed'), 'activity');
  const guides = [{ id: 'g1', name: 'Made Surya', phone: '081234567890' }, { id: 'g2', name: 'Hiro', phone: '+81 90 1234 5678' }];
  assert.equal(matchGuide('Other name', '0812 3456 7890', guides)?.id, 'g1', 'phone matches despite formatting');
  assert.equal(matchGuide('  made   SURYA ', null, guides)?.id, 'g1', 'name matches case- and space-insensitively');
  assert.equal(matchGuide('Nobody', '0899', guides), null);
  assert.equal(matchOption('pemandu wisata lokal.', ['Pemandu wisata lokal']), 'Pemandu wisata lokal');
  assert.equal(matchOption('Kursi roda sendiri', ['Pemandu wisata lokal']), 'Kursi roda sendiri', 'unmatched items are kept as written');
  assert.deepEqual(dateFromText('12 Desember 2026'), { date: '2026-12-12', note: null });
  assert.deepEqual(dateFromText('December 12, 2026').date, '2026-12-12');
  assert.deepEqual(dateFromText('12/12/2026').date, '2026-12-12');
  assert.equal(dateFromText('12 Desember').date, null, 'no year, no date');
  assert.equal(dateFromText('31 Februari 2026').date, null, 'impossible dates are rejected');
});

// ---- Activity mode (SI1, web-2.2.0) ----

test('activity (id): facts, sessions, highlights and steps are read by code; the summary is left for the AI step', () => {
  const r = parseFixture('id-activity-rafting.txt', 'activity');
  assert.equal(r.fields.trip.title, 'Rafting Sungai Ayung');
  assert.equal(r.fields.meeting.place, 'Lobi hotel Ubud');
  assert.equal(r.fields.meeting.time, '07:30');
  const a = r.fields.activity;
  assert.equal(a.category, 'water');
  assert.equal(a.durationMinutes, 180);
  assert.deepEqual(a.sessionTimes, ['08:00', '13:00']);
  assert.equal(a.difficulty, 'moderate');
  assert.equal(a.ageMin, 8);
  assert.equal(a.ageMax, 60);
  assert.equal(a.weightMaxKg, 120);
  assert.deepEqual(a.guideLanguages, ['Indonesia', 'Inggris']);
  assert.equal(a.operator, 'Ayung Adventure');
  assert.equal(a.bestTime, 'Musim hujan (Nov-Mar)');
  assert.deepEqual(a.highlights, ['Jeram grade II-III', 'Pemandangan tebing hijau', 'Makan siang buffet termasuk']);
  assert.deepEqual(a.steps, [
    { title: 'Briefing keselamatan', minutes: 15 },
    { title: 'Arung jeram', minutes: 120 },
    { title: 'Mandi dan makan siang', minutes: 45 }
  ]);
  assert.deepEqual(r.fields.lists.included, ['Jemput hotel', 'Helm dan pelampung', 'Makan siang']);
  assert.deepEqual(r.fields.lists.notSuitableFor, ['Ibu hamil', 'Penderita masalah jantung']);
  assert.equal(r.fields.days.length, 0, 'an activity has no days');
  assert.deepEqual(r.unconsumed.map((line) => line.text), ['Arung jeram santai di Sungai Ayung dengan pemandu berlisensi.']);
});

test('activity: "Highlights" is a list here and a summary heading in every other mode', () => {
  assert.equal(headingFor('Highlights', 'activity'), 'highlights');
  assert.equal(headingFor('Highlights'), 'summary');
  assert.equal(headingFor('Highlights', 'full_day'), 'summary');
  assert.equal(headingFor('Jalannya kegiatan', 'activity'), 'steps');
  assert.equal(headingFor('Jalannya kegiatan'), undefined);
});

test('activity: unclear values stay empty with a note, and are never guessed', () => {
  const r = parseDocument([
    'Snorkeling', 'Kategori: Rafting', 'Durasi: sebentar', 'Jam sesi: 8, 13:00', 'Tingkat kesulitan: lumayan',
    'Usia minimal: delapan', 'Berat maksimal: 5 kg', 'Usia: 8-60'
  ].join('\n'), 'activity');
  const a = r.fields.activity;
  assert.equal(a.category, undefined, '"Rafting" is not one of the six categories');
  assert.equal(a.durationMinutes, undefined);
  assert.deepEqual(a.sessionTimes, ['13:00'], 'the bare "8" is not a clock time');
  assert.equal(a.difficulty, undefined);
  assert.equal(a.ageMin, 8, 'the range line sets the bounds that it writes');
  assert.equal(a.ageMax, 60);
  assert.equal(a.weightMaxKg, undefined, '5 kg is outside the supported weight range');
  assert.ok(r.notes.length >= 5, r.notes.join(' | '));
  assert.ok(r.notes.every((note) => /^Baris \d+:/.test(note)));
});

test('activity: highlights and steps are capped, extra lines are reported, and ages are ranges or open ends', () => {
  const r = parseDocument(['Tur', 'Highlights', ...Array.from({ length: 7 }, (_, i) => `- Poin ${i + 1}`), 'Alur kegiatan', ...Array.from({ length: 14 }, (_, i) => `- Langkah ${i + 1}`), 'Usia: 12+'].join('\n'), 'activity');
  assert.equal(r.fields.activity.highlights.length, 5);
  assert.equal(r.fields.activity.steps.length, 12);
  assert.equal(r.fields.activity.ageMin, 12);
  assert.equal(r.fields.activity.ageMax, undefined);
  assert.ok(r.notes.some((note) => /Highlight dibatasi 5/.test(note)));
  assert.ok(r.notes.some((note) => /dibatasi 12 langkah/.test(note)));
});

test('the activity labels do nothing in the other modes: the line stays for the AI step', () => {
  const r = parseDocument('Tur Ubud\nOperator: Ayung Adventure\nKategori: Air\nDurasi: 3 jam', 'full_day');
  assert.equal(r.fields.activity.operator, undefined);
  assert.equal(r.fields.activity.category, undefined);
  assert.deepEqual(r.unconsumed.map((line) => line.text), ['Operator: Ayung Adventure', 'Kategori: Air', 'Durasi: 3 jam']);
});

test('normalizes direct parser input and never assigns skipped or repeated day markers to the previous day', () => {
  const text = 'Tur\r\nHari 1: Ubud\r\n09:00 Museum\r\nHari 3: Pantai\r\n10:00 Pantai\r\nHari 3: Duplikat\r\n11:00 Aktivitas ambigu';
  const result = parseDocument(text, 'multi_day');
  assert.deepEqual(result.fields.days.map((day) => [day.dayNumber, day.title, day.activities.map((activity) => activity.title)]), [[1, 'Ubud', ['Museum']], [3, 'Pantai', ['Pantai']]]);
  assert.ok(result.notes.some((note) => note.includes('melompat')));
  assert.ok(result.notes.some((note) => note.includes('berulang')));
  assert.ok(result.unconsumed.some((line) => line.text.includes('11:00 Aktivitas ambigu')));
  assert.equal(result.totalLines, result.consumedLines + result.unconsumed.length);
});

test('reads AM/PM ranges and compound durations without offset corruption', () => {
  assert.deepEqual(readTimeLine('01:00 PM - 03:00 PM Museum'), { time: '13:00', durationMinutes: 120, rest: 'Museum', ambiguous: false });
  assert.deepEqual(readTimeLine('08:00   WIB Museum'), { time: '08:00', durationMinutes: null, rest: 'Museum', ambiguous: false });
  assert.deepEqual(readTimeLine('09:00 Tur (1 jam 30 menit)'), { time: '09:00', durationMinutes: 90, rest: 'Tur', ambiguous: false });
  assert.equal(durationIn('1h 30m')?.minutes, 90);
  assert.equal(readTimeLine('23:00-01:00 Transfer malam')?.durationMinutes, null);
});

test('supports ISO dates and leaves ambiguous or invalid dates unresolved with a note', () => {
  assert.deepEqual(dateFromText('2026-12-20'), { date: '2026-12-20', note: null });
  assert.deepEqual(dateFromText('2024-02-29'), { date: '2024-02-29', note: null });
  assert.equal(dateFromText('2026-02-29').date, null);
  assert.ok(dateFromText('2026-02-29').note);
  assert.equal(dateFromText('03/04/2026').date, null);
  assert.ok(dateFromText('03/04/2026').note?.includes('ambigu'));
});

test('keeps inline and unbulleted practical lists, and extracts meeting place beside its map URL', () => {
  const result = parseDocument([
    'Tur Bandung', 'Termasuk: Transportasi, air mineral', 'Tidak termasuk', 'Tiket masuk', 'Tip guide',
    'Titik kumpul: Hotel Melati https://maps.app.goo.gl/abc', 'Hari 1', '09:00 Museum'
  ].join('\n'), 'full_day');
  assert.deepEqual(result.fields.lists.included, ['Transportasi, air mineral']);
  assert.deepEqual(result.fields.lists.notIncluded, ['Tiket masuk', 'Tip guide']);
  assert.equal(result.fields.meeting.place, 'Hotel Melati');
  assert.equal(result.fields.meeting.mapsUrl, 'https://maps.app.goo.gl/abc');
});

test('conflicting scalar values are left empty instead of last-write-wins', () => {
  const result = parseDocument('Tur\nDestinasi: Bali\nDestinasi: Lombok\nNegara: Indonesia\nNegara: Indonesia', 'full_day');
  assert.equal(result.fields.trip.destination, undefined);
  assert.equal(result.fields.trip.country, 'Indonesia');
  assert.ok(result.notes.some((note) => note.includes('Destinasi memiliki nilai berbeda')));
  assert.deepEqual(result.conflicts[0], {
    path: 'destination', values: ['Bali', 'Lombok'], line: 3,
    message: 'Baris 3: Destinasi memiliki nilai berbeda lebih dari satu kali; pilih nilai yang benar secara manual.'
  });
});
