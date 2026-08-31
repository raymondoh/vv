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
  'I need a venue for 100 people in Chicago with an industrial aesthetic under $5,000',
  'Romantic hillside vineyard for 200 guests with sunset ceremony in Napa Valley',
  'Skyline rooftop penthouse for a high-profile corporate product reveal with 180 attendees in NYC',
  'Waterfront villa in Miami with private yacht docking and infinity pool for 220 people',
  'Alpine timber lodge with grand stone fireplaces in Aspen for 150 guests',
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
      console.error('Error during AI matching:', err);
      setError('Could not connect to AI matcher. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const topVenue = matchResult
    ? venues.find((v) => v.id === matchResult.topPickVenueId) || venues[0]
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#11141b] border border-[#2b313d] rounded-2xl shadow-2xl shadow-black overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#232731] flex items-center justify-between bg-gradient-to-r from-[#171b24] to-[#12151d]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#8c6b1b] p-[1px] flex items-center justify-center shadow-lg shadow-[#d4af37]/20">
              <div className="w-full h-full bg-[#11141a] rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#f3d98b]" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-serif-luxury flex items-center gap-2">
                AI Venue Matcher
                <span className="text-[10px] px-2 py-0.5 font-sans font-semibold bg-[#d4af37]/20 text-[#fae29c] rounded-full border border-[#d4af37]/40">
                  Powered by Gemini
                </span>
              </h2>
              <p className="text-xs text-gray-400">Describe your vision in plain English—our AI analyzes spaces, acoustics & budgets</p>
            </div>
          </div>
          <button
            id="close-ai-matcher-btn"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-[#1f2430] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Input Box */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
              Your Event Requirements
            </label>
            <div className="relative">
              <textarea
                id="ai-matcher-input"
                rows={3}
                placeholder="e.g. 'I need a venue for 100 people in Chicago with an industrial aesthetic under $5,000 and private bridal suite'..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleAnalyze(prompt);
                  }
                }}
                className="w-full bg-[#161a22] border border-[#2b3342] rounded-xl p-3.5 text-sm text-white focus:outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] placeholder:text-gray-500 resize-none"
              />
              <button
                id="submit-ai-matcher-btn"
                onClick={() => handleAnalyze(prompt)}
                disabled={loading || !prompt.trim()}
                className="absolute bottom-3 right-3 flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#d4af37] to-[#b38622] text-black font-semibold text-xs rounded-lg hover:shadow-lg hover:shadow-[#d4af37]/20 disabled:opacity-50 transition-all active:scale-95"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Matching...</span>
                  </>
                ) : (
                  <>
                    <span>Find Match</span>
                    <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Examples */}
          {!matchResult && !loading && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Or pick a curated prompt:
              </p>
              <div className="space-y-1.5">
                {SAMPLE_PROMPTS.map((sample, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPrompt(sample);
                      handleAnalyze(sample);
                    }}
                    className="w-full text-left text-xs p-2.5 rounded-lg bg-[#151921] border border-[#232936] text-gray-300 hover:text-white hover:border-[#d4af37]/50 hover:bg-[#1a202c] transition-all flex items-center justify-between group"
                  >
                    <span>"{sample}"</span>
                    <ArrowRight className="w-3.5 h-3.5 text-gray-500 group-hover:text-[#fae29c] group-hover:translate-x-0.5 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading Animation */}
          {loading && (
            <div className="py-12 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-[#1c2230] border border-[#d4af37]/40 flex items-center justify-center relative shadow-lg shadow-[#d4af37]/10">
                <Sparkles className="w-7 h-7 text-[#fae29c] animate-spin-slow" />
                <div className="absolute inset-0 rounded-2xl border-2 border-[#d4af37] animate-ping opacity-25" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Synthesizing Venue Catalog & Layout Specs</p>
                <p className="text-xs text-gray-400 mt-1">Cross-referencing capacity limits, architectural styles, and budget brackets...</p>
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-200 text-xs">
              {error}
            </div>
          )}

          {/* Match Result Display */}
          {matchResult && topVenue && !loading && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Match Header Badge */}
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#241f11] via-[#1c180e] to-[#161a22] border border-[#d4af37]/40 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#d4af37]/20 flex items-center justify-center text-[#fae29c]">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-[#fae29c] uppercase tracking-wider">Top Recommended Match</span>
                    <p className="text-[11px] text-gray-300">{matchResult.confidenceScore}% Vision Alignment Score</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 text-xs font-bold bg-[#d4af37] text-black rounded-md">
                  {matchResult.confidenceScore}% MATCH
                </span>
              </div>

              {/* Recommended Venue Card */}
              <div className="bg-[#161a22] border border-[#2c3342] rounded-xl overflow-hidden hover:border-[#d4af37] transition-all">
                <div className="relative h-44 w-full">
                  <img
                    src={topVenue.heroImage}
                    alt={topVenue.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#11141b] via-[#11141b]/40 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-black/70 backdrop-blur-md text-[#fae29c] border border-[#d4af37]/40 rounded-md">
                      {topVenue.aesthetic}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white font-serif-luxury">{topVenue.name}</h3>
                      <p className="text-xs text-gray-300 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-amber-400" />
                        {topVenue.location.neighborhood}, {topVenue.location.city}, {topVenue.location.state}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block">Starting from</span>
                      <span className="text-sm font-bold text-[#fae29c]">
                        ${topVenue.pricing.startingPrice.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {/* AI Explanation */}
                  <div className="text-xs text-gray-200 bg-[#12151d] p-3 rounded-lg border border-[#232834] leading-relaxed">
                    <span className="font-semibold text-[#fae29c] block mb-1">AI Concierge Assessment:</span>
                    {matchResult.aiExplanation}
                  </div>

                  {/* Key Match Factors */}
                  <div>
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">
                      Key Fit Highlights:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {matchResult.keyMatchFactors.map((factor, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{factor}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Layout Tag */}
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-[#232834]">
                    <span className="text-gray-400">
                      Recommended Walkthrough: <strong className="text-white">{matchResult.recommendedLayout}</strong>
                    </span>
                    <span className="text-[#fae29c] text-[11px]">
                      {topVenue.walkthroughClips.length} Layout Walkthroughs
                    </span>
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
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-[#d4af37] to-[#b38622] text-black font-bold text-xs sm:text-sm rounded-xl hover:shadow-lg hover:shadow-[#d4af37]/30 transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <span>Launch Virtual Video Tour</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setMatchResult(null);
                    setPrompt('');
                  }}
                  className="py-3 px-4 bg-[#161a22] border border-[#2b3342] text-gray-300 hover:text-white rounded-xl text-xs sm:text-sm transition-colors"
                >
                  Try Another Vision
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
