"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, localId, streamApi } from "../_lib/api";
import type { ChatMessage, Stats, StreamEvent } from "../_lib/types";

type Options = {
  avatarId: string | null;
  conversationId: string | null;
  /** Called when the server creates a conversation for the first message. */
  onConversationCreated: (id: string) => void;
  /** Called after every reply finishes (to refresh the sidebar, etc). */
  onReplyFinished: () => void;
};

export function useChat({ avatarId, conversationId, onConversationCreated, onReplyFinished }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveModel, setLiveModel] = useState<{ model: string; worker: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // When a new conversation gets its id mid-stream, don't reload it from the server.
  const skipLoadRef = useRef<string | null>(null);
  const latest = useRef({ avatarId, conversationId, onConversationCreated, onReplyFinished });
  useEffect(() => {
    latest.current = { avatarId, conversationId, onConversationCreated, onReplyFinished };
  });

  // Load history whenever the selected conversation changes.
  useEffect(() => {
    if (conversationId && skipLoadRef.current === conversationId) {
      skipLoadRef.current = null;
      return;
    }
    abortRef.current?.abort();
    setLoadError(null);
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api<ChatMessage[]>(`/conversations/${conversationId}/messages`)
      .then((ms) => !cancelled && setMessages(ms))
      .catch((e: Error) => !cancelled && setLoadError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [conversationId, avatarId]);

  const patch = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(async (text: string, think: boolean) => {
    const content = text.trim();
    const { avatarId: aid, conversationId: cid } = latest.current;
    if (!content || !aid || abortRef.current) return;

    const assistantId = localId();
    setMessages((ms) => [
      ...ms,
      { id: localId(), role: "user", content },
      { id: assistantId, role: "assistant", content: "", thinking: "" },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);

    const onEvent = (ev: StreamEvent) => {
      switch (ev.type) {
        case "conversation":
          if (!cid) {
            skipLoadRef.current = ev.id;
            latest.current.onConversationCreated(ev.id);
          }
          break;
        case "meta":
          setLiveModel({ model: ev.model, worker: ev.worker });
          break;
        case "thinking":
          patch(assistantId, (m) => ({ ...m, thinking: (m.thinking ?? "") + ev.text }));
          break;
        case "delta":
          patch(assistantId, (m) => ({ ...m, content: m.content + ev.text }));
          break;
        case "done":
          patch(assistantId, (m) => ({ ...m, stats: ev.stats ?? null }));
          break;
        case "error":
          throw new Error(ev.message);
      }
    };

    try {
      await streamApi("/chat", { avatar_id: aid, conversation_id: cid, message: content, think }, onEvent, controller.signal);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      patch(assistantId, (m) => {
        if (aborted) {
          const stopped: Stats = { ...(m.stats ?? {}), stopped: true };
          return m.content || m.thinking ? { ...m, stats: stopped } : { ...m, content: "(stopped)", error: true };
        }
        const msg = (err as Error).message;
        return { ...m, error: true, content: m.content ? `${m.content}\n\n⚠ ${msg}` : `⚠ ${msg}` };
      });
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
      latest.current.onReplyFinished();
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, send, stop, isStreaming, loading, loadError, liveModel };
}
