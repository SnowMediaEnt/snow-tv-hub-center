import { Loader2 } from 'lucide-react';

export const Spinner = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 text-brand-ice/90 font-nunito">
    <Loader2 className="w-6 h-6 animate-spin text-brand-gold" />
    <span>{label}</span>
  </div>
);

export const RateLimitNote = ({ secondsLeft }: { secondsLeft: number }) =>
  secondsLeft > 0 ? (
    <p className="text-amber-200 text-sm font-nunito">Too many attempts. Please wait {secondsLeft}s.</p>
  ) : null;
