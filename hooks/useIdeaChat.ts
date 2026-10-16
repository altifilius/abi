import { useEffect, useRef, useState } from 'react';
import type { Language } from '../i18n';
import { api, errorMessage } from '../services/api';
import type { ChatMessage, Profile, Project } from '../types';
export function useIdeaChat(
  project: Project,
  language: Language,
  onChange: () => Promise<void>,
  onUsage: () => void,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<{ profile: Profile; profile_revision: number } | null>(
    null,
  );
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    setMessages([]);
    setInput('');
    setBusy(false);
    setError('');
    setProposal(null);
    api<{ messages: ChatMessage[] }>(`/projects/${project.id}/messages`, { signal: active.signal })
      .then((data) => {
        if (!active.signal.aborted) setMessages(data.messages);
      })
      .catch((error) => {
        if (!active.signal.aborted) setError(errorMessage(error));
      });
    return () => active.abort();
  }, [project.id]);
  const perform = async (mode: 'chat' | 'write' | 'extract-profile') => {
    const active = controller.current;
    if (!active || active.signal.aborted || busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'chat') {
        if (!input.trim()) return;
        const data = await api<{ user_message: ChatMessage; message: ChatMessage }>(
          `/projects/${project.id}/chat`,
          { method: 'POST', json: { text: input, language }, signal: active.signal },
        );
        if (!active.signal.aborted) {
          setMessages((items) => [...items, data.user_message, data.message]);
          setInput('');
        }
      } else if (mode === 'write') {
        await api(`/projects/${project.id}/write`, {
          method: 'POST',
          json: {
            language,
            instruction:
              language === 'tr'
                ? 'Proje açıklamasını mevcut profil ve konuşmadan yaz. Bilinmeyenleri uydurma.'
                : 'Write a project description from the profile and conversation. Do not invent unknown facts.',
          },
          signal: active.signal,
        });
        if (!active.signal.aborted) await onChange();
      } else {
        const data = await api<{ profile: Profile; profile_revision: number }>(
          `/projects/${project.id}/extract-profile`,
          { method: 'POST', json: { language }, signal: active.signal },
        );
        if (!active.signal.aborted) setProposal(data);
      }
      if (!active.signal.aborted) onUsage();
    } catch (error) {
      if (!active.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  };
  return { messages, input, setInput, busy, error, proposal, setProposal, perform };
}
