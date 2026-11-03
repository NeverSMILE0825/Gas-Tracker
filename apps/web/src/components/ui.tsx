'use client'

import * as Tooltip from '@radix-ui/react-tooltip'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

const button = cva('btn', {
  variants: {
    variant: { ghost: '', solid: 'btn-solid' },
  },
  defaultVariants: { variant: 'ghost' },
})

export function Button({ className, variant, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant }), className)} {...props} />
}

export function Tip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="max-w-xs rounded-xl border border-white/10 bg-[#0d1324] px-3 py-2 text-xs leading-5 text-ink shadow-glow">
          {text}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function ClassTag({ value }: { value: string }) {
  const kind = value.startsWith('PROTOCOL') ? 'exact' : value.startsWith('OBSERVED') ? 'observed' : value.startsWith('INFERRED') ? 'inferred' : value.startsWith('MODELLED') ? 'model' : 'unknown'
  return <span className={`tag ${kind}`}>{value}</span>
}
