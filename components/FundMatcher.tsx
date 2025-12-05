import React, { useState } from 'react';
import { Target, AlertCircle, ArrowRight, Loader2, Sparkles, Award } from 'lucide-react';
import { Project, FundMatch } from '../types';
import { FUNDS } from '../constants';
import { analyzeProjectEligibility } from '../services/geminiService';
import { useI18n } from '../i18n';

interface FundMatcherProps {
  project: Project;
  onUpdateMatches: (matches: FundMatch[]) => void;
}

const FundMatcher: React.FC<FundMatcherProps> = ({ project, onUpdateMatches }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const { t } = useI18n();

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    const results = await analyzeProjectEligibility(project.description);
    
    const matches: FundMatch[] = results.map((r: any) => ({
      fundId: r.fundId,
      score: r.score,
      rationale: r.rationale,
      eligibilityStatus: r.eligibilityStatus
    })).sort((a: FundMatch, b: FundMatch) => b.score - a.score);

    onUpdateMatches(matches);
    setAnalysisDone(true);
    setIsAnalyzing(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-primary border-primary shadow-glow-primary';
    if (score >= 50) return 'text-yellow-400 border-yellow-400';
    return 'text-red-400 border-red-400';
  };

  return (
    <div className="space-y-6 h-full">
      {/* Project Context */}
      <div className="bg-glass-dark p-8 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl">
        <h3 className="text-xl font-bold mb-4 flex items-center gap-3 text-white">
            <div className="p-2 bg-primary/20 rounded-xl text-primary">
                <Target size={24}/>
            </div>
            {t('fundMatcher.currentContext')}
        </h3>
        <div className="bg-white/5 p-6 rounded-2xl border border-white/10 text-sm text-text-primary leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
          {project.description || t('fundMatcher.noDescription')}
        </div>
        
        <div className="mt-6 flex justify-end">
            {!analysisDone ? (
                <button
                    onClick={runAnalysis}
                    disabled={isAnalyzing || !project.description}
                    className="flex items-center gap-2 bg-primary text-background px-8 py-3 rounded-xl hover:bg-primary/90 disabled:opacity-50 font-bold transition-all shadow-glow-primary"
                >
                    {isAnalyzing ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                    {isAnalyzing ? t('fundMatcher.analyzingRules') : t('fundMatcher.runAnalysis')}
                </button>
            ) : (
                 <button
                    onClick={() => setAnalysisDone(false)}
                    className="text-sm text-text-secondary hover:text-white underline"
                >
                    {t('fundMatcher.reset')}
                </button>
            )}
        </div>
      </div>

      {/* Results */}
      {analysisDone && project.matchedFunds && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
           <h3 className="text-xl font-bold text-white pl-2">{t('fundMatcher.recommendedFunds')}</h3>
           <div className="grid grid-cols-1 gap-6">
              {project.matchedFunds.map((match) => {
                  const fund = FUNDS.find(f => f.id === match.fundId);
                  if (!fund) return null;

                  return (
                      <div key={match.fundId} className="bg-glass-dark rounded-3xl border border-white/10 p-8 shadow-glass hover:border-primary/50 transition-all duration-300 relative overflow-hidden group">
                          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000 pointer-events-none"></div>
                          
                          {match.eligibilityStatus === 'eligible' && (
                              <div className="absolute top-0 right-0 bg-primary text-background text-xs uppercase font-bold px-4 py-2 rounded-bl-2xl shadow-glow-primary flex items-center gap-1">
                                  <Award size={14} /> {t('fundMatcher.topMatch')}
                              </div>
                          )}
                          
                          <div className="flex flex-col md:flex-row gap-8">
                              {/* Score Circle */}
                              <div className="flex-shrink-0 flex flex-col items-center justify-center gap-3">
                                  <div className={`w-20 h-20 rounded-full flex items-center justify-center border-4 text-2xl font-bold bg-surface/50 backdrop-blur-md ${getScoreColor(match.score)}`}>
                                      {match.score}
                                  </div>
                                  <span className="text-xs font-semibold uppercase text-text-secondary tracking-wider">{t('fundMatcher.fitScore')}</span>
                              </div>

                              {/* Details */}
                              <div className="flex-1">
                                  <div className="flex items-baseline gap-3 mb-2">
                                      <span className="bg-surface border border-white/10 text-primary text-xs px-3 py-1 rounded-full font-bold shadow-sm">{fund.institution}</span>
                                      <h4 className="text-xl font-bold text-white">{fund.code} - {fund.name}</h4>
                                  </div>
                                  
                                  <p className="text-text-primary mb-4 text-sm leading-relaxed opacity-90">{fund.description}</p>
                                  
                                  <div className="bg-white/5 p-4 rounded-xl border border-white/10 mb-4 backdrop-blur-sm">
                                      <p className="text-xs font-bold text-secondary uppercase mb-2 flex items-center gap-2">
                                          <AlertCircle size={14} /> {t('fundMatcher.aiRationale')}
                                      </p>
                                      <p className="text-sm text-white italic">"{match.rationale}"</p>
                                  </div>

                                  <div className="flex items-center gap-6 text-xs text-text-secondary font-medium">
                                      <span className="flex items-center gap-1">{t('fundMatcher.maxBudget')}: <span className="text-white font-bold text-sm">{fund.maxBudget}</span></span>
                                      <span className="flex items-center gap-1">{t('fundMatcher.supportRate')}: <span className="text-white font-bold text-sm">{fund.supportRate}</span></span>
                                  </div>
                              </div>

                              {/* Action */}
                              <div className="flex flex-col justify-center">
                                  <button className="flex items-center gap-2 text-background bg-primary hover:bg-white font-bold px-6 py-3 rounded-xl transition-all shadow-glow-primary">
                                      {t('fundMatcher.startApplication')} <ArrowRight size={18} />
                                  </button>
                              </div>
                          </div>
                      </div>
                  );
              })}
           </div>
        </div>
      )}
    </div>
  );
};

export default FundMatcher;
