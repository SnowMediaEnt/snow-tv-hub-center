import { memo, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Users, Sparkles, Smartphone } from 'lucide-react';
import { useTVFocus, type TVFocusNavigationMap } from '@/hooks/useTVFocus';
import { BackButton } from '@/components/ui/BackButton';
import { BODY, HEADER, SCREEN } from '@/components/billing/shared';
import { focusAttrs, scaleIf, useFocusRecovery } from '@/components/billing/shared';
import { formatMoney } from '@/lib/billing';
import type { SignupLink, SignupOffers } from '@/lib/signupLinks';
import { connectionsText, termText } from '@/lib/signupLinks';

interface Props {
  offers: SignupOffers;
  onPick: (link: SignupLink) => void;
  onBack: () => void;
}

/** A price of 0 is an offer, not an amount — say so rather than printing $0.00. */
const priceText = (l: SignupLink): string | null => {
  if (l.price === null) return null;
  return l.price === 0 ? 'Free' : formatMoney(l.price, l.currency);
};

/**
 * The Vibez tiers, flat and in the panel's own order.
 *
 * Deliberately not grouped by term: the panel currently sells one option per
 * term, so headings would be one card each. Rows come from
 * public.signup_links, which is also where prices live — and an unset price
 * shows the tier without one rather than a number the TV might have wrong,
 * since the hosted page is what actually charges.
 */
const VibezPlanGrid = memo(({ offers, onPick, onBack }: Props) => {
  // The trial sits in its own full-width card ABOVE the plan grid, so pure
  // spatial navigation could walk down out of it and never find a way back —
  // the card is wider than any grid cell, so nothing below scores it as the
  // best target upward. These few explicit links fix that; everything else
  // still falls through to spatial search.
  const navigation = useMemo<TVFocusNavigationMap>(() => {
    const map: TVFocusNavigationMap = {};
    const firstRow = offers.plans.slice(0, 3).map((p) => `vp-${p.id}`);
    const trialId = offers.trial ? 'vp-trial' : null;
    if (trialId) map[trialId] = { up: 'back', down: firstRow[0] };
    for (const id of firstRow) map[id] = { up: trialId ?? 'back' };
    map.back = { down: trialId ?? firstRow[0] };
    return map;
  }, [offers]);

  const { containerRef, currentFocusId, focusById } = useTVFocus({
    navigation,
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
        <div className="w-full max-w-5xl space-y-6 pb-10">
          {offers.trial && (
            <Card
              onClick={() => onPick(offers.trial!)}
              className={`tv-ring cursor-pointer rounded-2xl p-6 min-h-[7rem] bg-slate-900/70 border border-brand-gold/50 transition-transform duration-150 ease-out ${scaleIf(currentFocusId, 'vp-trial')}`}
              {...focusAttrs(currentFocusId, 'vp-trial')}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Sparkles className="w-7 h-7 text-brand-gold shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xl font-quicksand font-bold text-white leading-tight">Trial</div>
                    <div className="text-brand-ice/80 font-nunito text-sm">
                      {[offers.trial.label, 'no card needed'].filter(Boolean).join(' · ')}
                      {offers.trial.connections ? ` · ${connectionsText(offers.trial.connections)}` : ''}
                    </div>
                  </div>
                </div>
                <div className="text-2xl font-quicksand font-bold text-brand-gold shrink-0">
                  {priceText(offers.trial) ?? 'Free'}
                </div>
              </div>
            </Card>
          )}

          {offers.plans.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {offers.plans.map((p) => {
                const id = `vp-${p.id}`;
                const price = priceText(p);
                return (
                  <Card
                    key={p.id}
                    onClick={() => onPick(p)}
                    className={`tv-ring cursor-pointer rounded-2xl p-5 min-h-[8rem] bg-slate-900/70 border border-white/10 transition-transform duration-150 ease-out ${scaleIf(currentFocusId, id)}`}
                    {...focusAttrs(currentFocusId, id)}
                  >
                    <div className="text-xl font-quicksand font-bold text-white leading-tight">
                      {p.label ?? termText(p.termMonths) ?? 'Plan'}
                    </div>
                    <div className="flex items-center gap-2 text-brand-ice/80 font-nunito text-sm mt-1">
                      <Users className="w-4 h-4" />
                      {connectionsText(p.connections) || 'Streaming plan'}
                    </div>
                    <div className="mt-4">
                      {price ? (
                        <span className="text-3xl font-quicksand font-bold text-brand-gold">{price}</span>
                      ) : (
                        <span className="text-sm text-brand-ice/60 font-nunito">Price shown on the next screen</span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

VibezPlanGrid.displayName = 'VibezPlanGrid';
export default VibezPlanGrid;
