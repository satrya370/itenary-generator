import React, { useRef } from 'react';
import type { AssetDto } from '../../api/client.js';
import { buttonClass, contentLanguages, inputClass } from '../fields.js';

export interface Guide { id: string; name: string; phone: string }
export interface AgencyProfile {
  agencyName: string; agencyContact: string; agencyLogoAssetId: string | null;
  defaultCountry: string; defaultLanguage: string | null; guides: Guide[]; setupCompleted: boolean;
}

export const emptyProfile: AgencyProfile = { agencyName: '', agencyContact: '', agencyLogoAssetId: null, defaultCountry: '', defaultLanguage: null, guides: [], setupCompleted: false };

export type ProfileSection = 'agency' | 'defaults' | 'guides' | 'all';

export function ProfileForm({ profile, assets, busy, section = 'all', onChange, onUpload }: {
  profile: AgencyProfile; assets: AssetDto[]; busy: boolean; section?: ProfileSection;
  onChange: (next: AgencyProfile) => void; onUpload: (file: File) => void;
}) {
  const show = (name: Exclude<ProfileSection, 'all'>) => section === 'all' || section === name;
  const fileInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof AgencyProfile>(key: K, value: AgencyProfile[K]) => onChange({ ...profile, [key]: value });
  const setGuide = (index: number, patch: Partial<Guide>) => set('guides', profile.guides.map((guide, i) => (i === index ? { ...guide, ...patch } : guide)));

  return (
    <div className="space-y-5">
      {show('agency') && <fieldset className="space-y-3">
        <legend className="font-semibold">Agensi</legend>
        <div>
          <label htmlFor="profile-agency-name" className="block text-sm font-medium">Nama agensi</label>
          <input id="profile-agency-name" value={profile.agencyName} maxLength={160} onChange={(event) => set('agencyName', event.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="profile-agency-contact" className="block text-sm font-medium">Kontak agensi</label>
          <input id="profile-agency-contact" value={profile.agencyContact} maxLength={320} onChange={(event) => set('agencyContact', event.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="profile-agency-logo" className="block text-sm font-medium">Logo agensi</label>
          <select id="profile-agency-logo" value={profile.agencyLogoAssetId ?? ''} onChange={(event) => set('agencyLogoAssetId', event.target.value || null)} className={inputClass} data-field-path="profile.agencyLogoAssetId">
            <option value="">Tanpa logo</option>
            {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename} · {asset.width}×{asset.height}</option>)}
          </select>
          <button type="button" disabled={busy} className={`${buttonClass} mt-2`} onClick={() => fileInput.current?.click()}>Unggah logo</button>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Unggah logo agensi" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ''; }} />
        </div>
      </fieldset>}

      {show('defaults') && <fieldset className="space-y-3">
        <legend className="font-semibold">Default itinerary baru</legend>
        <div>
          <label htmlFor="profile-default-country" className="block text-sm font-medium">Negara</label>
          <input id="profile-default-country" value={profile.defaultCountry} maxLength={120} onChange={(event) => set('defaultCountry', event.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="profile-default-language" className="block text-sm font-medium">Bahasa konten</label>
          <select id="profile-default-language" value={profile.defaultLanguage ?? ''} onChange={(event) => set('defaultLanguage', event.target.value || null)} className={inputClass} data-field-path="profile.defaultLanguage">
            <option value="">Belum dipilih</option>
            {contentLanguages.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
      </fieldset>}

      {show('guides') && <fieldset className="space-y-3">
        <legend className="font-semibold">Guide</legend>
        <p className="text-xs text-slate-600">Pilih guide saat membuat itinerary; nama dan nomor HP akan terisi otomatis.</p>
        {profile.guides.map((guide, index) => (
          <div key={guide.id} className="grid gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <label htmlFor={`profile-guide-name-${guide.id}`} className="block text-sm font-medium">Nama guide</label>
              <input id={`profile-guide-name-${guide.id}`} value={guide.name} maxLength={120} onChange={(event) => setGuide(index, { name: event.target.value })} className={inputClass} />
            </div>
            <div>
              <label htmlFor={`profile-guide-phone-${guide.id}`} className="block text-sm font-medium">Nomor HP</label>
              <input id={`profile-guide-phone-${guide.id}`} value={guide.phone} maxLength={40} onChange={(event) => setGuide(index, { phone: event.target.value })} className={inputClass} />
            </div>
            <button type="button" className={`${buttonClass} self-end`} onClick={() => set('guides', profile.guides.filter((_, i) => i !== index))}>Hapus guide {index + 1}</button>
          </div>
        ))}
        <button type="button" disabled={profile.guides.length >= 20} className={buttonClass} onClick={() => set('guides', [...profile.guides, { id: crypto.randomUUID(), name: '', phone: '' }])}>Tambah guide</button>
      </fieldset>}
    </div>
  );
}
