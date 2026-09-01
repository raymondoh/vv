import React, { useState } from 'react';
import { Grid, Plus, Trash2, Layout, Users, FileText, CheckCircle2, Video } from 'lucide-react';
import { VenueSpace, SpaceLayout, SpaceLayoutType } from '../../../types';

interface LayoutsConfigurationsStepProps {
  spaces: VenueSpace[];
  onSpacesChange: (spaces: VenueSpace[]) => void;
}

const LAYOUT_TYPES: { id: SpaceLayoutType; label: string; defaultDesc: string }[] = [
  { id: 'Banquet', label: 'Banquet / Gala', defaultDesc: 'Circular or long dining tables with centerpiece focus and optional dance floor.' },
  { id: 'Theatre', label: 'Theatre / Keynote', defaultDesc: 'Rowed forward-facing seating oriented toward a presenter stage and screen.' },
  { id: 'Cocktail', label: 'Cocktail / Standing', defaultDesc: 'Open circulating space with poseur tables, lounge clusters, and bar service.' },
  { id: 'Boardroom', label: 'Boardroom / Executive', defaultDesc: 'Central conference table with ergonomic executive seating and presentation AV.' },
  { id: 'Classroom', label: 'Classroom / Workshop', defaultDesc: 'Rows of tables and chairs with clear line-of-sight to the educator or screen.' },
  { id: 'Ceremony', label: 'Ceremony / Processional', defaultDesc: 'Central aisle flanked by ceremony seating facing an altar or focal structure.' },
  { id: 'Exhibition', label: 'Exhibition / Pop-up', defaultDesc: 'Modular booth footprints with wide visitor circulation paths.' },
  { id: 'Private Dining', label: 'Private Dining', defaultDesc: 'Intimate dining format with sommelier staging and bespoke course service.' },
  { id: 'Custom', label: 'Custom Configuration', defaultDesc: 'Tailored event production setup designed for bespoke spatial requirements.' },
];

