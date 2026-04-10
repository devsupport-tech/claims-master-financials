import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createMortgageRelease, updateMortgageRelease } from '@/lib/airtable'

interface MortgageReleaseFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  claimRecordId: string
  onSuccess: () => void
  editRecord?: { id: string; [key: string]: any } | null
}

const INITIAL_STATE = {
  'Release Name': '',
  'Mortgage Company': '',
  'Loan Number': '',
  'Total Held by Mortgage': '',
  'Release Number': 1,
  'Release Amount': '',
  'Cumulative Released': '',
  'Remaining Held': '',
  'Request Date': new Date().toISOString().split('T')[0],
  'Documents Submitted': false,
  'Inspection Required': false,
  'Inspection Status': 'Not Required',
  'Release Status': 'Pending Documents',
  'Contact Name': '',
  'Contact Phone': '',
  'Contact Email': '',
  Notes: '',
}

type Errors = Partial<Record<string, string>>

export function MortgageReleaseForm({ open, onOpenChange, claimRecordId, onSuccess, editRecord }: MortgageReleaseFormProps) {
  const [form, setForm] = useState({ ...INITIAL_STATE })
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!editRecord

  useEffect(() => {
    if (open && editRecord) {
      setForm({
        'Release Name': editRecord['Release Name'] || '',
        'Mortgage Company': editRecord['Mortgage Company'] || '',
        'Loan Number': editRecord['Loan Number'] || '',
        'Total Held by Mortgage': editRecord['Total Held by Mortgage'] || '',
        'Release Number': editRecord['Release Number'] || 1,
        'Release Amount': editRecord['Release Amount'] || '',
        'Cumulative Released': editRecord['Cumulative Released'] || '',
        'Remaining Held': editRecord['Remaining Held'] || '',
        'Request Date': editRecord['Request Date'] || new Date().toISOString().split('T')[0],
        'Documents Submitted': editRecord['Documents Submitted'] || false,
        'Inspection Required': editRecord['Inspection Required'] || false,
        'Inspection Status': editRecord['Inspection Status'] || 'Not Required',
        'Release Status': editRecord['Release Status'] || 'Pending Documents',
        'Contact Name': editRecord['Contact Name'] || '',
        'Contact Phone': editRecord['Contact Phone'] || '',
        'Contact Email': editRecord['Contact Email'] || '',
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

  function validate(): boolean {
    const e: Errors = {}
    if (!form['Release Name'].trim()) e['Release Name'] = 'Release name is required'
    if (!form['Mortgage Company'].trim()) e['Mortgage Company'] = 'Mortgage company is required'
    if (!form['Loan Number'].trim()) e['Loan Number'] = 'Loan number is required'
    if (form['Total Held by Mortgage'] < 0) e['Total Held by Mortgage'] = 'Amount cannot be negative'
    if (form['Release Amount'] < 0) e['Release Amount'] = 'Amount cannot be negative'
    if (!form['Release Amount']) e['Release Amount'] = 'Release amount is required'
    if (!form['Request Date']) e['Request Date'] = 'Request date is required'
    if (form['Release Number'] < 1) e['Release Number'] = 'Must be at least 1'
    if (form['Contact Email'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form['Contact Email'])) {
      e['Contact Email'] = 'Invalid email format'
    }
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
      if (!payload['Contact Name']) delete payload['Contact Name']
      if (!payload['Contact Phone']) delete payload['Contact Phone']
      if (!payload['Contact Email']) delete payload['Contact Email']
      if (!payload.Notes) delete payload.Notes

      if (isEditing) {
        await updateMortgageRelease(editRecord!.id, payload)
      } else {
        await createMortgageRelease(payload)
      }
      setForm({ ...INITIAL_STATE })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} mortgage release:`, err)
      alert(`Failed to ${isEditing ? 'update' : 'create'} mortgage release. Check the console for details.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  function fieldClass(field: string) {
    return errors[field] ? 'border-red-500 focus-visible:ring-red-500' : ''
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Mortgage Release' : 'New Mortgage Release'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update this mortgage release.' : 'Track a mortgage release request.'}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="releaseName">Release Name *</Label>
            <Input id="releaseName" placeholder="e.g. Release #1 - Williams" className={fieldClass('Release Name')} value={form['Release Name']} onChange={(e) => updateField('Release Name', e.target.value)} />
            {errors['Release Name'] && <p className="text-xs text-red-500">{errors['Release Name']}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mortgageCompany">Mortgage Company *</Label>
              <Input id="mortgageCompany" className={fieldClass('Mortgage Company')} value={form['Mortgage Company']} onChange={(e) => updateField('Mortgage Company', e.target.value)} />
              {errors['Mortgage Company'] && <p className="text-xs text-red-500">{errors['Mortgage Company']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="loanNumber">Loan Number *</Label>
              <Input id="loanNumber" className={fieldClass('Loan Number')} value={form['Loan Number']} onChange={(e) => updateField('Loan Number', e.target.value)} />
              {errors['Loan Number'] && <p className="text-xs text-red-500">{errors['Loan Number']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="totalHeld">Total Held by Mortgage ($) *</Label>
              <Input id="totalHeld" type="number" step="0.01" min="0" className={fieldClass('Total Held by Mortgage')} value={form['Total Held by Mortgage'] || ''} onChange={(e) => updateField('Total Held by Mortgage', parseFloat(e.target.value) || 0)} />
              {errors['Total Held by Mortgage'] && <p className="text-xs text-red-500">{errors['Total Held by Mortgage']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="releaseNumber">Release Number *</Label>
              <Input id="releaseNumber" type="number" step="1" min="1" className={fieldClass('Release Number')} value={form['Release Number']} onChange={(e) => updateField('Release Number', parseInt(e.target.value) || 1)} />
              {errors['Release Number'] && <p className="text-xs text-red-500">{errors['Release Number']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="releaseAmount">Release Amount ($) *</Label>
              <Input id="releaseAmount" type="number" step="0.01" min="0" className={fieldClass('Release Amount')} value={form['Release Amount'] || ''} onChange={(e) => updateField('Release Amount', parseFloat(e.target.value) || 0)} />
              {errors['Release Amount'] && <p className="text-xs text-red-500">{errors['Release Amount']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cumulativeReleased">Cumulative Released ($)</Label>
              <Input id="cumulativeReleased" type="number" step="0.01" min="0" value={form['Cumulative Released'] || ''} onChange={(e) => updateField('Cumulative Released', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="remainingHeld">Remaining Held ($)</Label>
              <Input id="remainingHeld" type="number" step="0.01" min="0" value={form['Remaining Held'] || ''} onChange={(e) => updateField('Remaining Held', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="requestDate">Request Date *</Label>
              <Input id="requestDate" type="date" className={fieldClass('Request Date')} value={form['Request Date']} onChange={(e) => updateField('Request Date', e.target.value)} />
              {errors['Request Date'] && <p className="text-xs text-red-500">{errors['Request Date']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="releaseStatus">Release Status *</Label>
              <Select value={form['Release Status']} onValueChange={(v) => updateField('Release Status', v)}>
                <SelectTrigger id="releaseStatus"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending Documents">Pending Documents</SelectItem>
                  <SelectItem value="Documents Submitted">Documents Submitted</SelectItem>
                  <SelectItem value="Under Review">Under Review</SelectItem>
                  <SelectItem value="Inspection Scheduled">Inspection Scheduled</SelectItem>
                  <SelectItem value="Check Issued">Check Issued</SelectItem>
                  <SelectItem value="Check Received">Check Received</SelectItem>
                  <SelectItem value="Deposited">Deposited</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <Checkbox id="docsSubmitted" checked={form['Documents Submitted']} onChange={(e) => updateField('Documents Submitted', (e.target as HTMLInputElement).checked)} />
              <Label htmlFor="docsSubmitted">Documents Submitted</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="inspectionRequired" checked={form['Inspection Required']} onChange={(e) => updateField('Inspection Required', (e.target as HTMLInputElement).checked)} />
              <Label htmlFor="inspectionRequired">Inspection Required</Label>
            </div>
          </div>

          {form['Inspection Required'] && (
            <div className="space-y-2">
              <Label htmlFor="inspectionStatus">Inspection Status</Label>
              <Select value={form['Inspection Status']} onValueChange={(v) => updateField('Inspection Status', v)}>
                <SelectTrigger id="inspectionStatus"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Not Required">Not Required</SelectItem>
                  <SelectItem value="Pending Request">Pending Request</SelectItem>
                  <SelectItem value="Requested">Requested</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input id="contactName" value={form['Contact Name']} onChange={(e) => updateField('Contact Name', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input id="contactPhone" type="tel" value={form['Contact Phone']} onChange={(e) => updateField('Contact Phone', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input id="contactEmail" type="email" className={fieldClass('Contact Email')} value={form['Contact Email']} onChange={(e) => updateField('Contact Email', e.target.value)} />
              {errors['Contact Email'] && <p className="text-xs text-red-500">{errors['Contact Email']}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={form.Notes} onChange={(e) => updateField('Notes', e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Add Release')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
