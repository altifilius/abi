import React, { useState, useEffect, useRef } from 'react';
import { Send, User, Sparkles, FileText, Cpu } from 'lucide-react';
import { sendIdeaChat, generateIdeaSummary } from '../services/api';
import { ChatMessage } from '../types';
import { ABI_AVATAR_URL } from '../constants';
import { useI18n } from '../i18n';

interface IdeaAgentProps {
  onProjectCreate: (desc: string) => void;
}

const IdeaAgent: React.FC<IdeaAgentProps> = ({ onProjectCreate }) => {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: t('ideaAgent.welcome'),
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error && error.message) return error.message;
    return t('common.genericError');
  };

  const handleSend = async () => {
    if (!inputText.trim()) {
      setActionError(t('ideaAgent.error.emptyMessage'));
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: Date.now()
    };

    const history = [...messages, userMsg];

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);
    setActionError(null);

    try {
      const responseText = await sendIdeaChat(history);
      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("Chat Error", error);
      setActionError(getErrorMessage(error));
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (isGeneratingSummary) return;
    if (messages.length <= 1) {
      setActionError(t('ideaAgent.error.needConversation'));
      return;
    }

    setActionError(null);
    setIsTyping(true);
    setIsGeneratingSummary(true);

    try {
      const summary = await generateIdeaSummary(messages);
      
      const summaryMsg: ChatMessage = {
          id: 'summary',
          role: 'model',
          text: `${t('ideaAgent.summaryIntro')}\n\n${summary}`,
          timestamp: Date.now()
      };
      setMessages(prev => [...prev, summaryMsg]);
      onProjectCreate(summary);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsTyping(false);
      setIsGeneratingSummary(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-glass-dark rounded-3xl shadow-glass border border-white/10 overflow-hidden backdrop-blur-xl">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-3">
           <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shadow-glow-primary overflow-hidden">
                <img src={ABI_AVATAR_URL} alt="Abi" className="w-full h-full object-cover" />
           </div>
           <div>
               <h3 className="text-white font-semibold">{t('ideaAgent.headerTitle')}</h3>
               <p className="text-xs text-text-secondary">{t('ideaAgent.headerSubtitle')}</p>
           </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 border overflow-hidden ${
              msg.role === 'model' 
                ? 'bg-surface text-primary border-primary/30 shadow-glow-primary' 
                : 'bg-secondary/20 text-secondary border-secondary/30'
            }`}>
              {msg.role === 'model' ? (
                <img src={ABI_AVATAR_URL} alt="Abi" className="w-full h-full object-cover" />
              ) : (
                <User size={20} />
              )}
            </div>
            
            <div className={`max-w-[80%] p-5 rounded-3xl text-sm leading-relaxed whitespace-pre-wrap backdrop-blur-md shadow-lg ${
              msg.role === 'model' 
                ? 'bg-white/5 border border-white/10 text-white rounded-tl-none' 
                : 'bg-gradient-to-br from-primary/80 to-blue-600/80 text-white border border-white/20 rounded-tr-none'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {isTyping && (
           <div className="flex items-center gap-2 text-primary text-xs ml-16 animate-pulse">
             <Sparkles size={14} /> {t('ideaAgent.isThinking')}
           </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 bg-glass-dark border-t border-white/10">
        {messages.length > 3 && (
            <div className="mb-4 flex justify-center">
                 <button 
                  onClick={handleGenerateSummary}
                  disabled={isTyping || isGeneratingSummary}
                  className="flex items-center gap-2 bg-secondary/20 hover:bg-secondary/30 text-secondary px-6 py-2 rounded-full text-xs font-semibold transition-all border border-secondary/50 shadow-glow-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isGeneratingSummary ? <Cpu size={14} className="animate-spin" /> : <FileText size={14} />}
                    {isGeneratingSummary ? t('ideaAgent.generatingSummary') : t('ideaAgent.generateOnePager')}
                </button>
            </div>
        )}
        {actionError && (
          <div className="mb-3 text-sm text-red-200 bg-red-500/10 border border-red-500/30 px-4 py-3 rounded-2xl">
            {actionError}
          </div>
        )}
        <div className="relative flex items-center gap-3">
          <input
            type="text"
            className="flex-1 bg-white/5 text-white placeholder-text-secondary/50 px-6 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 border border-white/10 transition-all"
            placeholder={t('ideaAgent.placeholder')}
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
              if (actionError) setActionError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isTyping || isGeneratingSummary}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isTyping || isGeneratingSummary}
            className="p-4 bg-primary text-background rounded-2xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow-primary"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default IdeaAgent;
