import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShoppingCart, ArrowLeft, Sparkles } from 'lucide-react';
import { useTVFocus } from '@/hooks/useTVFocus';
import { useToast } from '@/hooks/use-toast';
import type { XtreamCreds } from '@/lib/xtream';
import { SmcBilling, type BillingInvoice, type BillingOrderResult, type BillingPlan, type BillingService } from '@/capacitor/SmcBilling';
import { applyServiceToPlayer, credentialsOf, toBillingError, billingErrorText, formatDateTime } from '@/lib/billing';
import { BTN, BTN_GOLD, CARD, SCREEN, focusAttrs, scaleIf, useFocusRecovery } from './shared';
import BillingAuthForm from './BillingAuthForm';
import BuyPlanScreen from './BuyPlanScreen';
import PaymentSheet from './PaymentSheet';
import CredentialsSheet from './CredentialsSheet';
import WaitScreen from './WaitScreen';

interface Props {
  /** The player is signed in with the new line. */
  onDone: (creds: XtreamCreds) => void;
  onCancel: () => void;
}

type Step = 'check' | 'auth' | 'creating' | 'provisioning' | 'success' | 'used' | 'plans' | 'pay' | 'failed';

interface PayCtx { invoiceId: number; initialUrl: string | null; amount: number | null; currency: string; title: string; serviceId: number }

/**
 * "Start free 24-hour trial" from the player's sign-in screen.
 *
 *   no billing account → create one → POST /trial → sign the player in with
 *   service.credentials → success sheet (username, password, expiry, Copy).
 *
 * A trial already used turns into "pick a plan": the plan list, the payment
 * sheet and the wait for the line all run here too, so the viewer ends on the
 * same success sheet either way.
 */
