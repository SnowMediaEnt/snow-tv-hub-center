import { memo, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Users, Sparkles, Smartphone } from 'lucide-react';
import { useTVFocus } from '@/hooks/useTVFocus';
import { BackButton } from '@/components/ui/BackButton';
import { BODY, HEADER, SCREEN } from '@/components/billing/shared';
import { focusAttrs, scaleIf, useFocusRecovery } from '@/components/billing/shared';
import { formatMoney, termLabel } from '@/lib/billing';
import type { SignupLink, SignupOffers } from '@/lib/signupLinks';
import { linkLabel } from '@/lib/signupLinks';

interface Props {
  offers: SignupOffers;
  onPick: (link: SignupLink) => void;
  onBack: () => void;
}

/**
 * The Vibez tiers, grouped by term. Prices come from public.signup_links and
 * are often NULL — the hosted page is the source of truth for what is actually
 * charged, so an unset price shows the tier without one rather than a number
 * the TV might have wrong.
 */
const VibezPlanGrid = memo(({ offers, onPick, onBack }: Props) => {
  const { containerRef, currentFocusId, focusById } = useTVFocus({
    initialFocusId: 'back',
    onBack,
    scrollBlock: 'center',
  });
  useFocusRecovery(containerRef, currentFocusId, focusById, 'back');

  // Land on the first real offer rather than the Back button.
  useEffect(() => {
    const first = offers.trial ? 'vp-trial' : offers.plans[0] ? `vp-${offers.plans[0].id}` : null;
    if (!first) return;
    const t = window.setTimeout(() => focusById(first), 40);
    return () => window.clearTimeout(t);
  }, [offers, focusById]);

  const groups = new Map<number, SignupLink[]>();
  for (const p of offers.plans) {
    const term = p.termMonths ?? 0;
    if (!groups.has(term)) groups.set(term, []);
    groups.get(term)!.push(p);
  }
  const ordered = Array.from(groups.entries()).sort((a, b) => (a[0] || 999) - (b[0] || 999));

  return (
    <div ref={containerRef} className={SCREEN}>
      <div className={HEADER}>
        <div className="flex items-center gap-3">
          <BackButton onClick={onBack} label="Back" data-player-header-btn="" focused={currentFocusId === 'back'} data-tv-focus-id="back" />
          <div>
            <h1 className="text-2xl font-quicksand font-bold text-white leading-tight">Get started with Vibez</h1>
            <p className="text-xs text-brand-ice/70 font-nunito flex items-center gap-1">
              <Smartphone className="w-3 h-3" /> You finish this on your phone — about 5 minutes
            </p>
          </div>
        </div>
      </div>

      <div className={BODY}>
        <div className="w-full max-w-5xl space-y-8 pb-10">
          {offers.trial && (
            <section>
              <h2 className="text-lg font-quicksand font-semibold text-brand-ice mb-3">Try it first</h2>
              <Card
                onClick={() => onPick(offers.trial!)}
                className={`tv-ring cursor-pointer rounded-2xl p-5 min-h-[6rem] bg-slate-900/70 border border-brand-gold/40 transition-transform duration-150 ease-out ${scaleIf(currentFocusId, 'vp-trial')}`}
                {...focusAttrs(currentFocusId, 'vp-trial')}
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-6 h-6 text-brand-gold shrink-0" />
                  <div>
                    <div className="text-xl font-quicksand font-bold text-white leading-tight">Free trial</div>
                    <div className="text-brand-ice/80 font-nunito text-sm">See how it runs before you pay.</div>
                  </div>
                </div>
              </Card>
            </section>
          )}

          {ordered.map(([term, plans]) => (
            <section key={term}>
              <h2 className="text-lg font-quicksand font-semibold text-brand-ice mb-3">{termLabel(term)}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {plans.map((p) => {
                  const id = `vp-${p.id}`;
                  return (
                    <Card
                      key={p.id}
                      onClick={() => onPick(p)}
                      className={`tv-ring cursor-pointer rounded-2xl p-5 min-h-[7rem] bg-slate-900/70 border border-white/10 transition-transform duration-150 ease-out ${scaleIf(currentFocusId, id)}`}
                      {...focusAttrs(currentFocusId, id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-lg font-quicksand font-bold text-white leading-tight">{linkLabel(p)}</div>
                          <div className="flex items-center gap-2 text-brand-ice/80 font-nunito text-sm mt-1">
                            <Users className="w-4 h-4" />
                            {p.connections ?? '—'} at once
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {p.price === null ? (
                            <div className="text-sm text-brand-ice/60 font-nunito">Price on<br />the next screen</div>
                          ) : (
                            <div className="text-2xl font-quicksand font-bold text-brand-gold">{formatMoney(p.price, p.currency)}</div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
});

VibezPlanGrid.displayName = 'VibezPlanGrid';
export default VibezPlanGrid;
