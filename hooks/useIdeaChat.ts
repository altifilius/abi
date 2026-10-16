import { useEffect, useRef, useState } from 'react';
import type { Language } from '../i18n';
import { api, errorMessage } from '../services/api';
import type { ChatMessage, Profile, Project } from '../types';
export function mergeProfileProposal(current: Profile, proposed: Profile): Profile {
  return {
    ...current,
    company: { ...current.company, ...proposed.company },
    project: { ...current.project, ...proposed.project },
    team: { ...current.team, ...proposed.team },
    extra: { ...current.extra, ...proposed.extra },
    budget: current.budget?.items.length ? current.budget : (proposed.budget ?? current.budget),
  };
}
export function useIdeaChat(
  project: Project,
  language: Language,
  onChange: () => Promise<void>,
  onUsage: () => void | Promise<void>,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [committedFailure, setCommittedFailure] = useState(false);
  const [historyUncertain, setHistoryUncertain] = useState(false);
  const [proposal, setProposal] = useState<{ profile: Profile; profile_revision: number } | null>(
    null,
  );
  const controller = useRef<AbortController | null>(null);
  const performing = useRef(false);
  const failedSubmission = useRef<{ text: string; previousIds: Set<string> } | null>(null);
  useEffect(() => {
    const active = new AbortController();
    controller.current = active;
    failedSubmission.current = null;
    setMessages([]);
    setInput('');
    setBusy(false);
    setError('');
    setProposal(null);
    setCommittedFailure(false);
    setHistoryUncertain(false);
    api<{ messages: ChatMessage[] }>(`/projects/${project.id}/messages`, { signal: active.signal })
      .then((data) => {
        if (!active.signal.aborted) setMessages(data.messages);
      })
      .catch((error) => {
        if (!active.signal.aborted) {
          setError(errorMessage(error));
          setHistoryUncertain(true);
        }
      });
    return () => active.abort();
  }, [project.id]);
  const refreshMessages = async () => {
    const active = controller.current;
    if (!active || active.signal.aborted) return;
    const data = await api<{ messages: ChatMessage[] }>(`/projects/${project.id}/messages`, {
      signal: active.signal,
    });
    if (!active.signal.aborted) {
      setMessages(data.messages);
      setHistoryUncertain(false);
      const failed = failedSubmission.current;
      if (
        failed &&
        data.messages.some(
          (message) =>
            message.role === 'user' &&
            message.text === failed.text &&
            !failed.previousIds.has(message.id),
        )
      ) {
        setInput('');
        setCommittedFailure(true);
      }
      failedSubmission.current = null;
    }
  };
  const perform = async (mode: 'chat' | 'write' | 'extract-profile') => {
    const active = controller.current;
    if (
      !active ||
      active.signal.aborted ||
      performing.current ||
      (mode === 'chat' && (!input.trim() || input.length > 12000 || historyUncertain))
    )
      return;
    performing.current = true;
    setBusy(true);
    setError('');
    setCommittedFailure(false);
    const submitted = input;
    const previousIds = new Set(messages.map((message) => message.id));
    try {
      if (mode === 'chat') {
        const data = await api<{ user_message: ChatMessage; message: ChatMessage }>(
          `/projects/${project.id}/chat`,
          { method: 'POST', json: { text: submitted, language }, signal: active.signal },
        );
        if (!active.signal.aborted) {
          setMessages((items) => [
            ...items.filter(
              (item) => item.id !== data.user_message.id && item.id !== data.message.id,
            ),
            data.user_message,
            data.message,
          ]);
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
      if (!active.signal.aborted) await onUsage();
    } catch (error) {
      if (!active.signal.aborted) {
        setError(errorMessage(error));
        if (mode === 'chat') failedSubmission.current = { text: submitted, previousIds };
        try {
          const data = await api<{ messages: ChatMessage[] }>(`/projects/${project.id}/messages`, {
            signal: active.signal,
          });
          if (!active.signal.aborted) {
            setMessages(data.messages);
            setHistoryUncertain(false);
            const committed =
              mode === 'chat' &&
              data.messages.some(
                (message) =>
                  message.role === 'user' &&
                  message.text === submitted &&
                  !previousIds.has(message.id),
              );
            if (committed) {
              setInput('');
              setCommittedFailure(true);
            }
            failedSubmission.current = null;
          }
        } catch {
          if (!active.signal.aborted) setHistoryUncertain(true);
        }
        try {
          await onChange();
          await onUsage();
        } catch {
          /* Keep the original operation error and local input. */
        }
      }
    } finally {
      performing.current = false;
      if (!active.signal.aborted) setBusy(false);
    }
  };
  return {
    messages,
    input,
    setInput,
    busy,
    error,
    proposal,
    setProposal,
    perform,
    committedFailure,
    historyUncertain,
    refreshMessages,
  };
}
