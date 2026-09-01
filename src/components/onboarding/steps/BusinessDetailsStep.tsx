import React from 'react';
import { Building2, User, Mail, Phone, Globe, FileText, CheckCircle2 } from 'lucide-react';
import { BusinessOrganisation } from '../../../types';

interface BusinessDetailsStepProps {
  organisation: Partial<BusinessOrganisation>;
  existingOrganisations: BusinessOrganisation[];
  onSelectExistingOrg: (org: BusinessOrganisation) => void;
  onChange: (field: keyof BusinessOrganisation, value: string) => void;
}

export const BusinessDetailsStep: React.FC<BusinessDetailsStepProps> = ({
  organisation,
  existingOrganisations,
  onSelectExistingOrg,
  onChange,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#26343D] flex items-center gap-2">
          <Building2 className="w-5 h-5 text-[#A86445]" />
          <span>Business & Organisation Profile</span>
        </h3>
        <p className="text-xs text-[#66737A] mt-1">
          Tell us about the company or hospitality entity operating your venues. You can attach multiple venues to this business account.
        </p>
      </div>

      {/* Quick selection from existing prototype business entities if any exist */}
      {existingOrganisations.length > 0 && (
        <div className="bg-[#F4F1EA] p-4 rounded-xl border border-[#DDD8CF] space-y-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#66737A] block">
            Select Existing Business Account or Create New
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {existingOrganisations.map((org) => {
              const isSelected = organisation.id === org.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  onClick={() => onSelectExistingOrg(org)}
                  className={`p-3 text-left rounded-xl text-xs transition-all border ${
                    isSelected
                      ? 'bg-white border-[#A86445] ring-2 ring-[#A86445]/20 shadow-xs'
                      : 'bg-white/70 hover:bg-white border-[#DDD8CF] text-[#26343D]'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-[#26343D]">
                    <span className="truncate">{org.name}</span>
                    {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#A86445] shrink-0" />}
                  </div>
                  <div className="text-[11px] text-[#66737A] truncate mt-0.5">{org.contactName}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Business Form Inputs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-[#66737A]" />
            <span>Business / Company Name *</span>
          </label>
          <input
            type="text"
            value={organisation.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="e.g. Mayfair Heritage Hospitality Ltd"
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-[#66737A]" />
            <span>Primary Contact Name *</span>
          </label>
          <input
            type="text"
            value={organisation.contactName || ''}
            onChange={(e) => onChange('contactName', e.target.value)}
            placeholder="e.g. Charlotte Sterling"
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-[#66737A]" />
            <span>Business Email Address *</span>
          </label>
          <input
            type="email"
            value={organisation.email || ''}
            onChange={(e) => onChange('email', e.target.value)}
            placeholder="e.g. venues@mayfairheritage.co.uk"
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-[#66737A]" />
            <span>Direct Phone Number</span>
          </label>
          <input
            type="tel"
            value={organisation.phone || ''}
            onChange={(e) => onChange('phone', e.target.value)}
            placeholder="e.g. +44 20 7946 0912"
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#66737A]" />
            <span>Official Website</span>
          </label>
          <input
            type="url"
            value={organisation.website || ''}
            onChange={(e) => onChange('website', e.target.value)}
            placeholder="e.g. https://mayfairheritage.co.uk"
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#66737A]" />
            <span>Organisation Summary & Background</span>
          </label>
          <textarea
            rows={3}
            value={organisation.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder="Briefly describe your portfolio, hospitality standards, or heritage properties..."
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>
      </div>
    </div>
  );
};
