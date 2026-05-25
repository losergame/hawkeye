"use client";

import { FormEvent, useEffect, useRef } from "react";
import { Bot, Send, User } from "lucide-react";

import { Panel, SectionHeader } from "@/components/shared/ui";
import { cn } from "@/lib/cn";
import type { ChatMessage } from "@/lib/types";

export function AssistantPanel({
  input,
  messages,
  onInput,
  onSubmit
}: {
  input: string;
  messages: ChatMessage[];
  onInput: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <Panel tight className="flex min-h-[560px] max-h-[760px] flex-col self-start">
      <SectionHeader eyebrow="AI assistant" title="Ask the desk" action={<Bot className="size-5 text-cyan-200" />} />
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-3">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}-${message.content.slice(0, 12)}`}>
            <div className={cn("mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em]", message.role === "assistant" ? "text-cyan-300/60" : "text-slate-500")}>
              {message.role === "assistant" ? <Bot className="size-3" /> : <User className="size-3" />}
              {message.role === "assistant" ? "Hawkeye AI" : "You"}
            </div>
            <div
              className={cn(
                "rounded-lg border p-3 text-sm leading-6",
                message.role === "assistant"
                  ? "border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-50"
                  : "border-white/10 bg-white/[0.06] text-white"
              )}
            >
              {message.content}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(event) => onInput(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none transition focus:border-cyan-300/50 focus:bg-white/[0.08]"
          placeholder="Analyze NVDA, ask for picks…"
        />
        <button
          type="submit"
          className="grid size-11 shrink-0 place-items-center rounded-lg bg-cyan-300 text-slate-950 transition hover:bg-cyan-200"
        >
          <Send className="size-4" />
        </button>
      </form>
    </Panel>
  );
}
