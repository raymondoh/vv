import React from 'react';
import { Image as ImageIcon, Video, FileText, Sparkles, Plus, Trash2, CheckCircle2, Info, Eye } from 'lucide-react';
import { Venue, WalkthroughClip, MediaAsset } from '../../../types';

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

  const handleAddGalleryUrl = (url: string) => {
    if (!gallery.includes(url)) {
      onGalleryImagesChange([...gallery, url]);
    }
  };

  const handleRemoveGalleryUrl = (index: number) => {
    onGalleryImagesChange(gallery.filter((_, i) => i !== index));
  };

  const handleAddSampleWalkthrough = () => {
    const newClip: WalkthroughClip = {
      id: `clip-${Date.now().toString().slice(-6)}`,
      layoutCategory: 'banquet',
      title: 'Grand Hall & Layout Walkthrough Tour',
      description: 'Comprehensive video walkthrough showing main entry arrival, dining floor space, and stage line-of-sight.',
      durationSec: 80,
      videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      thumbnail: venue.heroImage || PHOTO_PRESETS[0].url,
      cameraAngles: ['Main Foyer Entrance', 'Central Hall Area', 'Elevated Balcony'],
      setupHighlights: ['Spacious layout setup', 'Even acoustic distribution', 'Ambient lighting accents'],
      milestones: [
        { timeSec: 0, label: 'Arrival Foyer', description: 'Double entrance doors and coat check zone.' },
        { timeSec: 35, label: 'Main Floor Area', description: 'Clear span layout with flexible table arrangements.' },
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
          Add high-resolution photography and optional video walkthroughs. You do not need professional videos to list your venue right away.
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
          Listings with walkthroughs and floor plans help customers understand the space before arranging a visit, reducing back-and-forth inquiries by 60%. However, basic photography and core details are all you need to go live today.
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
            <p className="text-[10px] text-[#66737A]">Adds floor plan diagrams and simple room walkarounds.</p>
          </div>
          <div className="bg-white p-3 rounded-xl border border-[#DDD8CF] space-y-1">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#26343D]">
              <span>3. Advanced Tour</span>
              <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">Top Conversion</span>
            </div>
            <p className="text-[10px] text-[#66737A]">4K recorded walkthroughs across multiple room layouts.</p>
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

      {/* Walkthrough Video Clips Section */}
      <div className="bg-[#F4F1EA] p-5 rounded-2xl border border-[#DDD8CF] space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
              <Video className="w-4 h-4 text-[#A86445]" />
              <span>Virtual Walkthroughs & Video Tours</span>
            </h4>
            <p className="text-[11px] text-[#66737A]">
              Attach high-definition remote inspection clips or simulated walkthrough demos.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddSampleWalkthrough}
            className="px-3 py-1.5 bg-[#26343D] text-white rounded-xl text-xs font-bold hover:bg-[#1E2930] flex items-center gap-1.5 shadow-xs transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Walkthrough Clip</span>
          </button>
        </div>

        {clips.length === 0 ? (
          <div className="p-6 text-center bg-white rounded-xl border border-[#DDD8CF] space-y-2">
            <Video className="w-6 h-6 text-[#66737A] mx-auto opacity-60" />
            <p className="text-xs text-[#26343D] font-semibold">No Walkthrough Clips Attached</p>
            <p className="text-[11px] text-[#66737A]">
              You can publish your listing now without video and add a walkthrough later at any time.
            </p>
            <button
              type="button"
              onClick={handleAddSampleWalkthrough}
              className="text-xs text-[#A86445] font-bold hover:underline"
            >
              + Attach Sample 4K Video Tour
            </button>
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
    </div>
  );
};
