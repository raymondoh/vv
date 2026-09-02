import React, { useState } from 'react';
import { Layers, Plus, Trash2, Edit3, Check, Users, Maximize2, ArrowUpDown, Accessibility } from 'lucide-react';
import { VenueSpace } from '../../../types';

interface SpacesCapacitiesStepProps {
  spaces: VenueSpace[];
  onSpacesChange: (spaces: VenueSpace[]) => void;
}

export const SpacesCapacitiesStep: React.FC<SpacesCapacitiesStepProps> = ({
  spaces,
  onSpacesChange,
}) => {
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(
    spaces.length > 0 ? spaces[0].id : null
  );

  const handleAddSpace = () => {
    const newSpace: VenueSpace = {
      id: `space-${Date.now().toString().slice(-6)}`,
      name: '',
      description: '',
      floorLocation: '',
      maxCapacity: 0,
      seatedCapacity: 0,
      standingCapacity: 0,
      theatreCapacity: 0,
      squareMeters: 0,
      squareFeet: 0,
      ceilingHeightMeters: 0,
      ceilingHeightFt: 0,
      accessibilityDetails: '',
      amenities: [],
      layouts: [],
    };

    const updated = [...spaces, newSpace];
    onSpacesChange(updated);
    setEditingSpaceId(newSpace.id);
  };

  const handleRemoveSpace = (spaceId: string) => {
    const updated = spaces.filter((s) => s.id !== spaceId);
    onSpacesChange(updated);
    if (editingSpaceId === spaceId) {
      setEditingSpaceId(updated[0]?.id || null);
    }
  };

  const handleUpdateSpace = (spaceId: string, field: keyof VenueSpace, value: any) => {
    const updated = spaces.map((s) => {
      if (s.id === spaceId) {
        return { ...s, [field]: value };
      }
      return s;
    });
    onSpacesChange(updated);
  };

  const activeSpace = spaces.find((s) => s.id === editingSpaceId) || spaces[0];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#26343D] flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#A86445]" />
          <span>Rooms, Spaces & Capacities</span>
        </h3>
        <p className="text-xs text-[#66737A] mt-1">
          A venue can feature one or multiple distinct spaces (e.g. Grand Ballroom, Rooftop Garden, Executive Suite). Clients can book the entire property or individual spaces.
        </p>
      </div>

      {/* Spaces Tab / Pill Selector */}
      {spaces.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[#DDD8CF] pb-3">
          {spaces.map((space, idx) => {
            const isSelected = space.id === activeSpace?.id;
            return (
              <div key={space.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setEditingSpaceId(space.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border ${
                    isSelected
                      ? 'bg-[#26343D] text-white border-[#26343D] shadow-xs'
                      : 'bg-white text-[#66737A] border-[#DDD8CF] hover:text-[#26343D]'
                  }`}
                >
                  <span>{space.name || `Space ${idx + 1}`}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-[#F4F1EA] text-[#66737A]'}`}>
                    Max {space.maxCapacity || 0}
                  </span>
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={handleAddSpace}
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F4F1EA] text-[#A86445] hover:bg-[#EAE4D8] border border-[#DDD8CF] flex items-center gap-1.5 transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Another Space</span>
          </button>
        </div>
      )}

      {spaces.length === 0 ? (
        <div className="bg-[#F4F1EA] p-8 rounded-2xl border border-[#DDD8CF] text-center space-y-3">
          <Layers className="w-8 h-8 text-[#A86445] mx-auto" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-[#26343D]">No Rooms or Spaces Configured Yet</h4>
            <p className="text-xs text-[#66737A] max-w-md mx-auto">
              Add distinct rooms, suites, outdoor terraces, or event halls available for hire at this venue.
            </p>
          </div>
          <button
            type="button"
            id="add-first-space-btn"
            onClick={handleAddSpace}
            className="px-4 py-2.5 rounded-xl bg-[#26343D] text-white hover:bg-[#1E2930] text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Your First Space</span>
          </button>
        </div>
      ) : activeSpace ? (
        <div className="bg-[#F4F1EA] p-5 rounded-2xl border border-[#DDD8CF] space-y-5">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-[#26343D] flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-[#A86445]" />
              <span>Editing: {activeSpace.name || 'Unnamed Space'}</span>
            </h4>
            <button
              type="button"
              onClick={() => handleRemoveSpace(activeSpace.id)}
              className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-red-200"
            >
              <Trash2 className="w-3 h-3" />
              <span>Remove Space</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[11px] font-semibold text-[#26343D]">Space Name *</label>
              <input
                type="text"
                value={activeSpace.name}
                onChange={(e) => handleUpdateSpace(activeSpace.id, 'name', e.target.value)}
                placeholder="e.g. The Grand Ballroom, Riverfront Terrace, or Palm Court"
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#26343D]">Floor / Level</label>
              <input
                type="text"
                value={activeSpace.floorLocation}
                onChange={(e) => handleUpdateSpace(activeSpace.id, 'floorLocation', e.target.value)}
                placeholder="e.g. Ground Floor, Mezzanine, or Level 2"
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>

            <div className="space-y-1 sm:col-span-3">
              <label className="text-[11px] font-semibold text-[#26343D]">Space Description</label>
              <textarea
                rows={2}
                value={activeSpace.description}
                onChange={(e) => handleUpdateSpace(activeSpace.id, 'description', e.target.value)}
                placeholder="Key architectural features, lighting, views, or atmosphere of this particular room..."
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>

            {/* Capacity Matrix */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#26343D] flex items-center gap-1">
                <Users className="w-3 h-3 text-[#A86445]" />
                <span>Max Standing / Cocktail *</span>
              </label>
              <input
                type="number"
                min="1"
                value={activeSpace.maxCapacity || activeSpace.standingCapacity || 0}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  handleUpdateSpace(activeSpace.id, 'maxCapacity', val);
                  handleUpdateSpace(activeSpace.id, 'standingCapacity', val);
                }}
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#26343D] flex items-center gap-1">
                <Users className="w-3 h-3 text-[#A86445]" />
                <span>Seated Banquet Capacity</span>
              </label>
              <input
                type="number"
                min="0"
                value={activeSpace.seatedCapacity || 0}
                onChange={(e) => handleUpdateSpace(activeSpace.id, 'seatedCapacity', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#26343D] flex items-center gap-1">
                <Users className="w-3 h-3 text-[#A86445]" />
                <span>Theatre / Presentation Capacity</span>
              </label>
              <input
                type="number"
                min="0"
                value={activeSpace.theatreCapacity || 0}
                onChange={(e) => handleUpdateSpace(activeSpace.id, 'theatreCapacity', parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>

            {/* Spatial Dimensions */}
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#66737A] flex items-center gap-1">
                <Maximize2 className="w-3 h-3 text-[#66737A]" />
                <span>Floor Area (Square Metres / m²)</span>
              </label>
              <input
                type="number"
                min="0"
                value={activeSpace.squareMeters || 0}
                onChange={(e) => {
                  const sqm = parseInt(e.target.value, 10) || 0;
                  handleUpdateSpace(activeSpace.id, 'squareMeters', sqm);
                  handleUpdateSpace(activeSpace.id, 'squareFeet', Math.round(sqm * 10.764));
                }}
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#66737A] flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3 text-[#66737A]" />
                <span>Ceiling Height (Metres / m)</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={activeSpace.ceilingHeightMeters || 0}
                onChange={(e) => {
                  const ch = parseFloat(e.target.value) || 0;
                  handleUpdateSpace(activeSpace.id, 'ceilingHeightMeters', ch);
                  handleUpdateSpace(activeSpace.id, 'ceilingHeightFt', Math.round(ch * 3.281));
                }}
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-[#66737A] flex items-center gap-1">
                <Accessibility className="w-3 h-3 text-[#66737A]" />
                <span>Accessibility Notes</span>
              </label>
              <input
                type="text"
                value={activeSpace.accessibilityDetails || ''}
                onChange={(e) => handleUpdateSpace(activeSpace.id, 'accessibilityDetails', e.target.value)}
                placeholder="e.g. Step-free entry, passenger elevator"
                className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
