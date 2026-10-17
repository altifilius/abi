import { useEffect, useRef, useState } from 'react';
import type { Language } from '../i18n';
import { api, errorMessage } from '../services/api';
import type { ChatMessage, Project } from '../types';

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
    setCommittedFailure(false);
    setHistoryUncertain(false);
    api<{ messages: ChatMessage[] }>(`/projects/${project.id}/messages`, { signal: active.signal })
      .then((data) => {
        if (!active.signal.aborted) setMessages(data.messages);
      })
      .catch((reason) => {
        if (!active.signal.aborted) {
          setError(errorMessage(reason));
          setHistoryUncertain(true);
        }
      });
    return () => active.abort();
  }, [project.id]);
  const refreshMessages = async () => {
    const active = controller.current;
    if (!active || active.signal.aborted) return;
    try {
      const data = await api<{ messages: ChatMessage[] }>(`/projects/${project.id}/messages`, {
        signal: active.signal,
      });
      if (active.signal.aborted) return;
      setMessages(data.messages);
      setHistoryUncertain(false);
      setError('');
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
    } catch (reason) {
      if (!active.signal.aborted) {
        setError(errorMessage(reason));
        setHistoryUncertain(true);
      }
    }
  };
  const perform = async () => {
    const active = controller.current;
    if (
      !active ||
      active.signal.aborted ||
      performing.current ||
      !input.trim() ||
      input.length > 12000 ||
      historyUncertain
    )
      return;
    performing.current = true;
    setBusy(true);
    setError('');
    setCommittedFailure(false);
    const submitted = input;
    const previousIds = new Set(messages.map((message) => message.id));
    try {
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
        await onUsage();
      }
    } catch (reason) {
      if (!active.signal.aborted) {
        setError(errorMessage(reason));
        failedSubmission.current = { text: submitted, previousIds };
        try {
          const data = await api<{ messages: ChatMessage[] }>(`/projects/${project.id}/messages`, {
            signal: active.signal,
          });
          if (!active.signal.aborted) {
            setMessages(data.messages);
            setHistoryUncertain(false);
            if (
              data.messages.some(
                (message) =>
                  message.role === 'user' &&
                  message.text === submitted &&
                  !previousIds.has(message.id),
              )
            ) {
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
          /* Preserve the original operation failure and local input. */
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
    perform,
    committedFailure,
    historyUncertain,
    refreshMessages,
  };
}
