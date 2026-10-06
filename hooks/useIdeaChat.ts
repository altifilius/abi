import { useCallback, useEffect, useRef, useState } from 'react';
import { generateIdeaSummary, sendIdeaChat, streamIdeaChat } from '../services/api';
import type { ChatMessage } from '../types';

interface UseIdeaChatOptions {
  welcomeMessage: string;
  genericErrorMessage: string;
  emptyMessageError: string;
  needConversationError: string;
  summaryIntro: string;
  language?: string;
  projectTitle?: string;
  projectDescription?: string;
  onProjectCreate: (desc: string) => void;
}

export function useIdeaChat(options: UseIdeaChatOptions) {
  const {
    welcomeMessage,
    genericErrorMessage,
    emptyMessageError,
    needConversationError,
    summaryIntro,
    language,
    projectTitle,
    projectDescription,
    onProjectCreate,
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: welcomeMessage,
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<ChatMessage[] | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const getErrorMessage = useCallback(
    (error: unknown) => {
      if (error instanceof Error && error.message) return error.message;
      return genericErrorMessage;
    },
    [genericErrorMessage],
  );

  const projectContext =
    [projectTitle, projectDescription].filter(Boolean).join(' - ') || undefined;

  const updateMessageText = useCallback((id: string, text: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text } : m)));
  }, []);

  const removeMessageById = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const runChatWithHistory = useCallback(
    async (history: ChatMessage[]) => {
      const placeholderId = `model-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: placeholderId,
          role: 'model',
          text: '',
          timestamp: Date.now(),
        },
      ]);
      try {
        await streamIdeaChat(history, { language, projectContext }, (partial) =>
          updateMessageText(placeholderId, partial),
        );
      } catch {
        // Fallback to non-streaming
        try {
          const responseText = await sendIdeaChat(history, { language, projectContext });
          updateMessageText(placeholderId, responseText);
        } catch (error) {
          removeMessageById(placeholderId);
          throw error;
        }
      }
    },
    [language, projectContext, removeMessageById, updateMessageText],
  );

  const handleSend = useCallback(async () => {
    if (!inputText.trim()) {
      setActionError(emptyMessageError);
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputText,
      timestamp: Date.now(),
    };

    const history = [...messages, userMsg];
    setMessages((prev) => [...prev, userMsg]);
    setLastPayload(history);
    setInputText('');
    setIsTyping(true);
    setActionError(null);

    try {
      await runChatWithHistory(history);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsTyping(false);
    }
  }, [emptyMessageError, getErrorMessage, inputText, messages, runChatWithHistory]);

  const handleRetry = useCallback(async () => {
    if (!lastPayload) return;
    setActionError(null);
    setIsTyping(true);
    try {
      await runChatWithHistory(lastPayload);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setIsTyping(false);
    }
  }, [getErrorMessage, lastPayload, runChatWithHistory]);

  const handleGenerateSummary = useCallback(async () => {
    if (isGeneratingSummary) return;
    if (messages.length <= 1) {
      setActionError(needConversationError);
      return;
    }

    setActionError(null);
    setIsTyping(true);
    setIsGeneratingSummary(true);

    try {
      const summary = await generateIdeaSummary(messages, { language, projectContext });
      const summaryMsg: ChatMessage = {
        id: 'summary',
        role: 'model',
        text: `${summaryIntro}\n\n${summary}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, summaryMsg]);
      onProjectCreate(summary);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setIsTyping(false);
      setIsGeneratingSummary(false);
    }
  }, [
    isGeneratingSummary,
    messages,
    needConversationError,
    language,
    projectContext,
    summaryIntro,
    onProjectCreate,
    getErrorMessage,
  ]);

  return {
    messages,
    inputText,
    setInputText,
    isTyping,
    isGeneratingSummary,
    actionError,
    setActionError,
    lastPayload,
    chatEndRef,
    handleSend,
    handleRetry,
    handleGenerateSummary,
  };
}
