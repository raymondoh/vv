import React, { useState } from 'react';
import { Play, Video, Users, MapPin, DollarSign, Star, Calendar, Heart, Eye } from 'lucide-react';
import { Venue } from '../types';

interface VenueCardProps {
  venue: Venue;
  onSelectVenue: (venue: Venue) => void;
  onBookWalkthrough: (venue: Venue) => void;
  isFavorited: boolean;
  onToggleFavorite: (venueId: string) => void;
  isAiMatched?: boolean;
}

export const VenueCard: React.FC<VenueCardProps> = ({
  venue,
  onSelectVenue,
  onBookWalkthrough,
  isFavorited,
  onToggleFavorite,
  isAiMatched = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      id={`venue-card-${venue.id}`}
      className={`group relative bg-[#13171f] border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col ${
        isAiMatched
          ? 'border-[#d4af37] ring-2 ring-[#d4af37]/40 shadow-xl shadow-[#d4af37]/10'
          : 'border-[#232936] hover:border-[#3e485e] hover:shadow-2xl hover:shadow-black/70'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* AI Matched Top Highlight Banner */}
      {isAiMatched && (
        <div className="bg-gradient-to-r from-[#d4af37] to-[#b38622] px-3 py-1 text-[11px] font-bold text-black flex items-center justify-between uppercase tracking-wider">
          <span>★ AI Recommended Match</span>
          <span>98% Fit</span>
        </div>
      )}

      {/* Video Thumbnail Area */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black cursor-pointer" onClick={() => onSelectVenue(venue)}>
        <img
          src={venue.heroImage}
          alt={venue.name}
          className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
            isHovered ? 'scale-105 opacity-90' : 'scale-100 opacity-95'
          }`}
          loading="lazy"
        />

        {/* Gradient dark overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#13171f] via-transparent to-black/50" />

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {venue.instantTourBadge && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black bg-[#fae29c] rounded-full shadow-md">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
                <Video className="w-3 h-3 text-black" />
                Instant Tour
              </span>
            )}
            <span className="px-2.5 py-1 text-[10px] font-semibold text-gray-200 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
              {venue.walkthroughClips.length} Layouts
            </span>
          </div>

          <button
            id={`fav-btn-${venue.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(venue.id);
            }}
            className={`p-2 rounded-full backdrop-blur-md transition-all ${
              isFavorited
                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30 scale-110'
                : 'bg-black/50 text-gray-300 hover:text-rose-400 hover:bg-black/70'
            }`}
            title={isFavorited ? 'Remove from favorites' : 'Save to favorites'}
          >
            <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Center Hover Video Play Overlay */}
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
            isHovered ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="w-14 h-14 rounded-full bg-[#d4af37]/90 backdrop-blur-sm flex items-center justify-center text-black shadow-xl shadow-[#d4af37]/30 transform scale-90 group-hover:scale-100 transition-transform">
            <Play className="w-6 h-6 fill-current ml-0.5" />
          </div>
        </div>

        {/* Bottom thumbnail tag */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <span className="text-[11px] font-medium text-amber-200/90 bg-black/70 backdrop-blur-md px-2.5 py-0.5 rounded-md border border-amber-500/30 truncate max-w-[70%]">
            {venue.aesthetic}
          </span>
          <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md text-amber-400 text-xs font-semibold">
            <Star className="w-3 h-3 fill-current" />
            <span>{venue.rating.toFixed(2)}</span>
            <span className="text-gray-400 text-[10px]">({venue.reviewCount})</span>
          </div>
        </div>
      </div>

      {/* Card Body Details */}
      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
        <div>
          {/* Title and Location */}
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-2">
              <h3
                onClick={() => onSelectVenue(venue)}
                className="text-lg font-bold text-white font-serif-luxury group-hover:text-[#fae29c] transition-colors cursor-pointer line-clamp-1"
              >
                {venue.name}
              </h3>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{venue.location.neighborhood}, {venue.location.city}, {venue.location.state}</span>
            </p>
          </div>

          <p className="text-xs text-gray-300 line-clamp-2 mt-2 leading-relaxed">
            {venue.tagline}
          </p>

          {/* Key Layout Configurations */}
          <div className="mt-3.5 flex items-center gap-1.5 flex-wrap">
            {venue.walkthroughClips.map((clip) => (
              <span
                key={clip.id}
                className="text-[10px] px-2 py-0.5 rounded bg-[#1b202c] border border-[#293142] text-gray-300"
              >
                {clip.layoutCategory === 'banquet' && '🍽️ Banquet'}
                {clip.layoutCategory === 'cocktail' && '🍸 Cocktail'}
                {clip.layoutCategory === 'theater' && '🎭 Theater'}
                {clip.layoutCategory === 'ceremony' && '💍 Ceremony'}
              </span>
            ))}
          </div>
        </div>

        {/* Specs Grid */}
        <div className="pt-3 border-t border-[#1f2533] grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-gray-400">Capacity</span>
            <div className="flex items-center gap-1 text-gray-200 font-medium">
              <Users className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>{venue.capacity.seatedBanquet} seated / {venue.capacity.cocktail} cocktail</span>
            </div>
          </div>

          <div className="space-y-0.5 text-right">
            <span className="text-[10px] uppercase font-semibold text-gray-400">Starting From</span>
            <div className="text-sm font-bold text-[#fae29c]">
              ${venue.pricing.startingPrice.toLocaleString()}
              <span className="text-[10px] font-normal text-gray-400"> /day</span>
            </div>
          </div>
        </div>

        {/* Action Button Row */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            id={`watch-tour-btn-${venue.id}`}
            onClick={() => onSelectVenue(venue)}
            className="w-full py-2.5 px-3 rounded-xl bg-[#1b202c] border border-[#2b3342] text-xs font-semibold text-white hover:bg-[#252c3c] hover:border-[#d4af37]/60 hover:text-[#fae29c] transition-all flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Play className="w-3 h-3 fill-current text-[#d4af37]" />
            <span>Virtual Tour</span>
          </button>

          <button
            id={`book-live-btn-${venue.id}`}
            onClick={() => onBookWalkthrough(venue)}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b38622] text-xs font-semibold text-black hover:shadow-lg hover:shadow-[#d4af37]/20 transition-all flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Book Live Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
