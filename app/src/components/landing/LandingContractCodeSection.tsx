import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowRightLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Coins,
  GitBranch,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Wallet,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { RevealSection } from '../dashboard/RevealSection';
import { cn } from '../../lib/utils';

type FlowMode = 'standard' | 'revoke';

interface TransferEvent {
  from: string;
  to: string;
  amount: number;
  note: string;
}

interface FlowSnapshot {
  id: string;
  title: string;
  detail: string;
  code: string;
  vested: number;
  withdrawn: number;
  returned: number;
  active: boolean;
  transfer?: TransferEvent;
}

interface StepMetrics {
  vault: number;
  beneficiary: number;
  returned: number;
  claimable: number;
  active: boolean;
  closeable: boolean;
  totalHeld: number;
  isConserved: boolean;
}

interface FlowStep {
  id: string;
  title: string;
  detail: string;
  code: string;
  transfer?: TransferEvent;
  metrics: StepMetrics;
}

const TOTAL_AMOUNT = 1_000;
const STEP_MS = 2_900;

const STANDARD_SNAPSHOTS: FlowSnapshot[] = [
  {
    id: 'init',
    title: 'Initialize & Fund',
    detail: 'Grantor creates the vesting PDA and funds the vault with the full schedule amount.',
    code: `initialize(...)
-> derive PDA(seeds = grantor + beneficiary + mint)
-> transfer_checked(grantor_ata -> vesting_vault, total_amount)
-> vesting_state.is_active = true`,
    vested: 0,
    withdrawn: 0,
    returned: 0,
    active: true,
    transfer: {
      from: 'Grantor Wallet',
      to: 'Vesting Vault',
      amount: 1_000,
      note: 'Funding transfer',
    },
  },
  {
    id: 'vesting',
    title: 'Vesting Progress',
    detail: 'After cliff, vested entitlement grows by frequency while tokens stay in vault.',
    code: `if now >= cliff_time {
  vested = vested_amount(now)
  claimable = vested - total_withdrawn
}`,
    vested: 420,
    withdrawn: 0,
    returned: 0,
    active: true,
  },
  {
    id: 'partial',
    title: 'Partial Withdraw',
    detail: 'Beneficiary withdraws part of claimable, not the full amount.',
    code: `require!(available_to_withdraw >= amount)
transfer_checked(vesting_vault -> beneficiary_ata, amount)
total_withdrawn += amount`,
    vested: 420,
    withdrawn: 200,
    returned: 0,
    active: true,
    transfer: {
      from: 'Vesting Vault',
      to: 'Beneficiary Wallet',
      amount: 200,
      note: 'Partial claim',
    },
  },
  {
    id: 'unlock-all',
    title: 'Full Unlock Reached',
    detail: 'By vesting end, beneficiary entitlement reaches full schedule amount.',
    code: `completed_periods -> total_periods
vested = min(total_amount, completed_periods * per_period)
claimable = vested - total_withdrawn`,
    vested: 1_000,
    withdrawn: 200,
    returned: 0,
    active: true,
  },
  {
    id: 'close-standard',
    title: 'Final Claim + Close',
    detail: 'Beneficiary takes remaining vested amount, then grantor closes empty vault/state.',
    code: `withdraw(remaining_claimable)
require_eq!(vesting_vault.amount, 0)
close_account(vesting_vault)
// state closes via account constraint`,
    vested: 1_000,
    withdrawn: 1_000,
    returned: 0,
    active: false,
    transfer: {
      from: 'Vesting Vault',
      to: 'Beneficiary Wallet',
      amount: 800,
      note: 'Final claim',
    },
  },
];

