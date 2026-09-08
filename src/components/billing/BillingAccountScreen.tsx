import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  CreditCard, LogOut, RefreshCw, ShoppingCart, Gift, Copy, Eye, EyeOff, Tv, Users, Calendar, Loader2, Sparkles, AlertTriangle,
} from 'lucide-react';
import { useTVFocus } from '@/hooks/useTVFocus';
import { useToast } from '@/hooks/use-toast';
import { usePlayerAccount } from '@/hooks/usePlayerAccount';
import { useOwnHardwareBack } from '@/hooks/useOwnHardwareBack';
import { BackButton } from '@/components/ui/BackButton';
import type { XtreamCreds } from '@/lib/xtream';
import {
  SmcBilling,
  type BillingClient,
  type BillingInvoice,
  type BillingOrderResult,
  type BillingPendingInvoice,
  type BillingPlan,
  type BillingService,
} from '@/capacitor/SmcBilling';
import {
  applyServiceToPlayer, copyText, formatDate, formatMoney, connectionsLabel, hasCredentials, credentialsOf,
  isRenewable, isThisDevice, needsPayment, serviceStatusChip, toBillingError, billingErrorText,
} from '@/lib/billing';
import { BODY, BTN, BTN_GOLD, CARD, HEADER, INPUT, SCREEN, focusAttrs, scaleIf, useRateLimit, useBillingErrorHandler, useFocusRecovery } from './shared';
import { Spinner, RateLimitNote } from './SharedUi';
import BillingAuthForm from './BillingAuthForm';
import BuyPlanScreen from './BuyPlanScreen';
import PaymentSheet from './PaymentSheet';
import CredentialsSheet from './CredentialsSheet';
import WaitScreen from './WaitScreen';

interface Props {
  onBack: () => void;
  /** A service's credentials were applied to the player; the caller may open it. */
  onUseInPlayer?: (creds: XtreamCreds) => void;
  /** Mounted somewhere that does not already own the hardware Back (the dashboard). */
  ownsHardwareBack?: boolean;
}

type View = 'loading' | 'auth' | 'services' | 'plans' | 'pay' | 'provisioning' | 'ready';

interface PayCtx {
  invoiceId: number;
  initialUrl: string | null;
  amount: number | null;
  currency: string;
  title: string;
  kind: 'renew' | 'order';
  serviceId: number | null;
  planName: string | null;
}

const RESUME_POLL = 'resume-pending';

/**
 * My Account for the billing account: sign in / create, the list of services
 * with RENEW / Finish payment / Use in player, Buy a plan, and Redeem gift code.
 *
 * This component is the state machine; each view is its own component with
 * its own D-pad handling, so only one keyboard owner is mounted at a time.
 */
