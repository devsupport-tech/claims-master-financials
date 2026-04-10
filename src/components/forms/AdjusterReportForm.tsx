import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createAdjusterReport, updateAdjusterReport } from '@/lib/airtable'

interface AdjusterReportFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  claimRecordId: string
  onSuccess: () => void
  editRecord?: { id: string; [key: string]: any } | null
}

const INITIAL_STATE = {
  'Report Name': '',
  'Report Type': 'Initial Estimate',
  Version: 1,
  'Report Date': new Date().toISOString().split('T')[0],
  'Adjuster Name': '',
  'RCV Amount': '',
  'ACV Amount': '',
  Depreciation: '',
  'O&P Amount': '',
  'O&P Percent': 10,
  Deductible: '',
  'Line Items Count': '',
  'Scope Changes': '',
  Status: 'Received',
  Notes: '',
}

type Errors = Partial<Record<string, string>>

export function AdjusterReportForm({ open, onOpenChange, claimRecordId, onSuccess, editRecord }: AdjusterReportFormProps) {
  const [form, setForm] = useState({ ...INITIAL_STATE })
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!editRecord

  useEffect(() => {
    if (open && editRecord) {
      setForm({
        'Report Name': editRecord['Report Name'] || '',
        'Report Type': editRecord['Report Type'] || 'Initial Estimate',
        Version: editRecord.Version || 1,
        'Report Date': editRecord['Report Date'] || new Date().toISOString().split('T')[0],
        'Adjuster Name': editRecord['Adjuster Name'] || '',
        'RCV Amount': editRecord['RCV Amount'] || '',
        'ACV Amount': editRecord['ACV Amount'] || '',
        Depreciation: editRecord.Depreciation || '',
        'O&P Amount': editRecord['O&P Amount'] || '',
        'O&P Percent': editRecord['O&P Percent'] || 10,
        Deductible: editRecord.Deductible || '',
        'Line Items Count': editRecord['Line Items Count'] || '',
        'Scope Changes': editRecord['Scope Changes'] || '',
        Status: editRecord.Status || 'Received',
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
    if (!form['Report Name'].trim()) e['Report Name'] = 'Report name is required'
    if (!form['Report Date']) e['Report Date'] = 'Report date is required'
    if (!form['Adjuster Name'].trim()) e['Adjuster Name'] = 'Adjuster name is required'
    if (form['RCV Amount'] < 0) e['RCV Amount'] = 'RCV cannot be negative'
    if (form['ACV Amount'] < 0) e['ACV Amount'] = 'ACV cannot be negative'
    if (!form['RCV Amount'] && !form['ACV Amount']) e['RCV Amount'] = 'Enter at least RCV or ACV amount'
    if (form.Depreciation < 0) e['Depreciation'] = 'Depreciation cannot be negative'
    if (form['O&P Amount'] < 0) e['O&P Amount'] = 'O&P cannot be negative'
    if (form.Deductible < 0) e['Deductible'] = 'Deductible cannot be negative'
    if (form.Version < 1) e['Version'] = 'Version must be at least 1'
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
      if (!payload['Scope Changes']) delete payload['Scope Changes']
      if (!payload.Notes) delete payload.Notes
      if (!payload['Line Items Count']) delete payload['Line Items Count']

      if (isEditing) {
        await updateAdjusterReport(editRecord!.id, payload)
      } else {
        await createAdjusterReport(payload)
      }
      setForm({ ...INITIAL_STATE })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} adjuster report:`, err)
      alert(`Failed to ${isEditing ? 'update' : 'create'} adjuster report. Check the console for details.`)
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
          <DialogTitle>{isEditing ? 'Edit Adjuster Report' : 'New Adjuster Report'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update this adjuster report.' : 'Add an adjuster report or supplement.'}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reportName">Report Name *</Label>
            <Input id="reportName" placeholder="e.g. Initial Estimate - Johnson" className={fieldClass('Report Name')} value={form['Report Name']} onChange={(e) => updateField('Report Name', e.target.value)} />
            {errors['Report Name'] && <p className="text-xs text-red-500">{errors['Report Name']}</p>}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reportType">Report Type *</Label>
              <Select value={form['Report Type']} onValueChange={(v) => updateField('Report Type', v)}>
                <SelectTrigger id="reportType"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Initial Estimate">Initial Estimate</SelectItem>
                  <SelectItem value="Supplement">Supplement</SelectItem>
                  <SelectItem value="Re-inspection">Re-inspection</SelectItem>
                  <SelectItem value="Final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="version">Version *</Label>
              <Input id="version" type="number" step="1" min="1" className={fieldClass('Version')} value={form.Version} onChange={(e) => updateField('Version', parseInt(e.target.value) || 1)} />
              {errors['Version'] && <p className="text-xs text-red-500">{errors['Version']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select value={form.Status} onValueChange={(v) => updateField('Status', v)}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Received">Received</SelectItem>
                  <SelectItem value="Under Review">Under Review</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Disputed">Disputed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reportDate">Report Date *</Label>
              <Input id="reportDate" type="date" className={fieldClass('Report Date')} value={form['Report Date']} onChange={(e) => updateField('Report Date', e.target.value)} />
              {errors['Report Date'] && <p className="text-xs text-red-500">{errors['Report Date']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjusterName">Adjuster Name *</Label>
              <Input id="adjusterName" className={fieldClass('Adjuster Name')} value={form['Adjuster Name']} onChange={(e) => updateField('Adjuster Name', e.target.value)} />
              {errors['Adjuster Name'] && <p className="text-xs text-red-500">{errors['Adjuster Name']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rcvAmount">RCV Amount ($) *</Label>
              <Input id="rcvAmount" type="number" step="0.01" min="0" className={fieldClass('RCV Amount')} value={form['RCV Amount'] || ''} onChange={(e) => updateField('RCV Amount', parseFloat(e.target.value) || 0)} />
              {errors['RCV Amount'] && <p className="text-xs text-red-500">{errors['RCV Amount']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="acvAmount">ACV Amount ($) *</Label>
              <Input id="acvAmount" type="number" step="0.01" min="0" className={fieldClass('ACV Amount')} value={form['ACV Amount'] || ''} onChange={(e) => updateField('ACV Amount', parseFloat(e.target.value) || 0)} />
              {errors['ACV Amount'] && <p className="text-xs text-red-500">{errors['ACV Amount']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="depreciation">Depreciation ($)</Label>
              <Input id="depreciation" type="number" step="0.01" min="0" className={fieldClass('Depreciation')} value={form.Depreciation || ''} onChange={(e) => updateField('Depreciation', parseFloat(e.target.value) || 0)} />
              {errors['Depreciation'] && <p className="text-xs text-red-500">{errors['Depreciation']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="oAndPAmount">O&P Amount ($)</Label>
              <Input id="oAndPAmount" type="number" step="0.01" min="0" className={fieldClass('O&P Amount')} value={form['O&P Amount'] || ''} onChange={(e) => updateField('O&P Amount', parseFloat(e.target.value) || 0)} />
              {errors['O&P Amount'] && <p className="text-xs text-red-500">{errors['O&P Amount']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="oAndPPercent">O&P %</Label>
              <Input id="oAndPPercent" type="number" step="0.1" min="0" value={form['O&P Percent'] || ''} onChange={(e) => updateField('O&P Percent', parseFloat(e.target.value) || 0)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deductible">Deductible ($)</Label>
              <Input id="deductible" type="number" step="0.01" min="0" className={fieldClass('Deductible')} value={form.Deductible || ''} onChange={(e) => updateField('Deductible', parseFloat(e.target.value) || 0)} />
              {errors['Deductible'] && <p className="text-xs text-red-500">{errors['Deductible']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lineItems">Line Items Count</Label>
              <Input id="lineItems" type="number" step="1" min="0" value={form['Line Items Count'] || ''} onChange={(e) => updateField('Line Items Count', parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scopeChanges">Scope Changes</Label>
            <Textarea id="scopeChanges" rows={2} value={form['Scope Changes']} onChange={(e) => updateField('Scope Changes', e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={2} value={form.Notes} onChange={(e) => updateField('Notes', e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Add Report')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
