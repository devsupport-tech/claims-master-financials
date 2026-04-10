import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createLedgerEntry, updateLedgerEntry } from '@/lib/airtable'

interface LedgerEntryFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  claimRecordId: string
  onSuccess: () => void
  editRecord?: { id: string; [key: string]: any } | null
}

const DIRECTION_MAP: Record<string, string> = {
  'Insurance Payment': 'Inflow',
  'Homeowner Payment': 'Inflow',
  'Mortgage Release': 'Inflow',
  'Vendor Payment': 'Outflow',
  'Adjustment': '',
}

const INITIAL_STATE = {
  'Entry Name': '',
  'Entry Type': '',
  Direction: '',
  Amount: '',
  Date: new Date().toISOString().split('T')[0],
  'Check Number': '',
  'Payer/Payee': '',
  Category: '',
  Description: '',
  Reconciled: false,
  Notes: '',
}

type Errors = Partial<Record<string, string>>

export function LedgerEntryForm({ open, onOpenChange, claimRecordId, onSuccess, editRecord }: LedgerEntryFormProps) {
  const [form, setForm] = useState({ ...INITIAL_STATE })
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!editRecord

  useEffect(() => {
    if (open && editRecord) {
      setForm({
        'Entry Name': editRecord['Entry Name'] || '',
        'Entry Type': editRecord['Entry Type'] || '',
        Direction: editRecord.Direction || '',
        Amount: editRecord.Amount || '',
        Date: editRecord.Date || new Date().toISOString().split('T')[0],
        'Check Number': editRecord['Check Number'] || '',
        'Payer/Payee': editRecord['Payer/Payee'] || '',
        Category: editRecord.Category || '',
        Description: editRecord.Description || '',
        Reconciled: editRecord.Reconciled || false,
        Notes: editRecord.Notes || '',
      })
    } else if (open) {
      setForm({ ...INITIAL_STATE })
    }
    setErrors({})
  }, [open, editRecord])

  function updateField(field: string, value: string | number | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
  }

  function handleEntryTypeChange(value: string) {
    const direction = DIRECTION_MAP[value] || form.Direction
    setForm((prev) => ({ ...prev, 'Entry Type': value, Direction: direction }))
    if (errors['Entry Type']) setErrors((prev) => { const n = { ...prev }; delete n['Entry Type']; return n })
  }

  function validate(): boolean {
    const e: Errors = {}
    if (!form['Entry Name'].trim()) e['Entry Name'] = 'Entry name is required'
    if (!form['Entry Type']) e['Entry Type'] = 'Entry type is required'
    if (!form.Direction) e['Direction'] = 'Direction is required'
    if (!form.Amount || form.Amount <= 0) e['Amount'] = 'Amount must be greater than 0'
    if (!form.Date) e['Date'] = 'Date is required'
    if (!form['Payer/Payee'].trim()) e['Payer/Payee'] = 'Payer/Payee is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const payload: Record<string, any> = { ...form }
      if (!isEditing) {
        payload.Claim = [claimRecordId]
      }
      if (!payload['Check Number']) delete payload['Check Number']
      if (!payload.Category) delete payload.Category
      if (!payload.Description) delete payload.Description
      if (!payload.Notes) delete payload.Notes

      if (isEditing) {
        await updateLedgerEntry(editRecord!.id, payload)
      } else {
        await createLedgerEntry(payload)
      }
      setForm({ ...INITIAL_STATE })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} ledger entry:`, err)
      alert(`Failed to ${isEditing ? 'update' : 'create'} ledger entry. Check the console for details.`)
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
          <DialogTitle>{isEditing ? 'Edit Ledger Entry' : 'New Ledger Entry'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update this financial transaction.' : 'Add a financial transaction to this claim.'}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="entryName">Entry Name *</Label>
            <Input id="entryName" placeholder="e.g. Initial Insurance Payment" className={fieldClass('Entry Name')} value={form['Entry Name']} onChange={(e) => updateField('Entry Name', e.target.value)} />
            {errors['Entry Name'] && <p className="text-xs text-red-500">{errors['Entry Name']}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryType">Entry Type *</Label>
              <Select value={form['Entry Type']} onValueChange={handleEntryTypeChange}>
                <SelectTrigger id="entryType" className={errors['Entry Type'] ? 'border-red-500' : ''}><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Insurance Payment">Insurance Payment</SelectItem>
                  <SelectItem value="Homeowner Payment">Homeowner Payment</SelectItem>
                  <SelectItem value="Mortgage Release">Mortgage Release</SelectItem>
                  <SelectItem value="Vendor Payment">Vendor Payment</SelectItem>
                  <SelectItem value="Adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
              {errors['Entry Type'] && <p className="text-xs text-red-500">{errors['Entry Type']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="direction">Direction *</Label>
              <Select value={form.Direction} onValueChange={(v) => updateField('Direction', v)}>
                <SelectTrigger id="direction" className={errors['Direction'] ? 'border-red-500' : ''}><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inflow">Inflow</SelectItem>
                  <SelectItem value="Outflow">Outflow</SelectItem>
                </SelectContent>
              </Select>
              {errors['Direction'] && <p className="text-xs text-red-500">{errors['Direction']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount ($) *</Label>
              <Input id="amount" type="number" step="0.01" min="0" className={fieldClass('Amount')} value={form.Amount || ''} onChange={(e) => updateField('Amount', parseFloat(e.target.value) || 0)} />
              {errors['Amount'] && <p className="text-xs text-red-500">{errors['Amount']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input id="date" type="date" className={fieldClass('Date')} value={form.Date} onChange={(e) => updateField('Date', e.target.value)} />
              {errors['Date'] && <p className="text-xs text-red-500">{errors['Date']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="payerPayee">Payer/Payee *</Label>
              <Input id="payerPayee" className={fieldClass('Payer/Payee')} value={form['Payer/Payee']} onChange={(e) => updateField('Payer/Payee', e.target.value)} />
              {errors['Payer/Payee'] && <p className="text-xs text-red-500">{errors['Payer/Payee']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="checkNumber">Check Number</Label>
              <Input id="checkNumber" value={form['Check Number']} onChange={(e) => updateField('Check Number', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={form.Category} onChange={(e) => updateField('Category', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} value={form.Description} onChange={(e) => updateField('Description', e.target.value)} />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox id="reconciled" checked={form.Reconciled} onChange={(e) => updateField('Reconciled', (e.target as HTMLInputElement).checked)} />
            <Label htmlFor="reconciled">Reconciled</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={form.Notes} onChange={(e) => updateField('Notes', e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Add Entry')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
