import React, { useState } from 'react';
import { Sparkles, Send, ArrowRight, CheckCircle2, Building2, MapPin, Users, DollarSign, X, RefreshCw } from 'lucide-react';
import { Venue, AiMatchResponse } from '../types';

interface AiVenueMatcherProps {
  isOpen: boolean;
  onClose: () => void;
  venues: Venue[];
  onSelectVenue: (venue: Venue, layoutCategory?: string) => void;
  initialPrompt?: string;
}

const SAMPLE_PROMPTS = [
  'Executive meeting space for 40 in New York with high-speed fiber and sky terrace',
  'Daylight glasshouse in Chicago for a 120-person training workshop under $5,500',
  'Private dinner and wine cellar tasting setting for 60 guests in Napa Valley',
  'Auditorium or historic hall for a 250-attendee conference and reception in San Francisco',
  'Industrial space with loading dock and high ceilings for product showcase in Seattle',
];

export const AiVenueMatcher: React.FC<AiVenueMatcherProps> = ({
  isOpen,
  onClose,
  venues,
  onSelectVenue,
  initialPrompt = '',
}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<AiMatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialPrompt && isOpen) {
      setPrompt(initialPrompt);
      handleAnalyze(initialPrompt);
    }
  }, [initialPrompt, isOpen]);

  const handleAnalyze = async (queryText: string) => {
    const textToQuery = queryText || prompt;
    if (!textToQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/gemini/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: textToQuery }),
      });

      if (!response.ok) {
        throw new Error('Failed to match venue');
      }

      const data = await response.json();
      if (data.success && data.match) {
        setMatchResult(data.match);
      } else {
        throw new Error(data.error || 'No match found');
      }
    } catch (err: any) {
      console.error('Error during matching:', err);
      setError('Could not connect to intelligent search service. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const topVenue = matchResult
    ? venues.find((v) => v.id === matchResult.topPickVenueId) || venues[0]
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white border border-[#DDD8CF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#DDD8CF] flex items-center justify-between bg-[#F4F1EA]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#DDD8CF] flex items-center justify-center shadow-xs">
              <Sparkles className="w-5 h-5 text-[#A86445]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#26343D] tracking-tight flex items-center gap-2">
                Intelligent Venue Finder
                <span className="text-[10px] px-2 py-0.5 font-normal bg-white text-[#66737A] rounded-full border border-[#DDD8CF]">
                  Natural Language Search
                </span>
              </h2>
              <p className="text-xs text-[#66737A]">Describe your spatial, acoustic, capacity, or location needs</p>
            </div>
          </div>
          <button
            id="close-ai-matcher-btn"
            onClick={onClose}
            className="p-2 text-[#66737A] hover:text-[#26343D] rounded-lg hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Input Box */}
          <div className="space-y-2.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
              Event & Space Requirements
            </label>
            <div className="relative">
              <textarea
                id="ai-matcher-input"
                rows={3}
                placeholder="e.g. 'Looking for a daylight conference space in Chicago for 120 guests with breakout zones under $6,000'..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleAnalyze(prompt);
                  }
                }}
                className="w-full bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl p-3.5 text-sm text-[#26343D] focus:bg-white focus:outline-none focus:border-[#26343D] placeholder:text-[#66737A]/70 resize-none"
              />
              <button
                id="submit-ai-matcher-btn"
                onClick={() => handleAnalyze(prompt)}
                disabled={loading || !prompt.trim()}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-4 py-2 bg-[#26343D] text-white font-semibold text-xs rounded-lg shadow-xs hover:bg-[#1E2930] disabled:opacity-50 transition-all active:scale-95"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Searching...</span>
                  </>
                ) : (
                  <>
                    <span>Search Spaces</span>
                    <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Examples */}
          {!matchResult && !loading && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-[#66737A] uppercase tracking-wider">
                Or select an example search:
              </p>
              <div className="space-y-1.5">
                {SAMPLE_PROMPTS.map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPrompt(sample);
                      handleAnalyze(sample);
                    }}
                    className="w-full text-left text-xs p-2.5 rounded-lg bg-[#F4F1EA] border border-[#DDD8CF] text-[#66737A] hover:text-[#26343D] hover:border-[#26343D] hover:bg-white transition-all flex items-center justify-between group"
                  >
                    <span>"{sample}"</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#66737A] group-hover:text-[#26343D] group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading Animation */}
          {loading && (
            <div className="py-10 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-[#A86445] animate-spin" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[#26343D]">Evaluating Space & Capacity Specs</p>
                <p className="text-xs text-[#66737A] mt-0.5">Filtering by capacity, architectural layout, and budget parameters...</p>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          {/* Match Result Display */}
          {matchResult && topVenue && !loading && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Match Header Badge */}
              <div className="p-3.5 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-white border border-[#DDD8CF] flex items-center justify-center text-[#A86445]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#26343D] uppercase tracking-wider">Recommended Space</span>
                    <p className="text-[11px] text-[#66737A]">{matchResult.confidenceScore}% Requirement Match</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-xs font-bold bg-[#26343D] text-white rounded-md">
                  {matchResult.confidenceScore}% MATCH
                </span>
              </div>

              {/* Recommended Venue Card */}
              <div className="bg-white border border-[#DDD8CF] rounded-xl overflow-hidden shadow-xs">
                <div className="relative h-44 w-full">
                  <img
                    src={topVenue.heroImage}
                    alt={topVenue.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 text-[10px] font-medium bg-black/60 backdrop-blur-md text-white border border-white/20 rounded-md">
                      {topVenue.aesthetic}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white tracking-tight">{topVenue.name}</h3>
                      <p className="text-xs text-stone-200 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#A86445]" />
                        {topVenue.location.neighborhood}, {topVenue.location.city}, {topVenue.location.state}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-stone-300 block">Starting from</span>
                      <span className="text-sm font-bold text-white">
                        ${topVenue.pricing.startingPrice.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* Assessment */}
                  <div className="text-xs text-[#26343D] bg-[#F4F1EA] p-3 rounded-lg border border-[#DDD8CF] leading-relaxed">
                    <span className="font-semibold text-[#26343D] block mb-1">Spatial Assessment:</span>
                    {matchResult.aiExplanation}
                  </div>

                  {/* Key Match Factors */}
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-[#66737A] mb-1.5">
                      Key Highlights:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {matchResult.keyMatchFactors.map((factor, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-[#66737A]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#A86445] shrink-0" />
                          <span>{factor}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Layout Tag */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-[#DDD8CF]">
                    <span className="text-[#66737A]">
                      Recommended Layout: <strong className="text-[#26343D]">{matchResult.recommendedLayout}</strong>
                    </span>
                    {topVenue.walkthroughClips && topVenue.walkthroughClips.length > 0 && (
                      <span className="text-emerald-700 text-[11px] font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {topVenue.walkthroughClips.length} {topVenue.walkthroughClips.length === 1 ? 'Walkthrough Video' : 'Walkthrough Videos'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  id="view-ai-matched-venue-btn"
                  onClick={() => {
                    onSelectVenue(topVenue);
                    onClose();
                  }}
                  className="flex-1 py-3 px-4 bg-[#A86445] text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-[#8F5439] shadow-xs transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <span>Explore Space</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setMatchResult(null);
                    setPrompt('');
                  }}
                  className="py-3 px-4 bg-white border border-[#DDD8CF] text-[#66737A] hover:text-[#26343D] hover:bg-[#F4F1EA] rounded-xl text-xs sm:text-sm transition-colors"
                >
                  New Search
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