const REVOKE_SNAPSHOTS: FlowSnapshot[] = [
  {
    id: 'init',
    title: 'Initialize & Fund',
    detail: 'Grantor creates the vesting PDA and funds the vault with the full schedule amount.',
    code: `initialize(...)
-> derive PDA(seeds = grantor + beneficiary + mint)
-> transfer_checked(grantor_ata -> vesting_vault, total_amount)
-> vesting_state.is_active = true`,
    vested: 0,
    withdrawn: 0,
    returned: 0,
    active: true,
    transfer: {
      from: 'Grantor Wallet',
      to: 'Vesting Vault',
      amount: 1_000,
      note: 'Funding transfer',
    },
  },
  {
    id: 'vesting',
    title: 'Vesting Progress',
    detail: 'A portion has vested and is available for beneficiary withdrawal.',
    code: `vested = vested_amount(now)
claimable = vested - total_withdrawn`,
    vested: 420,
    withdrawn: 0,
    returned: 0,
    active: true,
  },
  {
    id: 'partial',
    title: 'Partial Withdraw',
    detail: 'Beneficiary withdraws only part of currently vested entitlement.',
    code: `withdraw(200)
require!(available >= 200)
total_withdrawn += 200`,
    vested: 420,
    withdrawn: 200,
    returned: 0,
    active: true,
    transfer: {
      from: 'Vesting Vault',
      to: 'Beneficiary Wallet',
      amount: 200,
      note: 'Partial claim',
    },
  },
  {
    id: 'revoke',
    title: 'Revoke Unvested',
    detail: 'Grantor revokes; only unvested balance returns while vested claim remains.',
    code: `claimable = vested - total_withdrawn
unvested = vault_balance - claimable
transfer_checked(vesting_vault -> grantor_ata, unvested)
state.is_active = false`,
    vested: 420,
    withdrawn: 200,
    returned: 580,
    active: false,
    transfer: {
      from: 'Vesting Vault',
      to: 'Grantor Wallet',
      amount: 580,
      note: 'Unvested returned',
    },
  },
  {
    id: 'close-revoke',
    title: 'Beneficiary Final Claim + Close',
    detail: 'Beneficiary claims remaining vested amount; vault reaches zero and close is allowed.',
    code: `withdraw(remaining_vested)
require_eq!(vesting_vault.amount, 0)
close() -> vault + state close`,
    vested: 420,
    withdrawn: 420,
    returned: 580,
    active: false,
    transfer: {
      from: 'Vesting Vault',
      to: 'Beneficiary Wallet',
      amount: 220,
      note: 'Final vested claim',
    },
  },
];

function buildFlow(snapshots: FlowSnapshot[]): FlowStep[] {
  return snapshots.map((snapshot) => {
    const vault = Math.max(TOTAL_AMOUNT - snapshot.withdrawn - snapshot.returned, 0);
    const claimable = Math.min(Math.max(snapshot.vested - snapshot.withdrawn, 0), vault);
    const beneficiary = snapshot.withdrawn;
    const totalHeld = vault + beneficiary + snapshot.returned;

    return {
      id: snapshot.id,
      title: snapshot.title,
      detail: snapshot.detail,
      code: snapshot.code,
      transfer: snapshot.transfer,
      metrics: {
        vault,
        beneficiary,
        returned: snapshot.returned,
        claimable,
        active: snapshot.active,
        closeable: vault === 0,
        totalHeld,
        isConserved: totalHeld === TOTAL_AMOUNT,
      },
    };
  });
}

const STANDARD_FLOW = buildFlow(STANDARD_SNAPSHOTS);
const REVOKE_FLOW = buildFlow(REVOKE_SNAPSHOTS);

function formatAmount(value: number): string {
  return `${value.toLocaleString()} TOK`;
}

function MetricCard({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-base font-semibold tracking-tight', valueClassName)}>{value}</p>
    </div>
  );
}

