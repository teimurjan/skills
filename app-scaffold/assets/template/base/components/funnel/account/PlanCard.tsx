import { ICONS, PROBLEM_CARD, Tick } from "../RecapStep";

/** The recap's red card carried onto the account step, with the line of the plan that answers
 * it, so the screen reads as saving *their* plan rather than as making an account. */
export function PlanCard({ problem, fix }: { problem: string; fix: string }) {
  return (
    <div className={`flex flex-col gap-2.5 px-4 py-3.5 ${PROBLEM_CARD}`}>
      <div className="flex items-center gap-3">
        <span className="shrink-0">{ICONS.problem}</span>
        <p className="min-w-0 text-[15.5px] font-medium leading-[1.4] text-ink">{problem}</p>
      </div>
      <div className="flex items-center gap-3 border-t border-alert/20 pt-2.5">
        <span className="flex w-5 shrink-0 justify-center text-ink">
          <Tick />
        </span>
        <p className="min-w-0 text-[15px] leading-[1.4] text-ink">{fix}</p>
      </div>
    </div>
  );
}
