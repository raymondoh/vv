import React, { useState } from 'react';
import { Image as ImageIcon, Video, FileText, Sparkles, Plus, Trash2, CheckCircle2, Circle, Info, Eye, Layers } from 'lucide-react';
import { Venue, WalkthroughClip, MediaAsset, VenueSpace, SpaceLayout } from '../../../types';
import { mapLayoutTypeToCategory } from '../../../utils/venueConfigurationHelpers';

interface MediaWalkthroughStepProps {
  venue: Partial<Venue>;
  onHeroImageChange: (url: string) => void;
  onGalleryImagesChange: (urls: string[]) => void;
  onWalkthroughClipsChange: (clips: WalkthroughClip[]) => void;
}

const PHOTO_PRESETS = [
  { label: 'Grand Conservatory Foyer', url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Neoclassical Gala Hall', url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Riverfront Terrace Sunset', url: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Botanical Palm Garden', url: 'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Industrial Steel Gantry', url: 'https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80' },
  { label: 'Manhattan Skyline Penthouse', url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80' },
];

export const MediaWalkthroughStep: React.FC<MediaWalkthroughStepProps> = ({
  venue,
  onHeroImageChange,
  onGalleryImagesChange,
  onWalkthroughClipsChange,
}) => {
  const gallery = venue.galleryImages || [];
  const clips = venue.walkthroughClips || [];
  const spaces = venue.spaces || [];

  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(spaces[0]?.id || '');
  const activeSpace = spaces.find((s) => s.id === selectedSpaceId) || spaces[0];
  const activeLayouts = activeSpace?.layouts || [];
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>(activeLayouts[0]?.id || '');

  const handleAddGalleryUrl = (url: string) => {
    if (!gallery.includes(url)) {
      onGalleryImagesChange([...gallery, url]);
    }
  };

  const handleRemoveGalleryUrl = (index: number) => {
    onGalleryImagesChange(gallery.filter((_, i) => i !== index));
  };

  const handleAttachWalkthroughToLayout = (targetSpace: VenueSpace, targetLayout: SpaceLayout) => {
    // Avoid duplicate clip for the same layoutId
    const existingIndex = clips.findIndex((c) => c.layoutId === targetLayout.id);
    const clipTitle = targetLayout.title || `${targetLayout.layoutType} Setup Tour`;

    const newClip: WalkthroughClip = {
      id: `clip-${Date.now().toString().slice(-6)}`,
      spaceId: targetSpace.id,
      layoutId: targetLayout.id,
      layoutCategory: mapLayoutTypeToCategory(targetLayout.layoutType) || 'banquet',
      title: clipTitle,
      description: `Recorded walkthrough displaying the ${targetLayout.title || targetLayout.layoutType} setup in ${targetSpace.name}.`,
      durationSec: 75,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumbnail: venue.heroImage || PHOTO_PRESETS[0].url,
      cameraAngles: ['Main Entrance View', 'Central Room Perspective', 'Focal Stage / Head Table View'],
      setupHighlights:
        targetLayout.setupHighlights && targetLayout.setupHighlights.length > 0
          ? targetLayout.setupHighlights
          : ['Configured seating layout', 'Direct access circulation', 'Clear line-of-sight'],
      milestones: [
        { timeSec: 0, label: 'Arrival & Entry', description: `Entry into ${targetSpace.name}.` },
        { timeSec: 30, label: 'Central Seating Area', description: `Arrangement for up to ${targetLayout.capacity} guests.` },
      ],
      maxCapacityForLayout: targetLayout.capacity,
    };

    if (existingIndex >= 0) {
      const updated = [...clips];
      updated[existingIndex] = newClip;
      onWalkthroughClipsChange(updated);
    } else {
      onWalkthroughClipsChange([...clips, newClip]);
    }
  };

  const handleAddGeneralWalkthrough = () => {
    if (activeSpace && activeLayouts.length > 0) {
      const targetLayout = activeLayouts.find((l) => l.id === selectedLayoutId) || activeLayouts[0];
      handleAttachWalkthroughToLayout(activeSpace, targetLayout);
      return;
    }

    // Fallback if no spaces configured
    const newClip: WalkthroughClip = {
      id: `clip-${Date.now().toString().slice(-6)}`,
      layoutCategory: 'banquet',
      title: `${venue.name || 'Venue'} Walkthrough Tour`,
      description: 'Comprehensive video walkthrough showing main arrival, primary floor space, and venue atmosphere.',
      durationSec: 80,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumbnail: venue.heroImage || PHOTO_PRESETS[0].url,
      cameraAngles: ['Main Entrance', 'Central Hall', 'Elevated View'],
      setupHighlights: ['Spacious layout setup', 'Acoustic distribution', 'Ambient lighting'],
      milestones: [
        { timeSec: 0, label: 'Arrival Foyer', description: 'Double entrance doors and coat check zone.' },
        { timeSec: 35, label: 'Main Floor Area', description: 'Flexible table arrangements.' },
      ],
      maxCapacityForLayout: venue.capacity?.seatedBanquet || 200,
    };

    onWalkthroughClipsChange([...clips, newClip]);
  };

  const handleRemoveClip = (clipId: string) => {
    onWalkthroughClipsChange(clips.filter((c) => c.id !== clipId));
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#26343D] flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-[#A86445]" />
          <span>Photos, Floor Plans & Virtual Viewing</span>
        </h3>
        <p className="text-xs text-[#66737A] mt-1">
          Add high-resolution photography and optional video walkthroughs. You do not need video to publish your listing right away.
        </p>
      </div>

      {/* Educational Banner: Progressive Quality */}
      <div className="bg-[#F4F1EA] border border-[#DDD8CF] p-4 sm:p-5 rounded-2xl space-y-3 shadow-xs">
        <div className="flex items-center gap-2.5">
          <Info className="w-4 h-4 text-[#A86445] shrink-0" />
          <h4 className="text-xs font-bold text-[#26343D]">
            Progressive Listing Quality: Publish Anytime, Enhance Later
          </h4>
        </div>
        <p className="text-xs text-[#66737A] leading-relaxed">
          Listings with recorded walkthroughs and floor plans help customers understand the space before arranging a visit, reducing back-and-forth inquiries. However, basic photography and core details are all you need to go live today.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="bg-white p-3 rounded-xl border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#26343D]">
              <span>1. Basic Listing</span>
              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">Ready to Publish</span>
            </div>
            <p className="text-[10px] text-[#66737A]">Venue details, photos, capacities, and pricing.</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#26343D]">
              <span>2. Enhanced</span>
              <span className="text-[#A86445] bg-[#F3E7DF] px-1.5 py-0.5 rounded">+15% Views</span>
            </div>
            <p className="text-[10px] text-[#66737A]">Adds floor plan diagrams and spatial dimensions.</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#26343D]">
              <span>3. Advanced Tour</span>
              <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">Top Conversion</span>
            </div>
            <p className="text-[10px] text-[#66737A]">Recorded walkthroughs across configured room setups.</p>
          </div>
        </div>
      </div>

      {/* Hero Photo Selection */}
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
          Primary Cover / Hero Image *
        </label>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="w-full sm:w-64 h-36 rounded-xl overflow-hidden border border-[#DDD8CF] bg-[#F4F1EA] shrink-0">
            {venue.heroImage ? (
              <img
                src={venue.heroImage}
                alt="Venue Cover"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs text-[#66737A]">
                No cover selected
              </div>
            )}
          </div>
          <div className="space-y-2 flex-1 w-full">
            <input
              type="url"
              value={venue.heroImage || ''}
              onChange={(e) => onHeroImageChange(e.target.value)}
              placeholder="Paste custom cover image URL or select from presets below..."
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            />
            <div className="flex flex-wrap gap-1.5">
              {PHOTO_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onHeroImageChange(preset.url)}
                  className="px-2.5 py-1 bg-white hover:bg-[#F4F1EA] text-[#26343D] text-[11px] font-medium rounded-lg border border-[#DDD8CF] transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Photos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
            Gallery Photos ({gallery.length} added)
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {gallery.map((url, idx) => (
            <div key={idx} className="relative group rounded-xl overflow-hidden border border-[#DDD8CF] h-28 bg-[#F4F1EA]">
              <img src={url} alt={`Gallery ${idx}`} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemoveGalleryUrl(idx)}
                className="absolute top-1.5 right-1.5 p-1 bg-black/60 hover:bg-black text-white rounded-md text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {/* Quick add presets */}
          {PHOTO_PRESETS.filter((p) => !gallery.includes(p.url)).slice(0, 2).map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handleAddGalleryUrl(p.url)}
              className="h-28 rounded-xl border border-dashed border-[#DDD8CF] bg-white hover:bg-[#F4F1EA] p-2 flex flex-col items-center justify-center text-center gap-1 transition-all"
            >
              <Plus className="w-4 h-4 text-[#A86445]" />
              <span className="text-[10px] text-[#66737A] font-semibold">Add {p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Walkthrough Video Clips & Configuration Association */}
      <div className="bg-[#F4F1EA] p-5 rounded-2xl border border-[#DDD8CF] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
              <Video className="w-4 h-4 text-[#A86445]" />
              <span>Virtual Walkthroughs & Video Tours</span>
            </h4>
            <p className="text-[11px] text-[#66737A]">
              Attach recorded walkthrough clips to specific room configurations or add a venue overview.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#66737A]">
              {clips.length} {clips.length === 1 ? 'clip attached' : 'clips attached'}
            </span>
          </div>
        </div>

        {/* Space & Layout Configuration Walkthrough Mapping */}
        {spaces.length > 0 ? (
          <div className="space-y-4">
            {/* Quick Attach Selector if multiple spaces/configurations */}
            <div className="bg-white p-4 rounded-xl border border-[#DDD8CF] space-y-3 shadow-2xs">
              <span className="text-xs font-bold text-[#26343D] block">
                Attach Walkthrough Clip to Configuration:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#66737A] block">Physical Space</label>
                  <select
                    value={selectedSpaceId}
                    onChange={(e) => {
                      setSelectedSpaceId(e.target.value);
                      const s = spaces.find((sp) => sp.id === e.target.value);
                      if (s?.layouts?.[0]) setSelectedLayoutId(s.layouts[0].id);
                    }}
                    className="w-full text-xs bg-[#F4F1EA] border border-[#DDD8CF] rounded-lg px-3 py-2 text-[#26343D] focus:bg-white focus:outline-hidden"
                  >
                    {spaces.map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name} {sp.floorLocation ? `(${sp.floorLocation})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[#66737A] block">Layout Configuration</label>
                  <select
                    value={selectedLayoutId}
                    onChange={(e) => setSelectedLayoutId(e.target.value)}
                    className="w-full text-xs bg-[#F4F1EA] border border-[#DDD8CF] rounded-lg px-3 py-2 text-[#26343D] focus:bg-white focus:outline-hidden"
                  >
                    {activeLayouts.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title || `${l.layoutType} Setup`} ({l.capacity} guests)
                      </option>
                    ))}
                    {activeLayouts.length === 0 && (
                      <option value="">No layouts added to this space</option>
                    )}
                  </select>
                </div>
              </div>

              <div className="pt-1 flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleAddGeneralWalkthrough}
                  className="px-3.5 py-2 bg-[#26343D] text-white rounded-xl text-xs font-bold hover:bg-[#1E2930] flex items-center gap-1.5 shadow-xs transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Attach Recorded Walkthrough</span>
                </button>
              </div>
            </div>

            {/* Configured Spaces & Attached Walkthrough Status */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#66737A] block">
                Configuration Walkthrough Coverage
              </span>

              {spaces.map((space) => {
                const spaceLayouts = space.layouts || [];
                return (
                  <div key={space.id} className="bg-white rounded-xl border border-[#DDD8CF] p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-[#DDD8CF]/60 pb-2">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#A86445]" />
                        <h5 className="text-xs font-bold text-[#26343D]">{space.name}</h5>
                        {space.floorLocation && (
                          <span className="text-[10px] text-[#66737A] bg-[#F4F1EA] px-2 py-0.5 rounded">
                            {space.floorLocation}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#66737A]">
                        {spaceLayouts.length} {spaceLayouts.length === 1 ? 'configuration' : 'configurations'}
                      </span>
                    </div>

                    {spaceLayouts.length === 0 ? (
                      <p className="text-xs text-[#66737A] py-1">No layout setups configured for this space.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {spaceLayouts.map((layout) => {
                          const attachedClip = clips.find(
                            (c) =>
                              c.layoutId === layout.id ||
                              (c.spaceId === space.id && c.layoutCategory.toLowerCase() === layout.layoutType.toLowerCase())
                          );

                          return (
                            <div
                              key={layout.id}
                              className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-2 ${
                                attachedClip
                                  ? 'bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-200'
                                  : 'bg-[#F4F1EA] border-[#DDD8CF]'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  {attachedClip ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                  ) : (
                                    <Circle className="w-3.5 h-3.5 text-[#66737A] shrink-0" />
                                  )}
                                  <span className="text-xs font-bold text-[#26343D]">
                                    {layout.title || `${layout.layoutType} Setup`}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#66737A] pl-5 space-y-0.5">
                                  <span>Max {layout.capacity} guests</span>
                                  <div className="text-[10px]">
                                    {attachedClip ? (
                                      <span className="text-emerald-700 font-semibold">
                                        Recorded walkthrough attached ({attachedClip.durationSec}s)
                                      </span>
                                    ) : (
                                      <span className="text-[#66737A]">No walkthrough yet</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div>
                                {attachedClip ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveClip(attachedClip.id)}
                                    className="p-1.5 text-stone-400 hover:text-red-500 rounded-lg hover:bg-white transition-colors"
                                    title="Remove clip"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleAttachWalkthroughToLayout(space, layout)}
                                    className="px-2.5 py-1 text-[10px] font-bold text-[#A86445] bg-white border border-[#A86445]/30 rounded-lg hover:bg-[#F3E7DF] transition-colors shrink-0"
                                  >
                                    + Attach Clip
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Fallback when no spaces added */
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleAddGeneralWalkthrough}
              className="px-3 py-1.5 bg-[#26343D] text-white rounded-xl text-xs font-bold hover:bg-[#1E2930] flex items-center gap-1.5 shadow-xs transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Walkthrough Clip</span>
            </button>

            {clips.length === 0 ? (
              <div className="p-6 text-center bg-white rounded-xl border border-[#DDD8CF] space-y-2">
                <Video className="w-6 h-6 text-[#66737A] mx-auto opacity-60" />
                <p className="text-xs text-[#26343D] font-semibold">No Walkthrough Clips Attached</p>
                <p className="text-[11px] text-[#66737A]">
                  You can publish your listing now without video and add a walkthrough later at any time.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {clips.map((clip) => (
                  <div
                    key={clip.id}
                    className="bg-white p-3.5 rounded-xl border border-[#DDD8CF] space-y-2 relative group shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#A86445] bg-[#F3E7DF] px-2 py-0.5 rounded">
                          {clip.layoutCategory || 'Walkthrough'}
                        </span>
                        <h5 className="text-xs font-bold text-[#26343D] mt-1">{clip.title}</h5>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveClip(clip.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-[11px] text-[#66737A] line-clamp-2">{clip.description}</p>
                    <div className="text-[10px] text-[#66737A] flex items-center justify-between border-t border-[#DDD8CF]/60 pt-2">
                      <span>Duration: {clip.durationSec}s</span>
                      <span>{clip.cameraAngles.length} Camera Angles</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
