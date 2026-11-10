export const fieldLabels: Record<string, string> = {
  tripTitle: 'Judul perjalanan',
  destination: 'Destinasi (kota/area)',
  country: 'Negara',
  region: 'Wilayah/provinsi',
  outputLanguage: 'Bahasa konten',
  colorTheme: 'Warna tema',
  itineraryMode: 'Tipe itinerary',
  startDate: 'Tanggal mulai',
  startTime: 'Jam mulai',
  endTime: 'Jam selesai',
  meetingPoint: 'Titik kumpul',
  mapsLink: 'Link Google Maps',
  meetingTime: 'Jam kumpul',
  meetingNote: 'Catatan titik kumpul',
  pickup: 'Ada penjemputan',
  pickupArea: 'Area penjemputan',
  pickupTime: 'Jam penjemputan',
  dropoffNote: 'Catatan pengantaran pulang',
  guideName: 'Nama guide',
  guidePhone: 'Nomor HP guide',
  heroPhoto: 'Foto',
  photographer: 'Nama fotografer',
  photographerLink: 'Link fotografer',
  photoSource: 'Sumber foto',
  overviewSummary: 'Ringkasan',
  dayTitle: 'Judul hari',
  location: 'Lokasi',
  time: 'Jam',
  durationMinutes: 'Durasi (menit)',
  activityType: 'Jenis aktivitas',
  activityTitle: 'Judul aktivitas',
  placeName: 'Nama tempat',
  description: 'Deskripsi',
  localTip: 'Tips lokal',
  breakfast: 'Sarapan',
  lunch: 'Makan siang',
  dinner: 'Makan malam',
  accommodationName: 'Nama hotel',
  area: 'Area',
  accommodationNote: 'Catatan hotel',
  transferNote: 'Perpindahan antarkota',
  placeGroup: 'Grup/area',
  suggestedDuration: 'Lama kunjungan',
  bestTime: 'Waktu terbaik',
  gettingThere: 'Cara ke sana',
  nearby: 'Tempat terdekat',
  included: 'Termasuk',
  notIncluded: 'Tidak termasuk',
  whatToBring: 'Yang perlu dibawa',
  notSuitableFor: 'Tidak cocok untuk',
  notAllowed: 'Tidak diperbolehkan',
  knowBeforeYouGo: 'Yang perlu diketahui',
  emergencyContact: 'Kontak darurat (nama)',
  contactValue: 'Nomor/kontak',
  policies: 'Ketentuan (pembatalan, cuaca, anak, dll.)',
  closingNote: 'Catatan penutup',
  disclaimer: 'Penafian',
  stableId: 'ID stabil',
  schemaVersion: 'Versi skema',
  dayLabel: 'Hari'
};

export const pathLabels: Record<string, string> = {
  'cover.assetId': 'Foto sampul',
  'days[].photo.assetId': 'Foto hari',
  'places[].photo.assetId': 'Foto tempat',
  'days[].activities[].place': 'Tempat / area',
  'days[].hotel.area': 'Area hotel',
  'places[].tips[]': 'Tips'
};

export const kindLabels: Record<string, string> = {
  sightseeing: 'Wisata',
  food: 'Makan',
  activity: 'Aktivitas',
  transport: 'Perjalanan',
  free: 'Waktu bebas'
};

export const themeNames: Record<string, string> = {
  beach: 'Toska',
  mountain: 'Biru batu',
  city: 'Biru kota',
  cultural: 'Nila & toska',
  nature: 'Hijau daun',
  desert: 'Abu & emas',
  mixed: 'Biru tua (bawaan)'
};

export const modeCopy: Record<string, { title: string; description: string; example: string; badge: string }> = {
  half_day: {
    title: 'Setengah hari',
    description: 'Tur ±4–6 jam dengan titik kumpul dan jadwal per jam. Tanpa makan.',
    example: 'City tour pagi Yogyakarta',
    badge: 'bg-amber-100 text-amber-900'
  },
  full_day: {
    title: 'Sehari penuh',
    description: 'Tur hingga ±12 jam dengan jadwal per jam dan makan yang termasuk.',
    example: 'Bromo sunrise & kawah',
    badge: 'bg-teal-100 text-teal-900'
  },
  multi_day: {
    title: 'Beberapa hari',
    description: '2–14 hari; tiap hari punya jadwal, hotel, makan dan perpindahan.',
    example: 'Bali 5 hari 4 malam',
    badge: 'bg-indigo-100 text-indigo-900'
  },
  destination_guide: {
    title: 'Panduan destinasi',
    description: 'Kumpulan tempat rekomendasi per area, tanpa tanggal dan jam.',
    example: 'Panduan kuliner Bandung',
    badge: 'bg-rose-100 text-rose-900'
  }
};

export const statusCopy = {
  newDraftCreated: 'Draft baru tersimpan',
  draftOpened: 'Draft dibuka',
  draftSaved: 'Tersimpan · revisi',
  engineConnected: 'Engine tersambung',
  publishSucceeded: 'Itinerary berhasil dipublish',
  languageUnresolved: "Bahasa belum dipilih. Pilih bahasa atau klik 'Deteksi otomatis'. Teks Anda tidak akan diterjemahkan.",
  aiNotActive: 'AI belum aktif: kunci API belum diatur di server. Semua field tetap bisa diisi manual.',
  aiMissing: 'Isi OPENROUTER_API_KEY di file .env.web lalu jalankan ulang server.',
  aiAmbiguous: 'File kredensial berisi lebih dari satu kunci; isi satu kunci di OPENROUTER_API_KEY.',
  aiUnavailable: 'Kunci AI tidak terbaca; periksa formatnya.',
  modelLabel: 'Model: GPT-6 Luna',
  assetCount: '1 foto tersedia.',
  noCover: 'Belum ada foto sampul — halaman memakai warna tema.',
  noPhoto: 'Belum ada foto.',
  saveBeforeAi: 'Simpan draft dan pilih bahasa dulu untuk memakai AI.'
};
