import React from 'react';
import { Project } from '../types';
import { PlusCircle, ArrowRight, TrendingUp, Bell, FileText, Activity, ShieldCheck, FolderOpen, LifeBuoy, Calculator, ClipboardCheck } from 'lucide-react';

interface DashboardProps {
    project: Project;
    onNavigate: (tab: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ project, onNavigate }) => {
    // Calculate progress based on existing fields
    const hasDescription = !!project.description;
    const hasMatches = project.matchedFunds && project.matchedFunds.length > 0;
    const missingDocs = project.documents.filter(d => d.status === 'missing').length;
    const totalDocs = project.documents.length;
    const docProgress = totalDocs > 0 ? Math.round(((totalDocs - missingDocs) / totalDocs) * 100) : 0;
    
    // Rough "Overall Progress" calculation
    let overallProgress = 0;
    if (hasDescription) overallProgress += 20;
    if (hasMatches) overallProgress += 30;
    overallProgress += Math.round(docProgress * 0.5); // Docs are worth 50%

    // SVG Circle Math
    const radius = 40;
    const circumference = 2 * Math.PI * radius; // ~251.2
    const strokeDashoffset = circumference - (overallProgress / 100) * circumference;

    const bestMatchScore = project.matchedFunds && project.matchedFunds.length > 0 
        ? Math.max(...project.matchedFunds.map(m => m.score)) 
        : 0;
        
    // Funding amount placeholder based on best match
    const potentialFunding = bestMatchScore > 80 ? "2.5M ₺" : bestMatchScore > 50 ? "1.2M ₺" : "0 ₺";

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-full pb-6">
            <div className="lg:col-span-2 grid grid-rows-[auto_auto_1fr] gap-4">
                
                {/* Header */}
                <header className="bg-glass-dark p-8 rounded-3xl shadow-glass backdrop-blur-xl border border-white/10 flex items-center justify-between bg-iridescent relative overflow-hidden group">
                     <div className="relative z-10 flex flex-col justify-center">
                        <h1 className="text-4xl font-bold text-white mb-2">ScaleUp Inc.</h1>
                        <p className="text-text-secondary">Welcome back, let's achieve your next milestone.</p>
                    </div>
                    <div className="relative z-10 text-right flex flex-col items-end">
                        <h3 className="text-lg font-medium text-text-secondary mb-2">Next Major Submission</h3>
                        <div className="flex items-baseline gap-3">
                            <span className="text-7xl font-bold text-primary" style={{ textShadow: "0 0 12px rgba(0, 245, 212, 0.6)" }}>15</span>
                            <span className="text-3xl font-semibold text-primary/80">Days</span>
                        </div>
                        <p className="text-text-secondary mt-1">Innovate UK Grant</p>
                    </div>
                </header>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Progress Circle Widget */}
                    <div className="bg-glass-dark p-6 rounded-2xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col items-center justify-center text-center group hover:border-primary/30 transition-all overflow-hidden relative">
                        <h3 className="text-sm font-medium text-text-secondary mb-3 z-10">Dynamic Overall Progress</h3>
                        <div className="relative w-36 h-36 z-10">
                            <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 opacity-100 group-hover:opacity-0">
                                <svg className="w-full h-full" viewBox="0 0 100 100">
                                    <defs>
                                        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                            <stop offset="0%" stopColor="#00F5D4" />
                                            <stop offset="100%" stopColor="#9B5DE5" />
                                        </linearGradient>
                                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                                            <feMerge>
                                                <feMergeNode in="coloredBlur"/>
                                                <feMergeNode in="SourceGraphic"/>
                                            </feMerge>
                                        </filter>
                                    </defs>
                                    
                                    {/* Outer Decorative Ring */}
                                    <circle 
                                        className="text-white/5 animate-[spin_8s_linear_infinite] origin-center" 
                                        cx="50" cy="50" fill="transparent" r="46" 
                                        stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 2"
                                    ></circle>

                                    {/* Track */}
                                    <circle className="text-surface" cx="50" cy="50" fill="transparent" r="40" stroke="currentColor" strokeWidth="6"></circle>
                                    
                                    {/* Progress Line */}
                                    <circle 
                                        className="transition-all duration-1000 ease-out" 
                                        cx="50" cy="50" fill="transparent" r="40" 
                                        stroke="url(#progressGradient)" 
                                        strokeLinecap="round" 
                                        strokeWidth="6" 
                                        strokeDasharray={circumference}
                                        strokeDashoffset={strokeDashoffset}
                                        style={{ filter: 'url(#glow)' }} 
                                        transform="rotate(-90 50 50)"
                                    ></circle>
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center flex-col">
                                    <span className="text-3xl font-bold text-white drop-shadow-[0_0_8px_rgba(0,245,212,0.5)]">{overallProgress}%</span>
                                    <span className="text-[10px] text-text-secondary uppercase tracking-widest opacity-70">Completed</span>
                                </div>
                            </div>
                            
                            {/* Hover State Detail View */}
                            <div className="absolute inset-0 bg-glass-dark/95 backdrop-blur-md rounded-full flex flex-col items-center justify-center p-4 text-center transition-all duration-500 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 border border-white/10">
                                <h4 className="text-xs font-bold text-white mb-2">Milestones: 6/8</h4>
                                <div className="w-full bg-surface rounded-full h-1.5 mb-2 overflow-hidden">
                                    <div className="bg-gradient-to-r from-primary to-secondary h-1.5 rounded-full" style={{ width: `${overallProgress}%` }}></div>
                                </div>
                                <p className="text-[10px] leading-tight text-text-secondary"><span className="font-semibold text-primary">Next:</span> Submit Grant Proposal</p>
                            </div>
                        </div>
                    </div>

                    {/* Funding Potential Widget */}
                    <div className="bg-glass-dark p-6 rounded-2xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col justify-center items-center text-center hover:border-secondary/30 transition-all">
                        <h3 className="text-sm font-medium text-text-secondary mb-3">Funding Potential</h3>
                        <TrendingUp size={48} className="text-primary mb-2 icon-glow" style={{"--glow-color": "#00F5D4"} as React.CSSProperties} />
                        <p className="text-3xl font-bold text-white">{potentialFunding}</p>
                        <p className="text-xs text-text-secondary mt-1">Based on current trajectory</p>
                    </div>

                    {/* Notifications Widget */}
                    <div className="bg-glass-dark p-6 rounded-2xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col justify-between">
                        <h3 className="text-sm font-medium text-text-secondary mb-4 flex items-center gap-2">
                             <Bell size={16} className="text-white" /> Notifications
                        </h3>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                                    <ShieldCheck size={16} style={{fontVariationSettings: "'FILL' 1"}} />
                                </div>
                                <p className="text-xs text-text-secondary">
                                    <span className="font-semibold text-white">New grant match:</span> Innovate UK.
                                </p>
                            </div>
                             <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0">
                                    <FileText size={16} />
                                </div>
                                <p className="text-xs text-text-secondary">
                                    <span className="font-semibold text-white">Document reviewed:</span> Pitch_Deck_v3.
                                </p>
                            </div>
                        </div>
                        <button onClick={() => onNavigate('documents')} className="text-xs text-primary mt-4 text-left hover:underline">View all</button>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-glass-dark p-6 rounded-3xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col">
                    <h2 className="text-xl font-semibold mb-4 text-white">Quick Actions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-grow">
                        {/* Row 1 */}
                         <button onClick={() => onNavigate('documents')} className="bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 hover:border-primary/50 group">
                            <FolderOpen className="text-4xl mb-2 text-primary icon-glow group-hover:scale-110 transition-transform" style={{"--glow-color": "#00F5D4"} as React.CSSProperties} size={32} />
                            <span className="font-semibold text-sm text-white">Document Vault</span>
                            <span className="text-xs text-text-secondary">Access all project files</span>
                        </button>
                         <button onClick={() => onNavigate('idea-agent')} className="bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 hover:border-primary/50 group">
                            <LifeBuoy className="text-4xl mb-2 text-primary icon-glow group-hover:scale-110 transition-transform" style={{"--glow-color": "#00F5D4"} as React.CSSProperties} size={32} />
                            <span className="font-semibold text-sm text-white">Get Support</span>
                            <span className="text-xs text-text-secondary">Contact your AI Coach</span>
                        </button>
                         <button onClick={() => onNavigate('fund-matcher')} className="bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 hover:border-primary/50 group">
                            <Calculator className="text-4xl mb-2 text-primary icon-glow group-hover:scale-110 transition-transform" style={{"--glow-color": "#00F5D4"} as React.CSSProperties} size={32} />
                            <span className="font-semibold text-sm text-white">Budget & Finance</span>
                            <span className="text-xs text-text-secondary">Track your spending</span>
                        </button>
                        
                        {/* Row 2 (Previous Actions) */}
                        <button onClick={() => onNavigate('idea-agent')} className="bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 hover:border-primary/50 group">
                            <PlusCircle className="text-4xl mb-2 text-secondary icon-glow group-hover:scale-110 transition-transform" style={{"--glow-color": "#9B5DE5"} as React.CSSProperties} size={32} />
                            <span className="font-semibold text-sm text-white">New Project Idea</span>
                            <span className="text-xs text-text-secondary">Draft with AI</span>
                        </button>
                         <button onClick={() => onNavigate('fund-matcher')} className="bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 hover:border-primary/50 group">
                            <TrendingUp className="text-4xl mb-2 text-secondary icon-glow group-hover:scale-110 transition-transform" style={{"--glow-color": "#9B5DE5"} as React.CSSProperties} size={32} />
                            <span className="font-semibold text-sm text-white">Eligibility Check</span>
                            <span className="text-xs text-text-secondary">Find grants</span>
                        </button>
                         <button onClick={() => onNavigate('incorporation')} className="bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 hover:border-primary/50 group">
                            <Activity className="text-4xl mb-2 text-secondary icon-glow group-hover:scale-110 transition-transform" style={{"--glow-color": "#9B5DE5"} as React.CSSProperties} size={32} />
                            <span className="font-semibold text-sm text-white">Company Setup</span>
                            <span className="text-xs text-text-secondary">Track legal steps</span>
                        </button>

                        {/* New Button */}
                         <button onClick={() => onNavigate('incorporation')} className="bg-white/5 hover:bg-white/10 transition-all p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 hover:border-primary/50 group">
                            <ClipboardCheck className="text-4xl mb-2 text-primary icon-glow group-hover:scale-110 transition-transform" style={{"--glow-color": "#00F5D4"} as React.CSSProperties} size={32} />
                            <span className="font-semibold text-sm text-white">Registration Checklist</span>
                            <span className="text-xs text-text-secondary">Step-by-step guide</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Sidebar Column */}
            <div className="lg:col-span-1 grid grid-rows-2 gap-4">
                 <section className="bg-glass-dark p-6 rounded-3xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col">
                    <h2 className="text-xl font-semibold mb-4 text-white">Upcoming Schedule</h2>
                    <ul className="space-y-4 overflow-y-auto flex-grow pr-2">
                         <li className="flex items-start gap-4">
                            <div className="bg-primary text-background rounded-md w-10 h-10 flex-shrink-0 flex flex-col items-center justify-center ring-4 ring-surface shadow-glow-primary">
                                <span className="text-xs font-bold">DEC</span>
                                <span className="text-sm font-bold">21</span>
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-white">Grant Proposal Submission</p>
                                <p className="text-xs text-text-secondary">Innovate UK - R&D Fund</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="bg-surface rounded-md w-10 h-10 flex-shrink-0 flex flex-col items-center justify-center ring-4 ring-surface">
                                <span className="text-xs font-bold text-text-secondary">JAN</span>
                                <span className="text-sm font-bold text-white">05</span>
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-white">Pitch Deck Review</p>
                                <p className="text-xs text-text-secondary">Meeting with AI Coach</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="bg-surface rounded-md w-10 h-10 flex-shrink-0 flex flex-col items-center justify-center ring-4 ring-surface">
                                <span className="text-xs font-bold text-text-secondary">JAN</span>
                                <span className="text-sm font-bold text-white">12</span>
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-white">VC Introduction Call</p>
                                <p className="text-xs text-text-secondary">Intro with Future Ventures</p>
                            </div>
                        </li>
                    </ul>
                </section>

                <section className="bg-glass-dark p-6 rounded-3xl shadow-glass backdrop-blur-xl border border-white/10 flex flex-col">
                    <h2 className="text-xl font-semibold mb-4 text-white">Recent Activity</h2>
                    <ul className="space-y-4 overflow-y-auto flex-grow pr-2">
                        <li className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-secondary/20 rounded-md text-secondary">
                                <FolderOpen size={20} className="icon-glow" style={{"--glow-color": "#9B5DE5"} as React.CSSProperties} />
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-white">Document Update</p>
                                <p className="text-xs text-text-secondary">Business Plan v2.pdf uploaded.</p>
                                <p className="text-xs text-text-secondary/80 mt-1">2 hours ago</p>
                            </div>
                        </li>
                        <li className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-primary/20 rounded-md text-primary">
                                <ShieldCheck size={20} className="icon-glow" style={{"--glow-color": "#00F5D4"} as React.CSSProperties} />
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-white">Eligibility Check Alert</p>
                                <p className="text-xs text-text-secondary">New match: Innovate UK Fund.</p>
                                <p className="text-xs text-text-secondary/80 mt-1">11 hours ago</p>
                            </div>
                        </li>
                         <li className="flex items-start gap-4">
                            <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-[#fca311]/20 rounded-md text-[#fca311]">
                                <FileText size={20} style={{fontVariationSettings: "'FILL' 1", "--glow-color": "#fca311"} as React.CSSProperties} />
                            </div>
                            <div>
                                <p className="font-semibold text-sm text-white">Document Review</p>
                                <p className="text-xs text-text-secondary">Pitch_Deck_v3.pptx marked as final.</p>
                                <p className="text-xs text-text-secondary/80 mt-1">1 day ago</p>
                            </div>
                        </li>
                    </ul>
                </section>
            </div>
        </div>
    );
};

export default Dashboard;