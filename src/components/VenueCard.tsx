import React, { useState } from 'react';
import { Play, Video, Users, MapPin, Star, Calendar, Heart, ImageIcon } from 'lucide-react';
import { Venue } from '../types';
import { formatCurrency } from '../utils/formatters';
import { getVenueSpaces, getTotalConfiguredLayouts, getVenueLayoutChips } from '../utils/venueConfigurationHelpers';

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
  const hasRecordedWalkthrough = Array.isArray(venue.walkthroughClips) && venue.walkthroughClips.length > 0;
  const hasLiveTours = Boolean(venue.availableSlots && venue.availableSlots.length > 0);
  const hasPhotos = Boolean(venue.heroImage || (venue.galleryImages && venue.galleryImages.length > 0));
  const heroImageSrc = venue.heroImage || (venue.galleryImages && venue.galleryImages[0]) || '';
  const hasReviews = Boolean(venue.reviewCount && venue.reviewCount > 0 && venue.rating && venue.rating > 0);

  const spaces = getVenueSpaces(venue);
  const totalLayouts = getTotalConfiguredLayouts(venue);
  const layoutChips = getVenueLayoutChips(venue, 3);

  const derivedSeated =
    venue.capacity?.seatedBanquet ||
    (venue.spaces?.reduce((max, s) => Math.max(max, s.seatedCapacity || 0), 0)) ||
    0;
  const derivedCocktail =
    venue.capacity?.cocktail ||
    (venue.spaces?.reduce((max, s) => Math.max(max, s.standingCapacity || s.maxCapacity || 0), 0)) ||
    0;

  return (
    <div
      id={`venue-card-${venue.id}`}
      className={`group relative bg-white border rounded-2xl overflow-hidden transition-all duration-300 flex flex-col ${
        isAiMatched
          ? 'border-[#A86445] ring-1 ring-[#A86445] shadow-md shadow-stone-300/40'
          : 'border-[#DDD8CF] hover:border-[#A86445]/60 shadow-xs hover:shadow-md hover:shadow-stone-300/40'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* AI Matched Top Highlight Badge */}
      {isAiMatched && (
        <div className="bg-[#F3E7DF] border-b border-[#DDD8CF] px-3.5 py-1.5 text-[11px] font-medium text-[#26343D] flex items-center justify-between">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A86445]" />
            Matches your criteria
          </span>
          <span className="text-[#A86445] font-semibold text-[10px]">Recommended</span>
        </div>
      )}

      {/* Video Thumbnail / Image Area */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#EAE5DC] cursor-pointer" onClick={() => onSelectVenue(venue)}>
        {hasPhotos && heroImageSrc ? (
          <>
            <img
              src={heroImageSrc}
              alt={venue.name}
              className={`w-full h-full object-cover transition-transform duration-700 ease-out ${
                isHovered ? 'scale-105 opacity-95' : 'scale-100 opacity-90'
              }`}
              loading="lazy"
            />
            {/* Gradient overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
          </>
        ) : (
          /* Deliberate Visual Placeholder for Missing Photos */
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#EAE5DC]">
            <div className="w-11 h-11 rounded-2xl bg-[#DDD8CF] flex items-center justify-center text-[#A86445] mb-2 shadow-xs">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-bold text-[#26343D] truncate max-w-[85%]">{venue.name}</span>
            <span className="text-[11px] text-[#66737A] mt-0.5">Venue photos not added yet</span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasRecordedWalkthrough && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold text-white bg-[#A86445] rounded-full shadow-xs">
                <Video className="w-3 h-3 text-white" />
                Recorded Walkthrough
              </span>
            )}
            {totalLayouts > 0 ? (
              <span className="px-2.5 py-1 text-[10px] font-medium text-white bg-black/60 backdrop-blur-md rounded-full border border-white/20">
                {spaces.length > 0 ? `${spaces.length} ${spaces.length === 1 ? 'Space' : 'Spaces'} · ` : ''}
                {totalLayouts} {totalLayouts === 1 ? 'Configuration' : 'Configurations'}
              </span>
            ) : spaces.length > 0 ? (
              <span className="px-2.5 py-1 text-[10px] font-medium text-white bg-black/60 backdrop-blur-md rounded-full border border-white/20">
                {spaces.length} {spaces.length === 1 ? 'Space' : 'Spaces'}
              </span>
            ) : null}
          </div>

          <button
            id={`fav-btn-${venue.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(venue.id);
            }}
            className={`p-2 rounded-full backdrop-blur-md transition-all ${
              isFavorited
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 scale-105'
                : 'bg-black/50 text-white hover:text-rose-300 hover:bg-black/70'
            }`}
            title={isFavorited ? 'Remove from saved' : 'Save space'}
          >
            <Heart className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
          </button>
        </div>

        {/* Center Hover Video Play Overlay - Only show when actual recorded walkthrough exists */}
        {hasRecordedWalkthrough && (
          <div
            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 pointer-events-none ${
              isHovered ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="w-12 h-12 rounded-full bg-[#26343D] border border-white/30 flex items-center justify-center text-white shadow-lg transform scale-95 group-hover:scale-100 transition-transform">
              <Play className="w-4 h-4 fill-current ml-0.5 text-white" />
            </div>
          </div>
        )}

        {/* Bottom thumbnail tag */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <span className="text-[11px] font-medium text-stone-100 bg-black/70 backdrop-blur-md px-2.5 py-0.5 rounded-md border border-white/10 truncate max-w-[65%]">
            {venue.aesthetic || 'Event Space'}
          </span>
          {hasReviews ? (
            <div className="flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-md text-amber-300 text-xs font-semibold">
              <Star className="w-3 h-3 fill-current" />
              <span>{venue.rating.toFixed(2)}</span>
              <span className="text-stone-300 text-[10px]">({venue.reviewCount})</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md text-stone-200 text-[10px]">
              <span>No reviews yet</span>
            </div>
          )}
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
                className="text-base font-bold text-[#26343D] group-hover:text-[#A86445] transition-colors cursor-pointer line-clamp-1"
              >
                {venue.name}
              </h3>
            </div>
            <p className="text-xs text-[#66737A] flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-[#A86445] shrink-0" />
              <span>{venue.location.neighborhood ? `${venue.location.neighborhood}, ` : ''}{venue.location.city}, {venue.location.state || venue.location.country}</span>
            </p>
          </div>

          {venue.tagline && (
            <p className="text-xs text-[#66737A] line-clamp-2 mt-2 leading-relaxed">
              {venue.tagline}
            </p>
          )}

          {/* Key Layout Configurations or Spaces */}
          {layoutChips.length > 0 && (
            <div className="mt-3.5 flex items-center gap-1.5 flex-wrap">
              {layoutChips.map((chip, idx) => (
                <span
                  key={idx}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-[#F4F1EA] border border-[#DDD8CF] text-[#66737A]"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Specs Grid */}
        <div className="pt-3 border-t border-[#DDD8CF] grid grid-cols-2 gap-2 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-semibold text-[#66737A]">Capacity</span>
            <div className="flex items-center gap-1 text-[#26343D] font-medium">
              <Users className="w-3.5 h-3.5 text-[#A86445]" />
              <span>
                {derivedSeated > 0 && derivedCocktail > 0
                  ? `${derivedSeated} seated / ${derivedCocktail} cocktail`
                  : derivedCocktail > 0
                  ? `Max ${derivedCocktail} guests`
                  : derivedSeated > 0
                  ? `${derivedSeated} seated`
                  : 'Capacity on Request'}
              </span>
            </div>
          </div>

          <div className="space-y-0.5 text-right">
            <span className="text-[10px] uppercase font-semibold text-[#66737A]">Starting Rate</span>
            <div className="text-sm font-bold text-[#26343D]">
              {formatCurrency(venue.pricing.startingPrice, venue.pricing.currency || 'GBP')}
              <span className="text-[10px] font-normal text-[#66737A]"> /{venue.pricing.priceUnit?.replace('per ', '') || 'day'}</span>
            </div>
          </div>
        </div>

        {/* Action Button Row */}
        <div className={`grid ${hasLiveTours ? 'grid-cols-2' : 'grid-cols-1'} gap-2 pt-1`}>
          <button
            id={`watch-tour-btn-${venue.id}`}
            onClick={() => onSelectVenue(venue)}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-xs ${
              hasLiveTours
                ? 'bg-white border border-[#DDD8CF] text-[#26343D] hover:bg-[#F4F1EA] hover:border-[#26343D]'
                : 'bg-[#26343D] text-white hover:bg-[#1E2930]'
            }`}
          >
            <Play className={`w-3 h-3 fill-current ${hasLiveTours ? 'text-[#A86445]' : 'text-[#D89B7F]'}`} />
            <span>Explore Space</span>
          </button>

          {hasLiveTours && (
            <button
              id={`book-live-btn-${venue.id}`}
              onClick={() => onBookWalkthrough(venue)}
              className="w-full py-2.5 px-3 rounded-xl bg-[#26343D] text-xs font-semibold text-white hover:bg-[#1E2930] transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-xs"
            >
              <Calendar className="w-3.5 h-3.5 text-stone-300" />
              <span>Live Tour</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
