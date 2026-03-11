import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createJobCost, updateJobCost } from '@/lib/airtable'

interface JobCostFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  claimRecordId: string
  onSuccess: () => void
  editRecord?: { id: string; [key: string]: any } | null
}

const INITIAL_STATE = {
  'Cost Name': '',
  'Trade Category': '',
  'Vendor/Subcontractor': '',
  'Xactimate Budget': 0,
  'Actual Cost': 0,
  'Invoice Number': '',
  'Invoice Date': '',
  'Payment Status': 'Not Invoiced',
  'Scope Description': '',
  Notes: '',
}

type Errors = Partial<Record<string, string>>

export function JobCostForm({ open, onOpenChange, claimRecordId, onSuccess, editRecord }: JobCostFormProps) {
  const [form, setForm] = useState({ ...INITIAL_STATE })
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!editRecord

  useEffect(() => {
    if (open && editRecord) {
      setForm({
        'Cost Name': editRecord['Cost Name'] || '',
        'Trade Category': editRecord['Trade Category'] || '',
        'Vendor/Subcontractor': editRecord['Vendor/Subcontractor'] || '',
        'Xactimate Budget': editRecord['Xactimate Budget'] || 0,
        'Actual Cost': editRecord['Actual Cost'] || 0,
        'Invoice Number': editRecord['Invoice Number'] || '',
        'Invoice Date': editRecord['Invoice Date'] || '',
        'Payment Status': editRecord['Payment Status'] || 'Not Invoiced',
        'Scope Description': editRecord['Scope Description'] || '',
        Notes: editRecord.Notes || '',
      })
    } else if (open) {
      setForm({ ...INITIAL_STATE })
    }
    setErrors({})
  }, [open, editRecord])

  function updateField(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
  }

  function validate(): boolean {
    const e: Errors = {}
    if (!form['Cost Name'].trim()) e['Cost Name'] = 'Cost name is required'
    if (!form['Trade Category'].trim()) e['Trade Category'] = 'Trade category is required'
    if (!form['Vendor/Subcontractor'].trim()) e['Vendor/Subcontractor'] = 'Vendor is required'
    if (form['Xactimate Budget'] < 0) e['Xactimate Budget'] = 'Budget cannot be negative'
    if (!form['Xactimate Budget']) e['Xactimate Budget'] = 'Budget is required'
    if (form['Actual Cost'] < 0) e['Actual Cost'] = 'Cost cannot be negative'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const budget = form['Xactimate Budget'] || 0
      const actual = form['Actual Cost'] || 0
      const variance = budget - actual
      const variancePercent = budget > 0 ? variance / budget : 0

      const payload: Record<string, any> = {
        ...form,
        Variance: variance,
        'Variance Percent': variancePercent,
      }
      if (!isEditing) {
        payload.Claim = [claimRecordId]
      }
      if (!payload['Invoice Number']) delete payload['Invoice Number']
      if (!payload['Invoice Date']) delete payload['Invoice Date']
      if (!payload['Scope Description']) delete payload['Scope Description']
      if (!payload.Notes) delete payload.Notes

      if (isEditing) {
        await updateJobCost(editRecord!.id, payload)
      } else {
        await createJobCost(payload)
      }
      setForm({ ...INITIAL_STATE })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} job cost:`, err)
      alert(`Failed to ${isEditing ? 'update' : 'create'} job cost. Check the console for details.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  function fieldClass(field: string) {
    return errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''
  }

  const variance = (form['Xactimate Budget'] || 0) - (form['Actual Cost'] || 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Job Cost' : 'New Job Cost'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update this trade cost entry.' : 'Add a trade cost entry for this claim.'}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="costName">Cost Name *</Label>
            <Input id="costName" placeholder="e.g. Roofing - Johnson" className={fieldClass('Cost Name')} value={form['Cost Name']} onChange={(e) => updateField('Cost Name', e.target.value)} />
            {errors['Cost Name'] && <p className="text-xs text-red-500">{errors['Cost Name']}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tradeCategory">Trade Category *</Label>
              <Input id="tradeCategory" placeholder="e.g. Roofing, Siding" className={fieldClass('Trade Category')} value={form['Trade Category']} onChange={(e) => updateField('Trade Category', e.target.value)} />
              {errors['Trade Category'] && <p className="text-xs text-red-500">{errors['Trade Category']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="vendor">Vendor/Subcontractor *</Label>
              <Input id="vendor" className={fieldClass('Vendor/Subcontractor')} value={form['Vendor/Subcontractor']} onChange={(e) => updateField('Vendor/Subcontractor', e.target.value)} />
              {errors['Vendor/Subcontractor'] && <p className="text-xs text-red-500">{errors['Vendor/Subcontractor']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="budget">Xactimate Budget ($) *</Label>
              <Input id="budget" type="number" step="0.01" min="0" className={fieldClass('Xactimate Budget')} value={form['Xactimate Budget'] || ''} onChange={(e) => updateField('Xactimate Budget', parseFloat(e.target.value) || 0)} />
              {errors['Xactimate Budget'] && <p className="text-xs text-red-500">{errors['Xactimate Budget']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="actualCost">Actual Cost ($)</Label>
              <Input id="actualCost" type="number" step="0.01" min="0" className={fieldClass('Actual Cost')} value={form['Actual Cost'] || ''} onChange={(e) => updateField('Actual Cost', parseFloat(e.target.value) || 0)} />
              {errors['Actual Cost'] && <p className="text-xs text-red-500">{errors['Actual Cost']}</p>}
            </div>
          </div>

          {(form['Xactimate Budget'] > 0 || form['Actual Cost'] > 0) && (
            <div className={`text-sm px-3 py-2 rounded-md ${variance >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              Variance: ${variance.toLocaleString('en-US', { minimumFractionDigits: 2 })} {variance >= 0 ? '(under budget)' : '(over budget)'}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Invoice Number</Label>
              <Input id="invoiceNumber" value={form['Invoice Number']} onChange={(e) => updateField('Invoice Number', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invoiceDate">Invoice Date</Label>
              <Input id="invoiceDate" type="date" value={form['Invoice Date']} onChange={(e) => updateField('Invoice Date', e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentStatus">Payment Status *</Label>
            <Select value={form['Payment Status']} onValueChange={(v) => updateField('Payment Status', v)}>
              <SelectTrigger id="paymentStatus"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Not Invoiced">Not Invoiced</SelectItem>
                <SelectItem value="Invoiced">Invoiced</SelectItem>
                <SelectItem value="Partially Paid">Partially Paid</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scopeDescription">Scope Description</Label>
            <Textarea id="scopeDescription" rows={2} value={form['Scope Description']} onChange={(e) => updateField('Scope Description', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={form.Notes} onChange={(e) => updateField('Notes', e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Add Cost')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