const BillingAccountScreen = memo(({ onBack, onUseInPlayer, ownsHardwareBack }: Props) => {
  const { toast } = useToast();
  const { account: playerAccount } = usePlayerAccount();
  const [view, setView] = useState<View>('loading');
  const [client, setClient] = useState<BillingClient | null>(null);
  const [services, setServices] = useState<BillingService[]>([]);
  const [pending, setPending] = useState<BillingPendingInvoice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | 'trial' | 'redeem' | null>(null);
  const [notRenewable, setNotRenewable] = useState<Set<number>>(() => new Set());
  const [pay, setPay] = useState<PayCtx | null>(null);
  const [provisioningId, setProvisioningId] = useState<number | null>(null);
  const [ready, setReady] = useState<BillingService | null>(null);
  const [applying, setApplying] = useState(false);
  const mountedRef = useRef(true);
  const { blocked, secondsLeft, block } = useRateLimit();

  useOwnHardwareBack(!!ownsHardwareBack, onBack);

  const onAuthLost = useCallback(() => {
    setClient(null);
    setServices([]);
    setPay(null);
    setView('auth');
  }, []);
  const handleError = useBillingErrorHandler({ onAuthLost, block });

  const refreshPending = useCallback(async () => {
    try { setPending((await SmcBilling.getState()).pendingInvoice); } catch { /* ignore */ }
  }, []);

  /** GET /me + GET /services. Keeps the screen usable when only one fails. */
  const load = useCallback(async (): Promise<BillingService[]> => {
    setLoadError(null);
    try {
      const [me, svc] = await Promise.all([SmcBilling.me(), SmcBilling.services()]);
      if (!mountedRef.current) return [];
      setClient(me.client);
      setServices(svc.services);
      // Only the boot/sign-in path moves to the list. A refresh fired from the
      // background (the pending-invoice poll) must not pull the viewer out of
      // the plan list or a payment sheet they are in the middle of.
      setView((v) => (v === 'loading' || v === 'auth' ? 'services' : v));
      return svc.services;
    } catch (e) {
      if (!mountedRef.current) return [];
      const err = toBillingError(e);
      if (err.isAuthError) { onAuthLost(); return []; }
      if (err.code === 'rate_limited') block(err.retryAfter ?? 30);
      setLoadError(billingErrorText(err));
      setView((v) => (v === 'loading' || v === 'auth' ? 'services' : v));
      return [];
    }
  }, [onAuthLost, block]);

  // Boot: signed in? → load; a pending invoice → resume its poll in the background.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    (async () => {
      let signedIn = false;
      let pend: BillingPendingInvoice | null = null;
      try {
        const st = await SmcBilling.getState();
        signedIn = st.signedIn;
        pend = st.pendingInvoice;
      } catch { /* treated as signed out */ }
      if (cancelled) return;
      setPending(pend);
      if (!signedIn) { setView('auth'); return; }
      await load();
      if (cancelled || !pend) return;
      try {
        const r = await SmcBilling.pollInvoice({ invoiceId: pend.invoice_id, pollId: RESUME_POLL });
        if (cancelled) return;
        if (r.outcome === 'paid') {
          toast({ title: 'Payment received', description: `Invoice #${pend.invoice_id} is paid.` });
          setPending(null);
          void load();
        } else if (r.outcome === 'closed') {
          setPending(null);
        }
      } catch { /* the banner still offers Finish payment */ }
    })();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      void SmcBilling.cancelPoll({ pollId: RESUME_POLL });
    };
  }, [load, toast]);

  // ── actions ────────────────────────────────────────────────────────────

  const signOut = async () => {
    try { await SmcBilling.logout(); } catch { /* signed out locally regardless */ }
    setClient(null);
    setServices([]);
    setPending(null);
    toast({ title: 'Signed out of billing' });
    setView('auth');
  };

  const renew = async (s: BillingService) => {
    if (busyId !== null || blocked) return;
    setBusyId(s.id);
    try {
      const r = await SmcBilling.renew({ serviceId: s.id });
      if (r.status === 'paid') {
        toast({ title: 'Renewed', description: 'Your account credit covered this renewal.' });
        await load();
        return;
      }
      setPay({
        invoiceId: r.invoice_id, initialUrl: r.pay_url, amount: r.amount, currency: r.currency,
        title: `Renew ${s.plan?.name || 'your plan'}`, kind: 'renew', serviceId: s.id, planName: s.plan?.name ?? null,
      });
      setView('pay');
    } catch (e) {
      const err = handleError(e, 'Could not renew');
      if (err.code === 'not_renewable') setNotRenewable((prev) => new Set(prev).add(s.id));
    } finally {
      setBusyId(null);
    }
  };

  /** A pending paid order: mint a fresh link for its invoice. */
  const finishPayment = async (s: BillingService | null, pend: BillingPendingInvoice | null) => {
    if (busyId !== null || blocked) return;
    const id = s?.id ?? 'trial';
    setBusyId(id);
    try {
      if (pend && (!s || pend.service_id === s.id)) {
        setPay({
          invoiceId: pend.invoice_id, initialUrl: null, amount: s?.amount ?? null, currency: s?.currency ?? 'USD',
          title: `${pend.kind === 'renew' ? 'Renew' : 'Pay for'} ${pend.plan_name || s?.plan?.name || 'your plan'}`, kind: pend.kind, serviceId: pend.service_id ?? s?.id ?? null, planName: pend.plan_name ?? s?.plan?.name ?? null,
        });
        setView('pay');
        return;
      }
      if (!s?.plan?.id) return;
      // Orders are idempotent per plan: the unfinished one comes back with its invoice.
      const o = await SmcBilling.order({ planId: s.plan.id });
      if (o.invoice_id == null) {
        toast({ title: 'Nothing to pay', description: 'This order has no open invoice. It will be activated shortly.' });
        await load();
        return;
      }
      setPay({
        invoiceId: o.invoice_id, initialUrl: o.pay_url, amount: o.amount, currency: o.currency,
        title: `Pay for ${s.plan.name}`, kind: 'order', serviceId: o.service_id, planName: s.plan.name,
      });
      setView('pay');
    } catch (e) {
      handleError(e, 'Could not open the payment');
    } finally {
      setBusyId(null);
    }
  };

  const applyToPlayer = async (s: BillingService) => {
    const c = credentialsOf(s);
    if (busyId !== null || !c) return;
    setBusyId(s.id);
    setApplying(true);
    try {
      const r = await applyServiceToPlayer(c);
      if (r.ok === false) { toast({ title: 'Could not sign the player in', description: r.error, variant: 'destructive' }); return; }
      toast({ title: 'Player signed in', description: `Now watching as ${r.creds.username}.` });
      onUseInPlayer?.(r.creds);
    } finally {
      setBusyId(null);
      setApplying(false);
    }
  };

  const redeem = async (code: string) => {
    if (busyId !== null || blocked || !code.trim()) return;
    setBusyId('redeem');
    try {
      const r = await SmcBilling.redeem({ code: code.trim() });
      toast({ title: r.ok ? 'Gift code applied' : 'Gift code', description: r.result?.message || 'Done.' });
      await load();
      return true;
    } catch (e) {
      handleError(e, 'Could not redeem the code');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const startTrial = async () => {
    if (busyId !== null || blocked) return;
    setBusyId('trial');
    try {
      const t = await SmcBilling.startTrial();
      if (hasCredentials(t.service)) { setReady(t.service); setView('ready'); }
      else { setProvisioningId(t.service.id); setView('provisioning'); }
    } catch (e) {
      const err = toBillingError(e);
      if (err.code === 'provisioning_failed' && typeof err.details?.service_id === 'number') {
        toast({ title: 'Trial created', description: billingErrorText(err) });
        setProvisioningId(err.details.service_id as number);
        setView('provisioning');
      } else {
        handleError(e, 'Could not start the trial');
        if (err.code === 'trial_already_used') void load();
      }
    } finally {
      setBusyId(null);
    }
  };

  const onOrdered = (o: BillingOrderResult, plan: BillingPlan) => {
    if (o.invoice_id == null) {
      toast({ title: 'Order placed', description: `${plan.name} has nothing to pay and will be activated shortly.` });
      setProvisioningId(o.service_id);
      setView('provisioning');
      return;
    }
    setPay({
      invoiceId: o.invoice_id, initialUrl: o.pay_url, amount: o.amount, currency: o.currency,
      title: `Pay for ${plan.name}`, kind: 'order', serviceId: o.service_id, planName: plan.name,
    });
    setView('pay');
  };

  const onPaid = async (_inv: BillingInvoice) => {
    const ctx = pay;
    setPending(null);
    void SmcBilling.clearPendingInvoice().catch(() => undefined);
    if (!ctx) { setView('services'); void load(); return; }
    if (ctx.kind === 'renew') {
      setPay(null);
      setView('services');
      const list = await load();
      const svc = list.find((s) => s.id === ctx.serviceId);
      toast({ title: 'Renewed', description: svc?.next_due ? `Renewed until ${formatDate(svc.next_due)}.` : 'Your renewal is paid.' });
      return;
    }
    setPay(null);
    if (ctx.serviceId != null) { setProvisioningId(ctx.serviceId); setView('provisioning'); }
    else { setView('services'); void load(); }
  };

  const closePay = () => {
    setPay(null);
    setView('services');
    void refreshPending();
    void load();
  };

  // Provisioning: wait for the new line to be active with credentials.
  useEffect(() => {
    if (view !== 'provisioning' || provisioningId == null) return;
    let cancelled = false;
    const pollId = `service:${provisioningId}`;
    (async () => {
      try {
        const r = await SmcBilling.pollServiceActive({ serviceId: provisioningId, pollId });
        if (cancelled) return;
        if (r.outcome === 'active' && r.service) { setReady(r.service); setView('ready'); return; }
        if (r.outcome === 'terminal') toast({ title: 'Order not completed', description: 'This service was cancelled. Contact support if you were charged.', variant: 'destructive' });
        else if (r.outcome === 'timeout') toast({ title: 'Still being set up', description: 'Your line is taking longer than usual. Check My Account again in a minute.' });
        if (r.outcome !== 'cancelled') { setView('services'); void load(); }
      } catch (e) {
        if (cancelled) return;
        handleError(e, 'Could not check the new service');
        setView('services');
        void load();
      }
    })();
    return () => { cancelled = true; void SmcBilling.cancelPoll({ pollId }); };
  }, [view, provisioningId, load, handleError, toast]);

  // ── views ──────────────────────────────────────────────────────────────

  if (view === 'loading') {
    return <WaitScreen title="Loading your account…" onBack={onBack} />;
  }
  if (view === 'auth') {
    return (
      <BillingAuthForm
        initialMode="login"
        initialEmail={client?.email ?? ''}
        onSuccess={(s) => { setClient(s.client); void load(); void refreshPending(); }}
        onCancel={onBack}
      />
    );
  }
  if (view === 'plans') {
    return <BuyPlanScreen onBack={() => setView('services')} onOrdered={onOrdered} onAuthLost={onAuthLost} />;
  }
  if (view === 'pay' && pay) {
    return (
      <PaymentSheet
        invoiceId={pay.invoiceId}
        initialUrl={pay.initialUrl}
        amount={pay.amount}
        currency={pay.currency}
        title={pay.title}
        onPaid={(inv) => { void onPaid(inv); }}
        onClose={closePay}
        onAuthLost={onAuthLost}
      />
    );
  }
  if (view === 'provisioning') {
    return <WaitScreen title="Setting up your line…" detail="The panel is creating your login. This usually takes a few seconds." />;
  }
  if (view === 'ready' && ready) {
    return (
      <CredentialsSheet
        title="Your line is ready"
        subtitle={`${ready.plan?.name || 'Your plan'} · ${connectionsLabel(ready.connections)}`}
        service={ready}
        emailTo={client?.email ?? null}
        primaryLabel="Use in player"
        onPrimary={() => { void applyToPlayer(ready); }}
        secondaryLabel="Back to My Account"
        onSecondary={() => { setReady(null); setView('services'); void load(); }}
        busy={applying}
        busyLabel="Signing the player in…"
      />
    );
  }

  return (
    <ServicesView
      email={client?.email ?? null}
      trialAvailable={!!client && !client.trial_used}
      services={services}
      pending={pending}
      playerUsername={playerAccount?.username ?? null}
      busyId={busyId}
      notRenewable={notRenewable}
      loadError={loadError}
      blocked={blocked}
      secondsLeft={secondsLeft}
      onBack={onBack}
      onRefresh={() => { void load(); void refreshPending(); }}
      onSignOut={() => { void signOut(); }}
      onRenew={(s) => { void renew(s); }}
      onFinishPayment={(s) => { void finishPayment(s, pending); }}
      onUseInPlayer={(s) => { void applyToPlayer(s); }}
      onBuy={() => setView('plans')}
      onTrial={() => { void startTrial(); }}
      onRedeem={redeem}
    />
  );
});

