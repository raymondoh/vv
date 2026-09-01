import React from 'react';
import { MapPin, Sparkles, Tag, ShieldAlert, Car, Utensils, Wine, Clock, Zap, Check } from 'lucide-react';
import { Venue, EventType } from '../../../types';

interface VenueDetailsStepProps {
  venue: Partial<Venue>;
  onChange: (field: string, value: any) => void;
  onLocationChange: (field: string, value: any) => void;
  onSpecsChange: (field: string, value: any) => void;
}

const AVAILABLE_EVENT_TYPES: { id: EventType; label: string }[] = [
  { id: 'meetings-conferences', label: 'Meetings & Conferences' },
  { id: 'weddings', label: 'Weddings & Ceremonies' },
  { id: 'parties-celebrations', label: 'Parties & Celebrations' },
  { id: 'training-workshops', label: 'Workshops & Training' },
  { id: 'exhibitions-events', label: 'Exhibitions & Pop-ups' },
  { id: 'private-dining', label: 'Private Dining & Tastings' },
];

export const VenueDetailsStep: React.FC<VenueDetailsStepProps> = ({
  venue,
  onChange,
  onLocationChange,
  onSpecsChange,
}) => {
  const selectedEventTypes = venue.eventTypes || [];

  const toggleEventType = (type: EventType) => {
    if (selectedEventTypes.includes(type)) {
      onChange(
        'eventTypes',
        selectedEventTypes.filter((t) => t !== type)
      );
    } else {
      onChange('eventTypes', [...selectedEventTypes, type]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#26343D] flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#A86445]" />
          <span>Venue Identity & Location</span>
        </h3>
        <p className="text-xs text-[#66737A] mt-1">
          Specify core details and address coordinates for this property. Initial launch defaults to UK address standards with international scalability.
        </p>
      </div>

      {/* Basic Identity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D]">Venue Name *</label>
          <input
            type="text"
            value={venue.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="e.g. The Somerset Glasshouse & Conservatory"
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all font-medium"
          />
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D]">Tagline / Short Summary *</label>
          <input
            type="text"
            value={venue.tagline || ''}
            onChange={(e) => onChange('tagline', e.target.value)}
            placeholder="e.g. Regency glasshouse and Thames riverfront botanical conservatory"
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>

        <div className="md:col-span-2 space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D]">Full Description *</label>
          <textarea
            rows={4}
            value={venue.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder="Describe the architectural style, natural lighting, history, and atmosphere that make this venue special..."
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#A86445]" />
            <span>Architectural Aesthetic / Style</span>
          </label>
          <input
            type="text"
            value={venue.aesthetic || ''}
            onChange={(e) => onChange('aesthetic', e.target.value)}
            placeholder="e.g. Regency Glasshouse & Riverfront Terrace"
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#26343D]">Primary Timezone</label>
          <select
            value={venue.location?.timezone || 'Europe/London'}
            onChange={(e) => onLocationChange('timezone', e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445] transition-all"
          >
            <option value="Europe/London">London (GMT / BST) - Europe/London</option>
            <option value="Europe/Paris">Paris / Central Europe (CET) - Europe/Paris</option>
            <option value="America/New_York">New York (EST/EDT) - America/New_York</option>
            <option value="America/Chicago">Chicago (CST/CDT) - America/Chicago</option>
            <option value="America/Los_Angeles">Los Angeles (PST/PDT) - America/Los_Angeles</option>
          </select>
        </div>
      </div>

      {/* Event Types Supported */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-[#26343D] flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5 text-[#66737A]" />
          <span>Suitable Event Categories</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_EVENT_TYPES.map((type) => {
            const isSelected = selectedEventTypes.includes(type.id);
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => toggleEventType(type.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                  isSelected
                    ? 'bg-[#26343D] text-white border-[#26343D] shadow-xs'
                    : 'bg-white text-[#66737A] border-[#DDD8CF] hover:text-[#26343D]'
                }`}
              >
                {isSelected && <Check className="w-3 h-3 text-[#A86445]" />}
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Location Section */}
      <div className="bg-[#F4F1EA] p-4 sm:p-5 rounded-2xl border border-[#DDD8CF] space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#A86445]" />
            <span>Property Address & Location</span>
          </h4>
          <span className="text-[11px] text-[#66737A] bg-white px-2 py-0.5 rounded-md border border-[#DDD8CF]">
            UK & Global Standards
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[11px] font-semibold text-[#66737A]">Address Line 1 *</label>
            <input
              type="text"
              value={venue.location?.addressLine1 || venue.location?.address || ''}
              onChange={(e) => {
                onLocationChange('addressLine1', e.target.value);
                onLocationChange('address', e.target.value);
              }}
              placeholder="e.g. Victoria Embankment, Strand"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">Address Line 2 (Optional)</label>
            <input
              type="text"
              value={venue.location?.addressLine2 || ''}
              onChange={(e) => onLocationChange('addressLine2', e.target.value)}
              placeholder="e.g. Suite 4B or West Wing"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">Town / City *</label>
            <input
              type="text"
              value={venue.location?.city || ''}
              onChange={(e) => onLocationChange('city', e.target.value)}
              placeholder="e.g. London"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">County / Region</label>
            <input
              type="text"
              value={venue.location?.region || venue.location?.state || ''}
              onChange={(e) => {
                onLocationChange('region', e.target.value);
                onLocationChange('state', e.target.value);
              }}
              placeholder="e.g. Greater London"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">Postal Code / Postcode *</label>
            <input
              type="text"
              value={venue.location?.postalCode || venue.location?.zipCode || ''}
              onChange={(e) => {
                onLocationChange('postalCode', e.target.value);
                onLocationChange('zipCode', e.target.value);
              }}
              placeholder="e.g. WC2R 1LA"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">Neighborhood / Quarter</label>
            <input
              type="text"
              value={venue.location?.neighborhood || ''}
              onChange={(e) => onLocationChange('neighborhood', e.target.value)}
              placeholder="e.g. Covent Garden / Strand"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">Country</label>
            <input
              type="text"
              value={venue.location?.country || 'United Kingdom'}
              onChange={(e) => onLocationChange('country', e.target.value)}
              placeholder="United Kingdom"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">Country Code (ISO)</label>
            <input
              type="text"
              value={venue.location?.countryCode || 'GB'}
              onChange={(e) => onLocationChange('countryCode', e.target.value.toUpperCase())}
              placeholder="GB"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>
        </div>
      </div>

      {/* Operational Specs */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#DDD8CF] space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-[#66737A]" />
          <span>Operational Rules & Access Specifications</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A] flex items-center gap-1">
              <Clock className="w-3 h-3 text-[#66737A]" />
              <span>Event Curfew / Noise Restrictions</span>
            </label>
            <input
              type="text"
              value={venue.specs?.curfew || ''}
              onChange={(e) => onSpecsChange('curfew', e.target.value)}
              placeholder="e.g. 1:00 AM (Amplified music to 12:30 AM)"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A] flex items-center gap-1">
              <Car className="w-3 h-3 text-[#66737A]" />
              <span>Parking & Guest Arrival</span>
            </label>
            <input
              type="text"
              value={venue.specs?.parking || ''}
              onChange={(e) => onSpecsChange('parking', e.target.value)}
              placeholder="e.g. Reserved valet bays + partner NCP garage adjacent"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A] flex items-center gap-1">
              <Utensils className="w-3 h-3 text-[#66737A]" />
              <span>Catering Policy</span>
            </label>
            <input
              type="text"
              value={venue.specs?.cateringPolicy || ''}
              onChange={(e) => onSpecsChange('cateringPolicy', e.target.value)}
              placeholder="e.g. Open caterer policy with certified commercial prep kitchen"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A] flex items-center gap-1">
              <Wine className="w-3 h-3 text-[#66737A]" />
              <span>Alcohol & Bar License</span>
            </label>
            <input
              type="text"
              value={venue.specs?.alcoholPolicy || ''}
              onChange={(e) => onSpecsChange('alcoholPolicy', e.target.value)}
              placeholder="e.g. Licensed bar in-house or BYO with certified servers"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A] flex items-center gap-1">
              <Zap className="w-3 h-3 text-[#66737A]" />
              <span>Event Power Distribution</span>
            </label>
            <input
              type="text"
              value={venue.specs?.powerSupply || ''}
              onChange={(e) => onSpecsChange('powerSupply', e.target.value)}
              placeholder="e.g. 400A 3-Phase Cam-Lok dedicated event power"
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
          </div>

          <div className="flex items-center gap-6 pt-5">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#26343D]">
              <input
                type="checkbox"
                checked={venue.specs?.adaCompliant !== false}
                onChange={(e) => onSpecsChange('adaCompliant', e.target.checked)}
                className="w-4 h-4 rounded text-[#A86445] accent-[#A86445]"
              />
              <span>Step-Free / Accessible</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#26343D]">
              <input
                type="checkbox"
                checked={venue.specs?.loadingDock !== false}
                onChange={(e) => onSpecsChange('loadingDock', e.target.checked)}
                className="w-4 h-4 rounded text-[#A86445] accent-[#A86445]"
              />
              <span>Dedicated Loading Dock</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
