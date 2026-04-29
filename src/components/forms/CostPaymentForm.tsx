import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createCostPayment } from '@/lib/airtable'
import type { CostPaymentMethod, ProjectExpense } from '@/types'

interface CostPaymentFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  expense: ProjectExpense | null
  balanceDue: number
  onSuccess: () => void
}

const METHODS: CostPaymentMethod[] = ['Check', 'Cash', 'Wire', 'Credit Card', 'Other']

interface FormState {
  Amount: number
  'Payment Date': string
  Method: CostPaymentMethod | ''
  'Check Number': string
  Notes: string
}

function initialState(balanceDue: number): FormState {
  return {
    Amount: balanceDue > 0 ? balanceDue : 0,
    'Payment Date': new Date().toISOString().slice(0, 10),
    Method: '',
    'Check Number': '',
    Notes: '',
  }
}

type Errors = Partial<Record<keyof FormState, string>>

export function CostPaymentForm({
  open,
  onOpenChange,
  expense,
  balanceDue,
  onSuccess,
}: CostPaymentFormProps) {
  const [form, setForm] = useState<FormState>(initialState(balanceDue))
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialState(balanceDue))
      setErrors({})
    }
  }, [open, balanceDue])

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const n = { ...prev }
        delete n[field]
        return n
      })
    }
  }

  function validate(): boolean {
    const e: Errors = {}
    if (!form.Amount || form.Amount <= 0) e.Amount = 'Amount must be greater than zero'
    if (!form['Payment Date']) e['Payment Date'] = 'Payment date is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || !expense) return
    setIsSubmitting(true)
    try {
      const billing = expense['Billing Entity'] || 'Payment'
      const payload: Record<string, any> = {
        'Payment Name': `${billing} · ${form['Payment Date']}`,
        'Project Expense': [expense.id],
        Amount: Number(form.Amount) || 0,
        'Payment Date': form['Payment Date'],
      }
      if (form.Method) payload.Method = form.Method
      if (form['Check Number']) payload['Check Number'] = form['Check Number']
      if (form.Notes) payload.Notes = form.Notes

      await createCostPayment(payload)
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error('Failed to log cost payment:', err)
      alert('Failed to log payment. Check the console for details.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function fieldClass(field: keyof FormState) {
    return errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Log Payment</DialogTitle>
          <DialogDescription>
            {expense
              ? `Record a payment toward ${expense['Billing Entity'] || expense['Cost Name'] || 'this expense'}.`
              : 'Record a payment toward this expense.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Amount *</Label>
              <Input
                id="paymentAmount"
                type="number"
                step="0.01"
                min="0"
                className={fieldClass('Amount')}
                value={form.Amount || ''}
                onChange={(e) => updateField('Amount', parseFloat(e.target.value) || 0)}
              />
              {errors.Amount && <p className="text-xs text-red-500">{errors.Amount}</p>}
              {balanceDue > 0 && (
                <p className="text-xs text-muted-foreground">
                  Balance due: ${balanceDue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentDate">Payment Date *</Label>
              <Input
                id="paymentDate"
                type="date"
                className={fieldClass('Payment Date')}
                value={form['Payment Date']}
                onChange={(e) => updateField('Payment Date', e.target.value)}
              />
              {errors['Payment Date'] && <p className="text-xs text-red-500">{errors['Payment Date']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="method">Method</Label>
              <Select value={form.Method} onValueChange={(v) => updateField('Method', v as CostPaymentMethod)}>
                <SelectTrigger id="method">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkNumber">Check Number</Label>
              <Input
                id="checkNumber"
                value={form['Check Number']}
                onChange={(e) => updateField('Check Number', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentNotes">Notes</Label>
            <Textarea
              id="paymentNotes"
              rows={2}
              value={form.Notes}
              onChange={(e) => updateField('Notes', e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Log Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