export const LayoutsConfigurationsStep: React.FC<LayoutsConfigurationsStepProps> = ({
  spaces,
  onSpacesChange,
}) => {
  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(spaces[0]?.id || '');
  const activeSpace = spaces.find((s) => s.id === selectedSpaceId) || spaces[0];

  const handleAddLayout = (spaceId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space) return;

    const newLayout: SpaceLayout = {
      id: `layout-${Date.now().toString().slice(-6)}`,
      title: 'New Room Layout',
      layoutType: 'Banquet',
      capacity: space.seatedCapacity || space.maxCapacity || 100,
      description: 'Adaptable layout configuration for this room.',
      setupHighlights: ['Flexible furniture arrangements', 'Clear line of sight'],
    };

    const updated = spaces.map((s) => {
      if (s.id === spaceId) {
        return {
          ...s,
          layouts: [...(s.layouts || []), newLayout],
        };
      }
      return s;
    });

    onSpacesChange(updated);
  };

  const handleRemoveLayout = (spaceId: string, layoutId: string) => {
    const space = spaces.find((s) => s.id === spaceId);
    if (!space || (space.layouts && space.layouts.length <= 1)) return;

    const updated = spaces.map((s) => {
      if (s.id === spaceId) {
        return {
          ...s,
          layouts: s.layouts.filter((l) => l.id !== layoutId),
        };
      }
      return s;
    });

    onSpacesChange(updated);
  };

  const handleUpdateLayout = (spaceId: string, layoutId: string, field: keyof SpaceLayout, value: any) => {
    const updated = spaces.map((s) => {
      if (s.id === spaceId) {
        return {
          ...s,
          layouts: s.layouts.map((l) => {
            if (l.id === layoutId) {
              return { ...l, [field]: value };
            }
            return l;
          }),
        };
      }
      return s;
    });

    onSpacesChange(updated);
  };

  if (!activeSpace) {
    return (
      <div className="p-8 text-center text-xs text-[#66737A]">
        Please create at least one space in the previous step first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#26343D] flex items-center gap-2">
          <Grid className="w-5 h-5 text-[#A86445]" />
          <span>Room Layouts & Configurations</span>
        </h3>
        <p className="text-xs text-[#66737A] mt-1">
          Define the different ways each space can be set up (e.g. Banquet, Theatre, Cocktail, Boardroom). Clients choose their preferred configuration when booking.
        </p>
      </div>

      {/* Space Selector Tabs if multiple spaces */}
      {spaces.length > 1 && (
        <div className="flex items-center gap-2 border-b border-[#DDD8CF] pb-3">
          <span className="text-xs font-semibold text-[#66737A] mr-1">Select Space:</span>
          {spaces.map((space) => {
            const isSelected = space.id === activeSpace.id;
            return (
              <button
                key={space.id}
                type="button"
                onClick={() => setSelectedSpaceId(space.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                  isSelected
                    ? 'bg-[#26343D] text-white border-[#26343D] shadow-xs'
                    : 'bg-white text-[#66737A] border-[#DDD8CF] hover:text-[#26343D]'
                }`}
              >
                {space.name} ({space.layouts?.length || 0} Layouts)
              </button>
            );
          })}
        </div>
      )}

      {/* Layouts for the selected space */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
            Configured Layouts for: <strong className="text-[#A86445]">{activeSpace.name}</strong>
          </h4>
          <button
            type="button"
            onClick={() => handleAddLayout(activeSpace.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#26343D] text-white hover:bg-[#1E2930] flex items-center gap-1.5 transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Layout Setup</span>
          </button>
        </div>

        {(!activeSpace.layouts || activeSpace.layouts.length === 0) ? (
          <div className="p-8 text-center bg-[#F4F1EA] rounded-2xl border border-[#DDD8CF] space-y-2">
            <Layout className="w-8 h-8 text-[#A86445] mx-auto" />
            <p className="text-xs font-semibold text-[#26343D]">No Layouts Configured Yet</p>
            <button
              type="button"
              onClick={() => handleAddLayout(activeSpace.id)}
              className="px-4 py-2 bg-[#A86445] text-white text-xs font-bold rounded-xl shadow-xs"
            >
              Add First Layout Setup
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {activeSpace.layouts.map((layout, idx) => (
              <div
                key={layout.id}
                className="bg-[#F4F1EA] p-4 sm:p-5 rounded-2xl border border-[#DDD8CF] space-y-4 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#A86445] text-white text-[11px] font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-bold text-[#26343D]">{layout.title || `Layout ${idx + 1}`}</span>
                  </div>

                  {activeSpace.layouts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLayout(activeSpace.id, layout.id)}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-red-200"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#26343D]">Layout Style / Category *</label>
                    <select
                      value={layout.layoutType}
                      onChange={(e) => {
                        const newType = e.target.value as SpaceLayoutType;
                        handleUpdateLayout(activeSpace.id, layout.id, 'layoutType', newType);
                        const matched = LAYOUT_TYPES.find((t) => t.id === newType);
                        if (matched && (!layout.description || layout.description.length < 10)) {
                          handleUpdateLayout(activeSpace.id, layout.id, 'description', matched.defaultDesc);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
                    >
                      {LAYOUT_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#26343D]">Setup Title *</label>
                    <input
                      type="text"
                      value={layout.title}
                      onChange={(e) => handleUpdateLayout(activeSpace.id, layout.id, 'title', e.target.value)}
                      placeholder="e.g. Banquet & Gala Setup"
                      className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-[#26343D] flex items-center gap-1">
                      <Users className="w-3 h-3 text-[#A86445]" />
                      <span>Capacity in this Setup *</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={layout.capacity}
                      onChange={(e) => handleUpdateLayout(activeSpace.id, layout.id, 'capacity', parseInt(e.target.value, 10) || 0)}
                      className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2 md:col-span-3">
                    <label className="text-[11px] font-semibold text-[#26343D]">Setup Details & Arrangement</label>
                    <textarea
                      rows={2}
                      value={layout.description}
                      onChange={(e) => handleUpdateLayout(activeSpace.id, layout.id, 'description', e.target.value)}
                      placeholder="Describe the arrangement of tables, chairs, sightlines, dance floor, or AV positioning..."
                      className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