BillingAccountScreen.displayName = 'BillingAccountScreen';
export default BillingAccountScreen;

// ── the list ─────────────────────────────────────────────────────────────────

interface ServicesProps {
  email: string | null;
  trialAvailable: boolean;
  services: BillingService[];
  pending: BillingPendingInvoice | null;
  playerUsername: string | null;
  busyId: number | 'trial' | 'redeem' | null;
  notRenewable: Set<number>;
  loadError: string | null;
  blocked: boolean;
  secondsLeft: number;
  onBack: () => void;
  onRefresh: () => void;
  onSignOut: () => void;
  onRenew: (s: BillingService) => void;
  onFinishPayment: (s: BillingService | null) => void;
  onUseInPlayer: (s: BillingService) => void;
  onBuy: () => void;
  onTrial: () => void;
  onRedeem: (code: string) => Promise<boolean>;
}

const ServicesView = memo((p: ServicesProps) => {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [shown, setShown] = useState<Set<number>>(() => new Set());
  const { containerRef, currentFocusId, focusById } = useTVFocus({
    initialFocusId: 'back',
    onBack: p.onBack,
    scrollBlock: 'center',
  });
  useFocusRecovery(containerRef, currentFocusId, focusById, 'back');

  const copy = async (label: string, value: string) => {
    const ok = await copyText(value);
    toast(ok
      ? { title: 'Copied', description: `${label} copied to the clipboard.` }
      : { title: 'Copy not available', description: 'Write it down from the screen instead.', variant: 'destructive' });
  };

  const submitRedeem = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (await p.onRedeem(code)) setCode('');
  };

  const pendingServiceIds = new Set(p.services.filter(needsPayment).map((s) => s.id));
  // Show the banner only when the pending invoice is not already represented by a "Finish payment" card.
  const showPendingBanner = !!p.pending && (p.pending.service_id == null || !pendingServiceIds.has(p.pending.service_id));
  const anyBusy = p.busyId !== null;

  return (
    <div ref={containerRef} className={SCREEN}>
      <div className={HEADER}>
        <div className="flex items-center gap-3 min-w-0">
          <BackButton onClick={p.onBack} label="Back" data-player-header-btn="" focused={currentFocusId === 'back'} data-tv-focus-id="back" />
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard className="w-7 h-7 text-brand-gold shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl font-quicksand font-bold text-white leading-tight">My Account</h1>
              {p.email && <p className="text-xs text-brand-ice/70 font-nunito truncate">{p.email}</p>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RateLimitNote secondsLeft={p.secondsLeft} />
          <Button variant="white" size="sm" onClick={p.onRefresh} disabled={anyBusy}
            className={`${BTN} ${scaleIf(currentFocusId, 'refresh')}`} {...focusAttrs(currentFocusId, 'refresh')}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="white" size="sm" onClick={p.onSignOut} disabled={anyBusy}
            className={`${BTN} ${scaleIf(currentFocusId, 'signout')}`} {...focusAttrs(currentFocusId, 'signout')}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>

      <div className={BODY}>
        <div className="w-full max-w-4xl space-y-5 pb-10">
          {p.loadError && (
            <Card className={`${CARD} p-5 border-red-400/40`}>
              <div className="flex items-center gap-3 text-red-200 font-nunito">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>{p.loadError}</span>
              </div>
            </Card>
          )}

          {showPendingBanner && p.pending && (
            <Card className={`${CARD} p-5 border-amber-400/40`}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-lg font-quicksand font-semibold text-white">An invoice is waiting for payment</div>
                  <div className="text-brand-ice/80 font-nunito text-sm">
                    {p.pending.plan_name ? `${p.pending.plan_name} · ` : ''}Invoice #{p.pending.invoice_id}
                  </div>
                </div>
                <Button variant="gold" disabled={anyBusy || p.blocked} onClick={() => p.onFinishPayment(null)}
                  className={`${BTN_GOLD} ${scaleIf(currentFocusId, 'pending-pay')}`} {...focusAttrs(currentFocusId, 'pending-pay')}>
                  {p.busyId === 'trial' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                  Finish payment
                </Button>
              </div>
            </Card>
          )}

          {p.services.length === 0 && !p.loadError && (
            <Card className={`${CARD} p-6`}>
              <h2 className="text-xl font-quicksand font-semibold text-white">No services yet</h2>
              <p className="text-brand-ice/80 font-nunito mt-1">
                {p.trialAvailable
                  ? 'Start a free 24-hour trial, or buy a plan to get a Dreamstreams login.'
                  : 'Buy a plan to get a Dreamstreams login for the Player.'}
              </p>
            </Card>
          )}

          {p.services.map((s) => {
            const chip = serviceStatusChip(s.status);
            const thisDevice = isThisDevice(s, p.playerUsername);
            const renewable = isRenewable(s) && !p.notRenewable.has(s.id);
            const finish = needsPayment(s);
            const creds = credentialsOf(s);
            const busy = p.busyId === s.id;
            const show = shown.has(s.id);
            return (
              <Card key={s.id} className={`${CARD} p-5 ${thisDevice ? 'border-brand-gold/60' : ''}`}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-quicksand font-bold text-white">{s.plan?.name || 'Service'}</h2>
                      <Badge className={`border ${chip.className}`}>{chip.label}</Badge>
                      {s.plan?.trial && <Badge className="border bg-sky-600/30 text-sky-100 border-sky-400/40">Trial</Badge>}
                      {thisDevice && <Badge className="border bg-brand-gold/30 text-white border-brand-gold/60"><Tv className="w-3 h-3 mr-1" />This device</Badge>}
                    </div>
                    <div className="flex items-center gap-4 flex-wrap text-sm text-brand-ice/80 font-nunito mt-2">
                      <span className="flex items-center gap-1"><Users className="w-4 h-4" />{connectionsLabel(s.connections)}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-4 h-4" />Expires {formatDate(s.expires_at)}</span>
                      {(s.amount ?? 0) > 0 && <span>{formatMoney(s.amount, s.currency)}{s.billing_cycle ? ` / ${s.billing_cycle}` : ''}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {finish ? (
                      <Button variant="gold" disabled={anyBusy || p.blocked} onClick={() => p.onFinishPayment(s)}
                        className={`${BTN_GOLD} ${scaleIf(currentFocusId, `s-${s.id}-pay`)}`} {...focusAttrs(currentFocusId, `s-${s.id}-pay`)}>
                        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        Finish payment
                      </Button>
                    ) : renewable ? (
                      <Button variant="gold" disabled={anyBusy || p.blocked} onClick={() => p.onRenew(s)}
                        className={`${BTN_GOLD} ${scaleIf(currentFocusId, `s-${s.id}-renew`)}`} {...focusAttrs(currentFocusId, `s-${s.id}-renew`)}>
                        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                        Renew
                      </Button>
                    ) : p.notRenewable.has(s.id) ? (
                      <Button variant="gold" disabled={anyBusy} onClick={p.onBuy}
                        className={`${BTN_GOLD} ${scaleIf(currentFocusId, `s-${s.id}-choose`)}`} {...focusAttrs(currentFocusId, `s-${s.id}-choose`)}>
                        <ShoppingCart className="w-4 h-4 mr-2" /> Choose a plan
                      </Button>
                    ) : null}
                    {creds && (
                      <Button variant="white" disabled={anyBusy} onClick={() => p.onUseInPlayer(s)}
                        className={`${BTN} ${scaleIf(currentFocusId, `s-${s.id}-use`)}`} {...focusAttrs(currentFocusId, `s-${s.id}-use`)}>
                        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Tv className="w-4 h-4 mr-2" />}
                        Use in player
                      </Button>
                    )}
                  </div>
                </div>

                {creds ? (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 rounded-xl bg-black/30 border border-white/10 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-wide text-white/60">Username</div>
                        <div className="text-white font-mono break-all">{creds.username}</div>
                      </div>
                      <Button variant="white" size="sm" onClick={() => { void copy('Username', creds.username); }}
                        className={`${BTN} h-10 ${scaleIf(currentFocusId, `s-${s.id}-cu`)}`} {...focusAttrs(currentFocusId, `s-${s.id}-cu`)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl bg-black/30 border border-white/10 px-4 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs uppercase tracking-wide text-white/60">Password</div>
                        <div className="text-white font-mono break-all">{show ? creds.password : '•'.repeat(Math.max(8, creds.password.length))}</div>
                      </div>
                      <Button variant="white" size="sm" onClick={() => setShown((prev) => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })}
                        className={`${BTN} h-10 ${scaleIf(currentFocusId, `s-${s.id}-show`)}`} {...focusAttrs(currentFocusId, `s-${s.id}-show`)}>
                        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button variant="white" size="sm" onClick={() => { void copy('Password', creds.password); }}
                        className={`${BTN} h-10 ${scaleIf(currentFocusId, `s-${s.id}-cp`)}`} {...focusAttrs(currentFocusId, `s-${s.id}-cp`)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="md:col-span-2 text-xs text-brand-ice/60 font-nunito">Server: {creds.host}</div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-brand-ice/70 font-nunito">
                    {finish ? 'Login details appear here once the invoice is paid and the line is created.' : 'No login details for this service.'}
                  </p>
                )}
              </Card>
            );
          })}

          <Card className={`${CARD} p-5`}>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="gold" disabled={anyBusy || p.blocked} onClick={p.onBuy}
                className={`${BTN_GOLD} ${scaleIf(currentFocusId, 'buy')}`} {...focusAttrs(currentFocusId, 'buy')}>
                <ShoppingCart className="w-4 h-4 mr-2" /> Buy a plan
              </Button>
              {p.trialAvailable && p.services.length === 0 && (
                <Button variant="white" disabled={anyBusy || p.blocked} onClick={p.onTrial}
                  className={`${BTN} ${scaleIf(currentFocusId, 'trial')}`} {...focusAttrs(currentFocusId, 'trial')}>
                  {p.busyId === 'trial' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  Start free 24-hour trial
                </Button>
              )}
            </div>
            <form onSubmit={submitRedeem} className="mt-5">
              <div className="text-sm uppercase tracking-wide text-white/60 mb-2 flex items-center gap-2"><Gift className="w-4 h-4" /> Redeem a gift code</div>
              <div className="flex gap-3">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter your code" autoComplete="off" disabled={anyBusy}
                  data-tv-allow-enter="true" className={`${INPUT} max-w-sm`} {...focusAttrs(currentFocusId, 'redeem-code')} />
                <Button type="submit" variant="white" disabled={anyBusy || p.blocked || !code.trim()}
                  className={`${BTN} ${scaleIf(currentFocusId, 'redeem-go')}`} {...focusAttrs(currentFocusId, 'redeem-go')}>
                  {p.busyId === 'redeem' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Redeem
                </Button>
              </div>
            </form>
          </Card>
          {anyBusy && p.busyId !== 'redeem' && p.busyId !== 'trial' && <Spinner label="Working…" />}
        </div>
      </div>
    </div>
  );
});
ServicesView.displayName = 'BillingServicesView';
