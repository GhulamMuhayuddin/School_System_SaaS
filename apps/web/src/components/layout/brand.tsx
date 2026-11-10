import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/cn';

export function Brand({ compact = false, inverted = false }: { compact?: boolean; inverted?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-control', inverted ? 'bg-white text-navy-900' : 'bg-brand-600 text-white')}>
        <GraduationCap className="size-5" aria-hidden />
      </div>
      {!compact && (
        <span className={cn('text-base font-extrabold tracking-tight', inverted ? 'text-white' : 'text-navy-900')}>
          Nexora <span className={inverted ? 'font-semibold text-brand-200' : 'font-semibold text-brand-600'}>School ERP</span>
        </span>
      )}
    </div>
  );
}
