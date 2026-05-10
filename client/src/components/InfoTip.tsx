import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

export default function InfoTip({ text, wide }: { text: string; wide?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center ml-1 cursor-help">
          <Info size={11} className="text-zinc-600 hover:text-cyan-400 transition-colors" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className={`${wide ? "max-w-sm" : "max-w-xs"} bg-zinc-900 border border-cyan-500/30 text-[10px] text-zinc-300 font-mono leading-relaxed px-3 py-2 shadow-lg shadow-cyan-500/5`}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
