import type { ImportLimits } from '../import/limits.js';

/** Copy for the create flow (CP037). Plain Indonesian for first-time users; no developer words. */
export const createCopy = {
  start: 'Buat itinerary baru',
  startHint: 'Mulai dari jenis perjalanan, lalu pilih cara mengisinya.',
  stepLabel: (step: number, name: string) => `Langkah ${step} dari 3 · ${name}`,
  stepNames: ['Jenis perjalanan', 'Cara mengisi'] as const,
  editorStep: 'Editor itinerary',
  typeTitle: 'Pilih jenis perjalanan',
  methodTitle: 'Pilih cara mengisi',
  lastUsed: 'Terakhir dipakai',
  back: 'Kembali',
  cancel: 'Batal',
  startManual: 'Mulai isi',
  pickMethod: 'Pilih salah satu cara dulu.',
  readFirst: 'Baca dulu',
  help: 'Belum yakin pilih yang mana?',
  helpItems: (limits: ImportLimits) => [
    { q: 'Apakah isi saya dikirim ke AI?', a: limits.aiConfigured ? 'Hanya bagian yang tidak terbaca otomatis. Sisanya dibaca langsung di komputer ini.' : 'Saat ini AI tidak aktif, jadi semua dibaca langsung di komputer ini; bagian yang tidak terbaca dibiarkan kosong.' },
    { q: 'Bisa diubah nanti?', a: 'Ya. Semua isian bisa diedit di langkah berikutnya.' },
    { q: 'Teks saya disimpan?', a: limits.retentionDays > 0 ? `Disimpan di komputer ini selama ${limits.retentionDays} hari, lalu dihapus otomatis.` : 'Disimpan di komputer ini dan tidak dihapus otomatis.' }
  ],
  methods: [
    { id: 'paste', icon: '📋', title: 'Tempel teks', fit: 'Itinerary sudah ada di WhatsApp, catatan HP, atau email.', does: 'Kami baca jam, hari, dan daftarnya. Yang tidak terbaca dibiarkan kosong untuk Anda isi.' },
    { id: 'pdf', icon: '📄', title: 'Upload PDF', fit: 'Punya file PDF itinerary yang tulisannya bisa diblok.', does: 'Sama seperti tempel teks. PDF hasil foto atau scan belum bisa dibaca; salin teksnya lalu pilih tempel teks.' },
    { id: 'manual', icon: '✏️', title: 'Isi manual', fit: 'Mulai dari nol, atau itinerary belum ditulis di mana pun.', does: 'Anda mengisi langkah demi langkah di editor.' }
  ] as const,
  inFlow: 'Selesaikan atau batalkan pembuatan itinerary dulu.',
  discardInput: 'Isian yang sudah diketik akan hilang. Lanjutkan?'
};