const TrialFlow = memo(({ onDone, onCancel }: Props) => {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('check');
  const [service, setService] = useState<BillingService | null>(null);
  const [creds, setCreds] = useState<XtreamCreds | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The billing account's address, so the finished line can be mailed to them.
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [failure, setFailure] = useState<string>('');
  const [provisioningId, setProvisioningId] = useState<number | null>(null);
  const [pay, setPay] = useState<PayCtx | null>(null);
  const [applying, setApplying] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  const fail = useCallback((message: string) => { setFailure(message); setStep('failed'); }, []);

  /** Sign the player in with the line; on success show the sheet. */
  const applyAndShow = useCallback(async (s: BillingService) => {
    setService(s);
    const c = credentialsOf(s);
    if (!c) { setProvisioningId(s.id); setStep('provisioning'); return; }
    setApplying(true);
    try {
      const r = await applyServiceToPlayer(c);
      if (!mountedRef.current) return;
      if (r.ok === true) { setCreds(r.creds); setNote(null); }
      else { setCreds(null); setNote(`${r.error} You can copy the details and sign in by hand.`); }
      setStep('success');
    } finally {
      if (mountedRef.current) setApplying(false);
    }
  }, []);

  // 1. Signed in to billing? Trial still available?
  useEffect(() => {
    if (step !== 'check') return;
    let cancelled = false;
    (async () => {
      try {
        const st = await SmcBilling.getState();
        if (cancelled) return;
        if (!st.signedIn) { setStep('auth'); return; }
        const me = await SmcBilling.me();
        if (cancelled) return;
        setAccountEmail(me.client.email ?? null);
        setStep(me.client.trial_used ? 'used' : 'creating');
      } catch (e) {
        if (cancelled) return;
        const err = toBillingError(e);
        if (err.isAuthError) setStep('auth');
        else fail(billingErrorText(err));
      }
    })();
    return () => { cancelled = true; };
  }, [step, fail]);

  // 2. POST /trial.
  useEffect(() => {
    if (step !== 'creating') return;
    let cancelled = false;
    (async () => {
      try {
        const t = await SmcBilling.startTrial();
        if (cancelled) return;
        await applyAndShow(t.service);
      } catch (e) {
        if (cancelled) return;
        const err = toBillingError(e);
        if (err.code === 'trial_already_used') setStep('used');
        else if (err.isAuthError) setStep('auth');
        else if (err.code === 'provisioning_failed' && typeof err.details?.service_id === 'number') {
          setProvisioningId(err.details.service_id as number);
          setStep('provisioning');
        } else fail(billingErrorText(err));
      }
    })();
    return () => { cancelled = true; };
  }, [step, applyAndShow, fail]);

  // 3. Wait for a line that is not active yet.
  useEffect(() => {
    if (step !== 'provisioning' || provisioningId == null) return;
    let cancelled = false;
    const pollId = `trial-service:${provisioningId}`;
    (async () => {
      try {
        const r = await SmcBilling.pollServiceActive({ serviceId: provisioningId, pollId });
        if (cancelled) return;
        if (r.outcome === 'active' && r.service) { await applyAndShow(r.service); return; }
        if (r.outcome === 'cancelled') return;
        fail(r.outcome === 'terminal'
          ? 'This service was cancelled before it went live. Contact support if you were charged.'
          : 'Your line was created but the panel is slow. Check My Account in a minute — your login will be there.');
      } catch (e) {
        if (cancelled) return;
        const err = toBillingError(e);
        if (err.isAuthError) setStep('auth'); else fail(billingErrorText(err));
      }
    })();
    return () => { cancelled = true; void SmcBilling.cancelPoll({ pollId }); };
  }, [step, provisioningId, applyAndShow, fail]);

  const onOrdered = (o: BillingOrderResult, plan: BillingPlan) => {
    if (o.invoice_id == null) {
      toast({ title: 'Order placed', description: `${plan.name} has nothing to pay and will be activated shortly.` });
      setProvisioningId(o.service_id);
      setStep('provisioning');
      return;
    }
    setPay({ invoiceId: o.invoice_id, initialUrl: o.pay_url, amount: o.amount, currency: o.currency, title: `Pay for ${plan.name}`, serviceId: o.service_id });
    setStep('pay');
  };

  const onPaid = (_inv: BillingInvoice) => {
    const ctx = pay;
    setPay(null);
    void SmcBilling.clearPendingInvoice().catch(() => undefined);
    if (ctx) { setProvisioningId(ctx.serviceId); setStep('provisioning'); }
    else setStep('used');
  };

  if (step === 'check') return <WaitScreen title="One moment…" onBack={onCancel} />;
  if (step === 'auth') {
    return (
      <BillingAuthForm
        initialMode="register"
        heading="Create a free billing account to start your 24-hour trial. This is separate from your streaming login."
        onSuccess={(s) => { setAccountEmail(s.client.email ?? null); setStep(s.client.trial_used ? 'used' : 'creating'); }}
        onCancel={onCancel}
      />
    );
  }
  if (step === 'creating') return <WaitScreen title="Creating your free trial…" detail="The panel is creating your login. This takes a few seconds." />;
  if (step === 'provisioning') return <WaitScreen title="Setting up your line…" detail="Almost there. This usually takes a few seconds." />;
  if (step === 'failed') return <WaitScreen error title="That did not work" detail={failure} onBack={onCancel} />;
  if (step === 'plans') return <BuyPlanScreen onBack={() => setStep('used')} onOrdered={onOrdered} onAuthLost={() => setStep('auth')} />;
  if (step === 'pay' && pay) {
    return (
      <PaymentSheet
        invoiceId={pay.invoiceId} initialUrl={pay.initialUrl} amount={pay.amount} currency={pay.currency} title={pay.title}
        onPaid={onPaid}
        onClose={() => { setPay(null); setStep('used'); }}
        onAuthLost={() => setStep('auth')}
      />
    );
  }
  if (step === 'success' && service) {
    const trial = !!service.plan?.trial;
    return (
      <CredentialsSheet
        title={trial ? 'Your free trial is ready' : 'Your line is ready'}
        subtitle={trial ? `Watch for 24 hours — until ${formatDateTime(service.expires_at)}.` : `${service.plan?.name || 'Your plan'} is active.`}
        note={note}
        service={service}
        emailTo={accountEmail}
        primaryLabel={creds ? 'Start watching' : 'Try again'}
        onPrimary={() => { if (creds) onDone(creds); else void applyAndShow(service); }}
        secondaryLabel={creds ? undefined : 'Close'}
        onSecondary={creds ? undefined : onCancel}
        busy={applying}
        busyLabel="Signing the player in…"
      />
    );
  }
  return <TrialUsed onChoosePlan={() => setStep('plans')} onBack={onCancel} />;
});

TrialFlow.displayName = 'TrialFlow';
export default TrialFlow;

const TrialUsed = memo(({ onChoosePlan, onBack }: { onChoosePlan: () => void; onBack: () => void }) => {
  const { containerRef, currentFocusId, focusById } = useTVFocus({ initialFocusId: 'tu-plan', onBack });
  useFocusRecovery(containerRef, currentFocusId, focusById, 'tu-plan');
  return (
    <div ref={containerRef} className={SCREEN}>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className={`${CARD} w-full max-w-xl p-8 text-center`}>
          <Sparkles className="w-12 h-12 text-brand-gold mx-auto" />
          <h2 className="mt-4 text-2xl font-quicksand font-bold text-white">Trial already used</h2>
          <p className="mt-2 text-brand-ice/80 font-nunito">
            This billing account (or this device) has already had its free trial. Pick a plan to keep watching.
          </p>
          <div className="flex justify-center gap-3 mt-6">
            <Button variant="gold" onClick={onChoosePlan}
              className={`${BTN_GOLD} ${scaleIf(currentFocusId, 'tu-plan')}`} {...focusAttrs(currentFocusId, 'tu-plan')}>
              <ShoppingCart className="w-4 h-4 mr-2" /> Choose a plan
            </Button>
            <Button variant="white" onClick={onBack}
              className={`${BTN} ${scaleIf(currentFocusId, 'tu-back')}`} {...focusAttrs(currentFocusId, 'tu-back')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
});
TrialUsed.displayName = 'TrialUsed';
