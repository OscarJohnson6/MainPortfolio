"use client";

import type { Avatar, Conversation } from "../_lib/types";
import AvatarIcon from "./AvatarIcon";

type Props = {
  avatars: Avatar[];
  selectedId: string | null;
  conversations: Conversation[];
  conversationId: string | null;
  onSelectAvatar: (id: string) => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onCreate: () => void;
  onOpenSettings: () => void;
  settingsActive: boolean;
};

export default function Sidebar({
  avatars,
  selectedId,
  conversations,
  conversationId,
  onSelectAvatar,
  onSelectConversation,
  onDeleteConversation,
  onCreate,
  onOpenSettings,
  settingsActive,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button
          onClick={onCreate}
          className="w-full rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900"
        >
          + New avatar
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {avatars.length === 0 && <p className="px-2 py-4 text-xs text-zinc-500">No avatars yet. Create one to get started.</p>}
        {avatars.map((a) => {
          const selected = a.id === selectedId;
          return (
            <div key={a.id} className="mb-1">
              <button
                onClick={() => onSelectAvatar(a.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition ${
                  selected ? "bg-zinc-800/80" : "hover:bg-zinc-900"
                }`}
              >
                <AvatarIcon name={a.name} emoji={a.emoji} color={a.color} size="sm" />
                <span className="truncate text-sm">{a.name}</span>
              </button>

              {selected && conversations.length > 0 && (
                <ul className="mt-1 ml-5 border-l border-zinc-800 pl-2">
                  {conversations.map((c) => (
                    <li key={c.id} className="group flex items-center">
                      <button
                        onClick={() => onSelectConversation(c.id)}
                        title={c.title}
                        className={`min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-xs transition ${
                          c.id === conversationId ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                        }`}
                      >
                        {c.title}
                      </button>
                      <button
                        onClick={() => onDeleteConversation(c.id)}
                        className="px-1.5 text-xs text-zinc-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
                        aria-label={`Delete conversation ${c.title}`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-zinc-800 p-2">
        <button
          onClick={onOpenSettings}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
            settingsActive ? "bg-zinc-800/80 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          }`}
        >
          <span aria-hidden>⚙</span> Settings
        </button>
      </div>
    </div>
  );
}
