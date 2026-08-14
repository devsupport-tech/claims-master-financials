import { BudgetCommissionsTab } from './BudgetCommissionsTab'
import { ContractorSettlement } from './ContractorSettlement'

export function BudgetSettlementTab({ claimRef, refreshSignal = 0, onChanged }: {
  claimRef: string
  refreshSignal?: number
  onChanged?: () => void
}) {
  return <div className="space-y-6"><ContractorSettlement claimRef={claimRef} refreshSignal={refreshSignal} onChanged={onChanged} /><BudgetCommissionsTab claimRef={claimRef} refreshSignal={refreshSignal} onChanged={onChanged} /></div>
}
