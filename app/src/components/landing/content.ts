import {
  ArrowDownToLine,
  CircleDollarSign,
  Lock,
  ShieldCheck,
  ShieldX,
  Sparkles,
  ArrowUpToLine,
  Waypoints,
  FileCode2,
  type LucideIcon,
} from 'lucide-react';

export interface LandingFlowStep {
  title: string;
  description: string;
  highlight: string;
  icon: LucideIcon;
  accentClass: string;
}

export const FLOW_STEPS: LandingFlowStep[] = [
  {
    title: 'Initialize & Fund',
    description: 'Grantor creates a mint-scoped vesting PDA and funds the vault in one transaction.',
    highlight: 'Deterministic seeds: grantor + beneficiary + mint',
    icon: ArrowUpToLine,
    accentClass: 'from-sky-400/30 via-cyan-300/15 to-transparent',
  },
  {
    title: 'Partial Withdrawals',
    description: 'Beneficiary can withdraw any amount up to what is currently vested, not only full claims.',
    highlight: 'Whole-token input with explicit max checks',
    icon: ArrowDownToLine,
    accentClass: 'from-emerald-400/30 via-teal-300/15 to-transparent',
  },
  {
    title: 'Safe Revoke',
    description: 'Grantor revokes active vesting; only unvested tokens return while vested entitlement remains.',
    highlight: 'State flips inactive and preserves beneficiary claim',
    icon: ShieldX,
    accentClass: 'from-orange-400/30 via-amber-300/15 to-transparent',
  },
  {
    title: 'Clean Close',
    description: 'Close is allowed only when the vault is empty, preventing accidental schedule loss.',
    highlight: 'Vault balance must be zero before close',
    icon: Lock,
    accentClass: 'from-violet-400/30 via-indigo-300/15 to-transparent',
  },
];

export interface LandingTrustPoint {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const TRUST_POINTS: LandingTrustPoint[] = [
  {
    title: 'Mint-aware isolation',
    description: 'Including mint in the seed lets the same grantor-beneficiary pair run separate schedules per token.',
    icon: Waypoints,
  },
  {
    title: 'Action-level constraints',
    description: 'Only beneficiary can withdraw, only grantor can revoke/close, with PDA and ATA constraints enforced on-chain.',
    icon: ShieldCheck,
  },
  {
    title: 'Predictable accounting',
    description: 'Cliff, frequency, total withdrawn, and active state are tracked on-chain for deterministic vesting math.',
    icon: CircleDollarSign,
  },
  {
    title: 'Fully auditable & transparent',
    description: 'The smart contract and application code are open-source, allowing anyone to verify the security and logic.',
    icon: FileCode2,
  },
];

export const HERO_CHIPS: Array<{ label: string; icon: LucideIcon }> = [
  { label: 'Partial Withdraw Support', icon: ArrowDownToLine },
  { label: 'Revocation with Vested Protection', icon: ShieldX },
  { label: 'Programmatic Safety Checks', icon: Sparkles },
];
