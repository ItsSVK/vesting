import { useVestingContext } from '../../context/VestingDashboardContext';

export function BackgroundDecor() {
  const { scrollY } = useVestingContext();

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute top-[-140px] left-1/2 h-80 w-80 rounded-full bg-sky-300/30 blur-3xl dark:bg-sky-500/25"
        style={{ transform: `translate3d(-50%, ${scrollY * 0.12}px, 0)` }}
      />
      <div
        className="absolute right-[-120px] top-[28%] h-72 w-72 rounded-full bg-emerald-200/35 blur-3xl dark:bg-emerald-500/20"
        style={{ transform: `translate3d(0, ${scrollY * -0.08}px, 0)` }}
      />
      <div
        className="absolute bottom-[-120px] left-[12%] h-72 w-72 rounded-full bg-neutral-200/60 blur-3xl dark:bg-white/10"
        style={{ transform: `translate3d(0, ${scrollY * 0.06}px, 0)` }}
      />
    </div>
  );
}