export function LandingContractCodeSection() {
  const [mode, setMode] = useState<FlowMode>('revoke');
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const steps = useMemo(() => (mode === 'revoke' ? REVOKE_FLOW : STANDARD_FLOW), [mode]);
  const currentStep = steps[activeStepIndex];

  useEffect(() => {
    if (!isPlaying) return;

    const timer = window.setInterval(() => {
      setActiveStepIndex((previous) => (previous >= steps.length - 1 ? 0 : previous + 1));
    }, STEP_MS);

    return () => window.clearInterval(timer);
  }, [isPlaying, steps.length]);

  const progressPercent = (activeStepIndex / (steps.length - 1)) * 100;
  const vaultPercent = (currentStep.metrics.vault / TOTAL_AMOUNT) * 100;
  const beneficiaryPercent = (currentStep.metrics.beneficiary / TOTAL_AMOUNT) * 100;
  const returnedPercent = (currentStep.metrics.returned / TOTAL_AMOUNT) * 100;

  const handleModeChange = (nextMode: FlowMode) => {
    if (mode === nextMode) return;
    setMode(nextMode);
    setActiveStepIndex(0);
    setIsPlaying(true);
  };

  return (
    <section id="interactive-contract-flow" className="scroll-mt-28">
      <RevealSection>
        <div className="mx-auto max-w-4xl space-y-4 text-center">
          <Badge className="rounded-full border-0 bg-primary px-4 py-1.5 text-primary-foreground">
            Interactive Contract Flow
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Watch the Vesting Contract in Action
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            See how tokens flow through initialization, partial withdrawals, revocation, and closure while maintaining perfect accounting.
          </p>
        </div>
      </RevealSection>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Left Panel - Controls and Metrics */}
        <RevealSection delay={100}>
          <Card className="h-full rounded-2xl border-border bg-card shadow-lg">
            <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
              {/* Mode Toggle */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'revoke' ? 'default' : 'outline'}
                  className={cn(
                    'h-9 rounded-full px-4 inline-flex items-center justify-center gap-2 text-center',
                    mode === 'revoke' &&
                    'bg-emerald-200 text-emerald-800 hover:bg-emerald-300'
                  )}
                  onClick={() => handleModeChange('revoke')}
                >
                  <GitBranch className="size-4 shrink-0" />
                  <span className="leading-none">Revoke Path</span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'standard' ? 'default' : 'outline'}
                  className={cn(
                    'h-9 rounded-full px-4 inline-flex items-center justify-center gap-2 text-center',
                    mode === 'standard' && 'bg-emerald-200 text-emerald-800 hover:bg-emerald-300'
                  )}
                  onClick={() => handleModeChange('standard')}
                >
                  <Coins className="size-4 shrink-0" />
                  <span className="leading-none">Standard Path</span>
                </Button>

                <div className="ml-auto flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setActiveStepIndex((prev) => Math.max(0, prev - 1))}
                    disabled={activeStepIndex === 0}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    className="rounded-full border-0 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)] text-white hover:bg-emerald-500"
                    onClick={() => setIsPlaying((playing) => !playing)}
                  >
                    {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      setActiveStepIndex(0);
                      setIsPlaying(true);
                    }}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setActiveStepIndex((prev) => Math.min(steps.length - 1, prev + 1))}
                    disabled={activeStepIndex === steps.length - 1}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    Step {activeStepIndex + 1} of {steps.length}
                  </span>
                  <span className="font-medium text-foreground">{currentStep.title}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-emerald-600 to-emerald-500 transition-all duration-700"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Step Navigation */}
              <div className="flex flex-wrap items-center justify-between gap-2 overflow-x-auto pb-2 pt-4 px-2">
                {steps.map((step, index) => {
                  const isDone = index < activeStepIndex;
                  const isActive = index === activeStepIndex;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveStepIndex(index)}
                      className="flex flex-col items-center gap-1.5 text-center"
                      disabled={isPlaying}
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-all',
                          isDone &&
                          'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:border-emerald-400/40 dark:bg-emerald-400/15 dark:text-emerald-300',
                          isActive && `bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.8)] text-white hover:bg-emerald-500`,
                          !isDone &&
                          !isActive &&
                          'border-sky-200 bg-sky-50 text-sky-600 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-300'
                        )}
                      >
                        {isDone ? <CheckCircle2 className="size-5" /> : index + 1}
                      </span>
                      <span
                        className={cn(
                          'text-xs transition-colors',
                          isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
                        )}
                      >
                        {step.title.split(' ')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Vault Balance"
                  value={formatAmount(currentStep.metrics.vault)}
                  valueClassName="text-primary"
                />
                <MetricCard
                  label="Beneficiary Received"
                  value={formatAmount(currentStep.metrics.beneficiary)}
                  valueClassName="text-emerald-600 dark:text-emerald-400"
                />
                <MetricCard
                  label="Returned To Grantor"
                  value={formatAmount(currentStep.metrics.returned)}
                  valueClassName="text-amber-600 dark:text-amber-400"
                />
                <MetricCard
                  label="Claimable Now"
                  value={formatAmount(currentStep.metrics.claimable)}
                  valueClassName="text-blue-600 dark:text-blue-400"
                />
              </div>

              {/* Balance Distribution Visualization */}
              <div className="space-y-3 rounded-xl border border-border bg-muted/50 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Balance Distribution</span>
                  <span className="font-medium">{formatAmount(TOTAL_AMOUNT)} total</span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-emerald-600 to-emerald-500 transition-all duration-700"
                        style={{ width: `${vaultPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16">Vault</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                        style={{ width: `${beneficiaryPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16">Beneficiary</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all duration-700"
                        style={{ width: `${returnedPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16">Returned</span>
                  </div>
                </div>
              </div>

              {/* Conservation Check */}
              <div
                className={cn(
                  'rounded-xl border p-4 text-sm',
                  currentStep.metrics.isConserved
                    ? 'border-green-200/50 bg-green-50/30 text-green-800 dark:border-green-800/30 dark:bg-green-950/20 dark:text-green-200'
                    : 'border-destructive/50 bg-destructive/5 text-destructive dark:border-destructive'
                )}
              >
                <p className="font-semibold">Conservation Check</p>
                <p className="mt-1">
                  {formatAmount(currentStep.metrics.vault)} + {formatAmount(currentStep.metrics.beneficiary)} +{' '}
                  {formatAmount(currentStep.metrics.returned)} = {formatAmount(currentStep.metrics.totalHeld)}
                </p>
                <p className="mt-1 text-xs opacity-80">Claimable is a subset of vault balance, not an additional pool.</p>
              </div>
            </CardContent>
          </Card>
        </RevealSection>

        {/* Right Panel - Details and Code (Dark Mode) */}
        <RevealSection delay={180}>
          <Card className="h-full rounded-2xl border-border bg-gray-900 text-gray-100 shadow-lg">
            <CardContent className="flex h-full flex-col gap-5 p-5 sm:p-6">
              {/* Current Step Info */}
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-medium text-blue-300">
                  <span className="size-2 rounded-full bg-blue-400" />
                  Current State
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-white">{currentStep.title}</h3>
                <p className="text-base leading-relaxed text-gray-300">{currentStep.detail}</p>
              </div>

              {/* Contract Code */}

              <div className="flex-1">
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="size-3 rounded-full bg-red-500" />
                    <div className="size-3 rounded-full bg-yellow-500" />
                    <div className="size-3 rounded-full bg-green-500" />
                    <span className="ml-2 text-xs font-medium text-gray-400">Rust/Solidity-like pseudocode</span>
                  </div>
                  <pre className="max-h-40 overflow-y-auto text-xs leading-relaxed text-gray-200 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                    <code className="whitespace-pre-wrap wrap-break-word">{currentStep.code}</code>
                  </pre>
                </div>
              </div>

              {/* Live Transfer */}
              <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
                <h4 className="mb-3 text-sm font-semibold text-gray-200">Live Transfer</h4>
                {currentStep.transfer ? (
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/20 px-3 py-1.5 text-sm font-medium text-blue-300">
                      <ArrowRightLeft className="size-4" />
                      {currentStep.transfer.note}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="rounded-lg bg-gray-700 px-3 py-2 text-sm">
                        <span className="font-medium text-gray-200">{currentStep.transfer.from}</span>
                      </div>
                      <ArrowRight className="size-5 text-blue-400" />
                      <div className="rounded-lg bg-gray-700 px-3 py-2 text-sm">
                        <span className="font-medium text-gray-200">{currentStep.transfer.to}</span>
                      </div>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-blue-300">{formatAmount(currentStep.transfer.amount)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-24 items-center justify-center rounded-lg bg-gray-700/50">
                    <p className="text-gray-400">No token transfer in this step</p>
                  </div>
                )}
              </div>

              {/* Status Indicators */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                  <div className="mb-2 flex items-center gap-2 text-gray-400">
                    <Shield className="size-4" />
                    <span className="text-sm font-medium">Status</span>
                  </div>
                  <p className={cn('font-semibold', currentStep.metrics.active ? 'text-emerald-400' : 'text-gray-400')}>
                    {currentStep.metrics.active ? 'Active Vesting' : 'Inactive/Revoked'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-3">
                  <div className="mb-2 flex items-center gap-2 text-gray-400">
                    <Lock className="size-4" />
                    <span className="text-sm font-medium">Close Ready</span>
                  </div>
                  <p className={cn('font-semibold', currentStep.metrics.closeable ? 'text-emerald-400' : 'text-gray-400')}>
                    {currentStep.metrics.closeable ? 'Yes - Vault Empty' : 'No - Tokens Remain'}
                  </p>
                </div>
              </div>

              {/* Balance Summary */}
              <div className="mt-auto grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-center">
                  <Wallet className="mx-auto mb-2 size-5 text-amber-400" />
                  <p className="text-xs text-gray-400">Returned</p>
                  <p className="font-semibold text-gray-200">{formatAmount(currentStep.metrics.returned)}</p>
                </div>
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-center">
                  <Coins className="mx-auto mb-2 size-5 text-blue-400" />
                  <p className="text-xs text-gray-400">In Vault</p>
                  <p className="font-semibold text-gray-200">{formatAmount(currentStep.metrics.vault)}</p>
                </div>
                <div className="rounded-xl border border-gray-700 bg-gray-800 p-3 text-center">
                  <Wallet className="mx-auto mb-2 size-5 text-emerald-400" />
                  <p className="text-xs text-gray-400">Received</p>
                  <p className="font-semibold text-gray-200">{formatAmount(currentStep.metrics.beneficiary)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </RevealSection>
      </div>
    </section>
  );
}
