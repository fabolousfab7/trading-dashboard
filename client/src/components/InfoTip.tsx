import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Info } from "lucide-react"

export default function InfoTip({ text, wide }: { text: string; wide?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center ml-1 cursor-help">
          <Info size={11} className="text-[--ink3] hover:text-[--at-accent] transition-colors" />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className={`${wide ? "max-w-sm" : "max-w-xs"} bg-[--at-surface] border border-[--rule] text-[10px] text-[--ink2] font-serif leading-relaxed px-3 py-2 shadow-sm`}
      >
        {text}
      </TooltipContent>
    </Tooltip>
  )
}
