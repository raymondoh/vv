import React from 'react';
import { Building2, User, Mail, Phone, Globe, FileText, CheckCircle2, PlusCircle, Check } from 'lucide-react';
import { BusinessOrganisation } from '../../../types';

interface BusinessDetailsStepProps {
  businessMode: 'existing' | 'new' | null;
  selectedOrgId: string | null;
  organisation: Partial<BusinessOrganisation>;
  existingOrganisations: BusinessOrganisation[];
  onSelectMode: (mode: 'existing' | 'new') => void;
  onSelectExistingOrg: (org: BusinessOrganisation) => void;
  onChange: (field: keyof BusinessOrganisation, value: string) => void;
}

export const BusinessDetailsStep: React.FC<BusinessDetailsStepProps> = ({
  businessMode,
  selectedOrgId,
  organisation,
  existingOrganisations,
  onSelectMode,
  onSelectExistingOrg,
  onChange,
}) => {
  const hasExistingOrgs = existingOrganisations && existingOrganisations.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#26343D] flex items-center gap-2">
          <Building2 className="w-5 h-5 text-[#A86445]" />
          <span>Business & Organisation Profile</span>
        </h3>
        <p className="text-xs text-[#66737A] mt-1">
          Tell us about the company or hospitality entity operating your venues. You can attach multiple venues to a single business account.
        </p>
      </div>

      {/* Choice between Existing Business Account and Create New Business */}
      {hasExistingOrgs ? (
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-[#26343D] block">
            Business Account Selection *
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              id="business-mode-existing-btn"
              onClick={() => onSelectMode('existing')}
              className={`p-4 text-left rounded-2xl border transition-all flex items-start gap-3 ${
                businessMode === 'existing'
                  ? 'bg-white border-[#A86445] ring-2 ring-[#A86445]/20 shadow-xs'
                  : 'bg-[#F4F1EA] hover:bg-[#EAE4D8] border-[#DDD8CF] text-[#26343D]'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  businessMode === 'existing' ? 'bg-[#A86445] text-white' : 'bg-white text-[#66737A] border border-[#DDD8CF]'
                }`}
              >
                <Building2 className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-[#26343D] flex items-center gap-1.5">
                  <span>Add to Existing Business</span>
                  {businessMode === 'existing' && <Check className="w-3.5 h-3.5 text-[#A86445]" />}
                </div>
                <p className="text-[11px] text-[#66737A]">
                  Choose from your {existingOrganisations.length} registered business account{existingOrganisations.length > 1 ? 's' : ''}.
                </p>
              </div>
            </button>

            <button
              type="button"
              id="business-mode-new-btn"
              onClick={() => onSelectMode('new')}
              className={`p-4 text-left rounded-2xl border transition-all flex items-start gap-3 ${
                businessMode === 'new'
                  ? 'bg-white border-[#A86445] ring-2 ring-[#A86445]/20 shadow-xs'
                  : 'bg-[#F4F1EA] hover:bg-[#EAE4D8] border-[#DDD8CF] text-[#26343D]'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                  businessMode === 'new' ? 'bg-[#A86445] text-white' : 'bg-white text-[#66737A] border border-[#DDD8CF]'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="text-xs font-bold text-[#26343D] flex items-center gap-1.5">
                  <span>Create New Business</span>
                  {businessMode === 'new' && <Check className="w-3.5 h-3.5 text-[#A86445]" />}
                </div>
                <p className="text-[11px] text-[#66737A]">
                  Register a fresh company or hospitality entity for this property.
                </p>
              </div>
            </button>
          </div>
        </div>
      ) : null}

      {/* When Existing Business is selected, show list of saved businesses */}
      {businessMode === 'existing' && hasExistingOrgs && (
        <div className="bg-[#F4F1EA] p-4 sm:p-5 rounded-2xl border border-[#DDD8CF] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#26343D]">
              Select Existing Organisation *
            </span>
            <span className="text-[10px] text-[#66737A]">
              Click to load saved company details
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {existingOrganisations.map((org) => {
              const isSelected = selectedOrgId === org.id;
              return (
                <button
                  key={org.id}
                  type="button"
                  id={`select-org-${org.id}`}
                  onClick={() => onSelectExistingOrg(org)}
                  className={`p-3.5 text-left rounded-xl text-xs transition-all border ${
                    isSelected
                      ? 'bg-white border-[#A86445] ring-2 ring-[#A86445]/20 shadow-xs'
                      : 'bg-white/70 hover:bg-white border-[#DDD8CF] text-[#26343D]'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-[#26343D]">
                    <span className="truncate">{org.name}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-[#A86445] shrink-0" />}
                  </div>
                  <div className="text-[11px] text-[#66737A] truncate mt-1">
                    Contact: {org.contactName || 'N/A'}
                  </div>
                  {org.email && (
                    <div className="text-[10px] text-[#66737A] truncate mt-0.5">
                      {org.email}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Business Form Inputs: Shown when "new" is selected, OR when an existing org is selected and being reviewed */}
      {(businessMode === 'new' || (businessMode === 'existing' && selectedOrgId) || !hasExistingOrgs) && (
        <div className="space-y-4 pt-1">
          {businessMode === 'existing' && (
            <div className="text-xs text-[#66737A] bg-amber-50/70 border border-amber-200/70 p-3 rounded-xl">
              Showing saved details for <strong>{organisation.name}</strong>. You may update any field below.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#66737A]" />
                <span>Business / Company Name *</span>
              </label>
              <input
                type="text"
                id="org-name-input"
                value={organisation.name || ''}
                onChange={(e) => onChange('name', e.target.value)}
                placeholder="e.g. Sterling Heritage Hospitality Ltd"
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
                id="org-contact-input"
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
                id="org-email-input"
                value={organisation.email || ''}
                onChange={(e) => onChange('email', e.target.value)}
                placeholder="e.g. venues@sterlingheritage.co.uk"
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
                id="org-phone-input"
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
                id="org-website-input"
                value={organisation.website || ''}
                onChange={(e) => onChange('website', e.target.value)}
                placeholder="e.g. https://sterlingheritage.co.uk"
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
                id="org-description-input"
                value={organisation.description || ''}
                onChange={(e) => onChange('description', e.target.value)}
                placeholder="Briefly describe your portfolio, hospitality standards, or property collection..."
                className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
