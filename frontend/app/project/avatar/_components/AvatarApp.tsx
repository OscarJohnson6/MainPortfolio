"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api } from "../_lib/api";
import { DEFAULT_GLOBAL_SETTINGS, type Avatar, type Conversation, type GlobalSettings, type Status } from "../_lib/types";
import AvatarEditor from "./AvatarEditor";
import ChatPanel from "./ChatPanel";
import SettingsPanel from "./SettingsPanel";
import Sidebar from "./Sidebar";

type Mode = "chat" | "create" | "edit" | "settings";
const LAST_AVATAR_KEY = "avatar-lab:last-avatar";

function readLastAvatar(): string | null {
  try {
    return localStorage.getItem(LAST_AVATAR_KEY);
  } catch {
    return null;
  }
}

export default function AvatarApp() {
  const [avatars, setAvatars] = useState<Avatar[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("chat");
  const [status, setStatus] = useState<Status | null>(null);
  const [globalSettings, setGlobalSettings] = useState<GlobalSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const selected = avatars?.find((a) => a.id === selectedId) ?? null;

  // Initial load: avatars + worker status.
  useEffect(() => {
    api<Avatar[]>("/avatars")
      .then((list) => {
        setAvatars(list);
        const last = readLastAvatar();
        setSelectedId(list.find((a) => a.id === last)?.id ?? list[0]?.id ?? null);
        if (list.length === 0) setMode("create");
      })
      .catch((e: Error) => setError(e.message));
    api<Status>("/status")
      .then(setStatus)
      .catch(() => setStatus({ online: false }));
    api<GlobalSettings>("/settings")
      .then(setGlobalSettings)
      .catch(() => {});
  }, []);

  const refreshConversations = useCallback(() => {
    if (!selectedId) return;
    api<Conversation[]>(`/avatars/${selectedId}/conversations`)
      .then(setConversations)
      .catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    setConversations([]);
    refreshConversations();
    try {
      if (selectedId) localStorage.setItem(LAST_AVATAR_KEY, selectedId);
    } catch {
      /* storage unavailable: fine */
    }
  }, [selectedId, refreshConversations]);

  function selectAvatar(id: string) {
    setSelectedId(id);
    setConversationId(null);
    setMode("chat");
    setSidebarOpen(false);
  }

  function selectConversation(id: string) {
    setConversationId(id);
    setMode("chat");
    setSidebarOpen(false);
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this conversation?")) return;
    try {
      await api(`/conversations/${id}`, { method: "DELETE" });
      if (id === conversationId) setConversationId(null);
      refreshConversations();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function onSaved(avatar: Avatar) {
    setAvatars((list) => {
      const rest = (list ?? []).filter((a) => a.id !== avatar.id);
      return mode === "create" ? [...rest, avatar] : (list ?? []).map((a) => (a.id === avatar.id ? avatar : a));
    });
    if (mode === "create") {
      setSelectedId(avatar.id);
      setConversationId(null);
    }
    setMode("chat");
  }

  function onDeleted(id: string) {
    const rest = (avatars ?? []).filter((a) => a.id !== id);
    setAvatars(rest);
    setSelectedId(rest[0]?.id ?? null);
    setConversationId(null);
    setMode(rest.length ? "chat" : "create");
  }

  let main: ReactNode;
  if (error && !avatars) {
    main = <Centered className="text-rose-400">{error}</Centered>;
  } else if (!avatars) {
    main = <Centered>Loading…</Centered>;
  } else if (mode === "settings") {
    main = (
      <SettingsPanel
        settings={globalSettings ?? DEFAULT_GLOBAL_SETTINGS}
        status={status}
        onSaved={(s) => {
          setGlobalSettings(s);
          setMode("chat");
        }}
        onClose={() => setMode(avatars.length ? "chat" : "create")}
      />
    );
  } else if (mode === "create" || (mode === "edit" && selected)) {
    main = (
      <AvatarEditor
        key={mode === "edit" ? selected?.id : "new"}
        avatar={mode === "edit" ? (selected ?? undefined) : undefined}
        onSaved={onSaved}
        onDeleted={onDeleted}
        onCancel={() => setMode(avatars.length ? "chat" : "create")}
      />
    );
  } else if (selected) {
    main = (
      <ChatPanel
        key={selected.id}
        avatar={selected}
        conversationId={conversationId}
        status={status}
        globalSettings={globalSettings}
        onConversationCreated={(id) => {
          setConversationId(id);
          refreshConversations();
        }}
        onReplyFinished={refreshConversations}
        onNewChat={() => setConversationId(null)}
        onEdit={() => setMode("edit")}
        onOpenSidebar={() => setSidebarOpen(true)}
        onOpenSettings={() => setMode("settings")}
      />
    );
  } else {
    main = <Centered>Create an avatar to get started.</Centered>;
  }

  const sidebar = (
    <Sidebar
      avatars={avatars ?? []}
      selectedId={mode === "create" || mode === "settings" ? null : selectedId}
      conversations={conversations}
      conversationId={conversationId}
      onSelectAvatar={selectAvatar}
      onSelectConversation={selectConversation}
      onDeleteConversation={deleteConversation}
      onCreate={() => {
        setMode("create");
        setSidebarOpen(false);
      }}
      onOpenSettings={() => {
        setMode("settings");
        setSidebarOpen(false);
      }}
      settingsActive={mode === "settings"}
    />
  );

  return (
    // Sits inside the portfolio's page width, filling the screen below the site header.
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="relative flex h-[calc(100dvh-13rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-xl">
        <aside className="hidden w-60 shrink-0 border-r border-zinc-800 md:block">{sidebar}</aside>

        {/* Mobile: sidebar slides over the chat */}
        {sidebarOpen && (
          <div className="absolute inset-0 z-10 flex md:hidden">
            <aside className="w-64 border-r border-zinc-800 bg-zinc-950">{sidebar}</aside>
            <button className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} aria-label="Close avatar list" />
          </div>
        )}

        {main}
      </div>
    </div>
  );
}

function Centered({ children, className = "text-zinc-500" }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-1 items-center justify-center p-6 text-center text-sm ${className}`}>{children}</div>;
}
