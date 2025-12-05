import React, { useState, useEffect, useRef } from 'react';
import { Send, Bot, User, Sparkles, FileText, Cpu } from 'lucide-react';
import { createChatSession, generateDraftOnePager } from '../services/geminiService';
import { ChatMessage } from '../types';
import { ABI_AVATAR_URL } from '../constants';

interface IdeaAgentProps {
  onProjectCreate: (desc: string) => void;
}

const IdeaAgent: React.FC<IdeaAgentProps> = ({ onProjectCreate }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hello! I am Abi, your AI Grant Consultant. Tell me about your project idea. What innovation are you planning to develop?',
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [chatSession, setChatSession] = useState<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sess = createChatSession();
    setChatSession(sess);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || !chatSession) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      // Fixed: Use correct object parameter and property access for new GenAI SDK
      const result = await chatSession.sendMessage({ message: userMsg.text });
      const responseText = result.text;

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, modelMsg]);
    } catch (error) {
      console.error("Chat Error", error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateSummary = async () => {
    setIsTyping(true);
    const historyText = messages.map(m => `${m.role}: ${m.text}`).join('\n');
    const summary = await generateDraftOnePager(historyText);
    
    const summaryMsg: ChatMessage = {
        id: 'summary',
        role: 'model',
        text: `Here is a draft summary of your project based on our chat:\n\n${summary}`,
        timestamp: Date.now()
    };
    setMessages(prev => [...prev, summaryMsg]);
    setIsTyping(false);
    
    onProjectCreate(summary);
  };

  return (
    <div className="flex flex-col h-full bg-glass-dark rounded-3xl shadow-glass border border-white/10 overflow-hidden backdrop-blur-xl">
      {/* Header */}
      <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-3">
           <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary shadow-glow-primary overflow-hidden">
                <img src={ABI_AVATAR_URL} alt="Abi" className="w-full h-full object-cover" />
           </div>
           <div>
               <h3 className="text-white font-semibold">Abi - Project Coach</h3>
               <p className="text-xs text-text-secondary">AI-assisted brainstorming</p>
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
             <Sparkles size={14} /> Abi is thinking...
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
                  className="flex items-center gap-2 bg-secondary/20 hover:bg-secondary/30 text-secondary px-6 py-2 rounded-full text-xs font-semibold transition-all border border-secondary/50 shadow-glow-secondary"
                >
                    <FileText size={14} />
                    Generate Project 1-Pager
                </button>
            </div>
        )}
        <div className="relative flex items-center gap-3">
          <input
            type="text"
            className="flex-1 bg-white/5 text-white placeholder-text-secondary/50 px-6 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 border border-white/10 transition-all"
            placeholder="Describe your innovation..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            disabled={isTyping}
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isTyping}
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