import React, { useState } from 'react';
import { Calendar, CheckSquare, Building, Landmark, Scale, Clock } from 'lucide-react';
import { IncorporationStep } from '../types';
import { INCORPORATION_STEPS } from '../constants';
import { useI18n } from '../i18n';

const IncorporationGuide: React.FC = () => {
  const [steps, setSteps] = useState<IncorporationStep[]>(INCORPORATION_STEPS);
  const { t } = useI18n();

  const toggleStep = (id: string) => {
    setSteps(steps.map(s =>
      s.id === id ? { ...s, completed: !s.completed } : s
    ));
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'legal': return <Scale size={14} />;
      case 'tax': return <Landmark size={14} />;
      case 'compliance': return <Building size={14} />;
      default: return <CheckSquare size={14} />;
    }
  };

  const progress = Math.round((steps.filter(s => s.completed).length / steps.length) * 100);

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Main Checklist */}
      <div className="flex-1 space-y-6">
        <div className="bg-glass-dark p-8 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h3 className="text-xl font-bold text-white">{t('incorporation.roadmapTitle')}</h3>
                    <p className="text-sm text-text-secondary">{t('incorporation.country')}</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-white bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                    <span className="font-bold text-primary">{progress}%</span> {t('incorporation.complete')}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 bg-white/5 rounded-full mb-10 overflow-hidden border border-white/5">
                <div
                    className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-700 ease-out shadow-glow-primary"
                    style={{ width: `${progress}%` }}
                />
            </div>

            <div className="space-y-4">
                {steps.map((step, index) => (
                    <div
                        key={step.id}
                        className={`group relative flex gap-4 p-5 rounded-2xl border transition-all duration-300 ${
                            step.completed
                                ? 'bg-white/5 border-transparent opacity-60'
                                : 'bg-glass-dark border-white/10 hover:border-primary/30 hover:shadow-glass hover:bg-white/5'
                        }`}
                    >
                        {/* Vertical Line */}
                        {index !== steps.length - 1 && (
                             <div className="absolute left-[29px] top-14 bottom-[-18px] w-0.5 bg-white/10 group-hover:bg-primary/20 transition-colors" />
                        )}

                        <button
                            onClick={() => toggleStep(step.id)}
                            className={`flex-shrink-0 w-6 h-6 rounded-lg border flex items-center justify-center transition-all z-10 ${
                                step.completed
                                    ? 'bg-primary border-primary text-background shadow-glow-primary'
                                    : 'border-white/30 text-transparent hover:border-primary bg-background'
                            }`}
                        >
                            <CheckSquare size={14} fill="currentColor" />
                        </button>

                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded border uppercase font-bold flex items-center gap-1 ${
                                    step.category === 'legal' ? 'bg-secondary/10 text-secondary border-secondary/30' :
                                    step.category === 'tax' ? 'bg-primary/10 text-primary border-primary/30' :
                                    'bg-orange-500/10 text-orange-400 border-orange-500/30'
                                }`}>
                                   {getCategoryIcon(step.category)} {t(`incorporation.category.${step.category}`)}
                                </span>
                                <h4 className={`font-semibold ${step.completed ? 'text-text-secondary line-through' : 'text-white'}`}>
                                    {t(`incorporation.step.${step.id}.title`)}
                                </h4>
                            </div>
                            <p className="text-sm text-text-secondary">{t(`incorporation.step.${step.id}.desc`)}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* Sidebar: Compliance Calendar */}
      <div className="w-full lg:w-80 space-y-6">
        <div className="bg-glass-dark p-6 rounded-3xl border border-white/10 shadow-glass backdrop-blur-xl">
            <h4 className="font-bold flex items-center gap-2 mb-6 text-white">
                <Calendar size={20} className="text-secondary" />
                {t('incorporation.upcomingDeadlines')}
            </h4>

            <div className="space-y-4">
                <div className="flex gap-4 items-start p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="w-12 text-center bg-background rounded-xl py-2 border border-white/10 shadow-inner">
                        <div className="text-[10px] text-primary font-bold uppercase">Oct</div>
                        <div className="text-lg font-bold text-white">26</div>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">{t('incorporation.vatDeclaration')}</p>
                        <p className="text-xs text-text-secondary mt-1">{t('incorporation.vatSub')}</p>
                    </div>
                </div>
                 <div className="flex gap-4 items-start p-3 bg-white/5 rounded-2xl border border-white/5">
                    <div className="w-12 text-center bg-background rounded-xl py-2 border border-white/10 shadow-inner">
                        <div className="text-[10px] text-primary font-bold uppercase">Oct</div>
                        <div className="text-lg font-bold text-white">31</div>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-white">{t('incorporation.sgkPremiums')}</p>
                        <p className="text-xs text-text-secondary mt-1">{t('incorporation.sgkSub')}</p>
                    </div>
                </div>
            </div>

            <button className="w-full mt-6 py-3 border border-white/10 rounded-xl text-sm font-medium text-text-secondary hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-2">
                <Clock size={16} /> {t('incorporation.exportCalendar')}
            </button>
        </div>
      </div>
    </div>
  );
};

export default IncorporationGuide;
