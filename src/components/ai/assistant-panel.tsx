"use client";

import { FormEvent } from "react";
import { Bot, Send } from "lucide-react";

import { Panel, ScrollBody, SectionHeader } from "@/components/shared/ui";
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
  return (
    <Panel tight className="flex min-h-[220px] max-h-[300px] flex-col self-start">
      <SectionHeader eyebrow="AI assistant" title="Ask the desk" action={<Bot className="size-5 text-cyan-200" />} />
      <ScrollBody className="flex-1 space-y-2">
        {messages.slice(-4).map((message, index) => (
          <div
            key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
            className={cn(
              "rounded-lg border p-2.5 text-sm leading-6",
              message.role === "assistant" ? "border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-50" : "border-white/10 bg-white/[0.06] text-white"
            )}
          >
            {message.content}
          </div>
        ))}
      </ScrollBody>
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(event) => onInput(event.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.06] px-3 text-sm text-white outline-none transition focus:border-cyan-300/50"
          placeholder="Analyze NVDA for me"
        />
        <button className="grid size-11 place-items-center rounded-lg bg-cyan-300 text-slate-950 transition hover:bg-cyan-200">
          <Send className="size-4" />
        </button>
      </form>
    </Panel>
  );
}
