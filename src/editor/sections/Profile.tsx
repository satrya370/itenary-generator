import React from 'react';
import type { AssetDto } from '../../api/client.js';
import { buttonClass, inputClass } from '../fields.js';

export interface ProfileData { revision: number; profile: { agencyName: string; agencyContact: string; agencyLogoAssetId: string | null } }

export function Profile({ profile, assets, busy, dirty, onChange, onLogo, onSave }: {
  profile: ProfileData; assets: AssetDto[]; busy: boolean; dirty: boolean;
  onChange: (key: 'agencyName' | 'agencyContact', value: string) => void; onLogo: (value: string | null) => void; onSave: () => void;
}) {
  return (
    <section id="profile-panel" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold">Profil agensi</h2>
      <div>
        <label htmlFor="agency-name" className="block text-sm font-medium text-slate-800">Nama agensi</label>
        <input id="agency-name" value={profile.profile.agencyName} maxLength={160} onChange={(event) => onChange('agencyName', event.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="agency-contact" className="block text-sm font-medium text-slate-800">Kontak agensi</label>
        <input id="agency-contact" value={profile.profile.agencyContact} maxLength={320} onChange={(event) => onChange('agencyContact', event.target.value)} className={inputClass} />
      </div>
      <div>
        <label htmlFor="agency-logo" className="block text-sm font-medium text-slate-800">Logo agensi</label>
        <select id="agency-logo" value={profile.profile.agencyLogoAssetId ?? ''} onChange={(event) => onLogo(event.target.value || null)} className={inputClass} data-field-path="profile.agencyLogoAssetId">
          <option value="">Tanpa logo</option>
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename} · {asset.width}×{asset.height}</option>)}
        </select>
      </div>
      <button type="button" disabled={busy || !dirty} onClick={onSave} className={buttonClass}>Simpan profil</button>
    </section>
  );
}
