import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createProjectExpense, updateProjectExpense } from '@/lib/airtable'
import type { ProjectExpense, ProjectExpenseCategory } from '@/types'

interface ProjectExpenseFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  claimRecordId: string
  moduleRecordId: string
  serviceName: string
  onSuccess: () => void
  editRecord?: ProjectExpense | null
}

const CATEGORIES: ProjectExpenseCategory[] = [
  'Third party contractors',
  'Materials',
  'Labor Cost',
  'General Expenses and Outflows',
  'Others',
]

const INITIAL_STATE = {
  'Cost Name': '',
  'Project Expense Category': '' as ProjectExpenseCategory | '',
  'Billing Entity': '',
  Amount: 0,
  'Invoice Number': '',
  'Invoice Date': '',
  'Scope Notes': '',
}

type Errors = Partial<Record<string, string>>

export function ProjectExpenseForm({
  open,
  onOpenChange,
  claimRecordId,
  moduleRecordId,
  serviceName,
  onSuccess,
  editRecord,
}: ProjectExpenseFormProps) {
  const [form, setForm] = useState({ ...INITIAL_STATE })
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!editRecord

  useEffect(() => {
    if (open && editRecord) {
      setForm({
        'Cost Name': editRecord['Cost Name'] || '',
        'Project Expense Category': (editRecord['Project Expense Category'] as ProjectExpenseCategory) || '',
        'Billing Entity': editRecord['Billing Entity'] || '',
        Amount: editRecord.Amount || 0,
        'Invoice Number': editRecord['Invoice Number'] || '',
        'Invoice Date': editRecord['Invoice Date'] || '',
        'Scope Notes': editRecord['Scope Notes'] || '',
      })
    } else if (open) {
      setForm({ ...INITIAL_STATE })
    }
    setErrors({})
  }, [open, editRecord])

  function updateField<K extends keyof typeof INITIAL_STATE>(field: K, value: (typeof INITIAL_STATE)[K]) {
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
    if (!form['Cost Name'].trim()) e['Cost Name'] = 'Cost name is required'
    if (!form['Project Expense Category']) e['Project Expense Category'] = 'Category is required'
    if (!form['Billing Entity'].trim()) e['Billing Entity'] = 'Billing entity is required'
    if (!form.Amount || form.Amount <= 0) e.Amount = 'Amount must be greater than zero'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const payload: Record<string, any> = {
        'Cost Name': form['Cost Name'],
        'Project Expense Category': form['Project Expense Category'],
        'Billing Entity': form['Billing Entity'],
        Amount: Number(form.Amount) || 0,
      }
      if (form['Invoice Number']) payload['Invoice Number'] = form['Invoice Number']
      if (form['Invoice Date']) payload['Invoice Date'] = form['Invoice Date']
      if (form['Scope Notes']) payload['Scope Notes'] = form['Scope Notes']
      if (!isEditing) {
        payload.Claim = [claimRecordId]
        payload['Module Record ID'] = moduleRecordId
      }

      if (isEditing) {
        await updateProjectExpense(editRecord!.id, payload)
      } else {
        await createProjectExpense(payload)
      }
      setForm({ ...INITIAL_STATE })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} project expense:`, err)
      alert(`Failed to ${isEditing ? 'update' : 'create'} project expense. Check the console for details.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  function fieldClass(field: string) {
    return errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Project Expense' : `New Project Expense — ${serviceName}`}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this cost entry.' : 'Add a cost to pay for this service.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="costName">Cost Name *</Label>
            <Input
              id="costName"
              placeholder="e.g. Drywall install — Johnson Crew"
              className={fieldClass('Cost Name')}
              value={form['Cost Name']}
              onChange={(e) => updateField('Cost Name', e.target.value)}
            />
            {errors['Cost Name'] && <p className="text-xs text-red-500">{errors['Cost Name']}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Project Expenses *</Label>
            <Select
              value={form['Project Expense Category']}
              onValueChange={(v) => updateField('Project Expense Category', v as ProjectExpenseCategory)}
            >
              <SelectTrigger id="category" className={fieldClass('Project Expense Category')}>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors['Project Expense Category'] && (
              <p className="text-xs text-red-500">{errors['Project Expense Category']}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="billingEntity">Billing Entity *</Label>
            <Input
              id="billingEntity"
              placeholder="Who do we pay?"
              className={fieldClass('Billing Entity')}
              value={form['Billing Entity']}
              onChange={(e) => updateField('Billing Entity', e.target.value)}
            />
            {errors['Billing Entity'] && <p className="text-xs text-red-500">{errors['Billing Entity']}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                className={fieldClass('Amount')}
                value={form.Amount || ''}
                onChange={(e) => updateField('Amount', parseFloat(e.target.value) || 0)}
              />
              {errors.Amount && <p className="text-xs text-red-500">{errors.Amount}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice Date</Label>
              <Input
                id="invoiceDate"
                type="date"
                value={form['Invoice Date']}
                onChange={(e) => updateField('Invoice Date', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">Invoice Number</Label>
            <Input
              id="invoiceNumber"
              value={form['Invoice Number']}
              onChange={(e) => updateField('Invoice Number', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="scopeNotes">Scope / Notes</Label>
            <Textarea
              id="scopeNotes"
              rows={3}
              value={form['Scope Notes']}
              onChange={(e) => updateField('Scope Notes', e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
