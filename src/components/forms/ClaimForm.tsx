import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClaim, updateClaim } from '@/lib/airtable'

interface ClaimFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  editRecord?: { id: string; [key: string]: any } | null
}

const INITIAL_STATE = {
  'Claim ID': '',
  'Last Name': '',
  'First Name': '',
  Address: '',
  City: '',
  State: '',
  Carrier: '',
  'Policy Number': '',
  'Date of Loss': '',
  RCV: 0,
  ACV: 0,
  Depreciation: 0,
  'O&P': 0,
  Deductible: 0,
  Status: 'Pending',
}

type Errors = Partial<Record<string, string>>

export function ClaimForm({ open, onOpenChange, onSuccess, editRecord }: ClaimFormProps) {
  const [form, setForm] = useState({ ...INITIAL_STATE })
  const [errors, setErrors] = useState<Errors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isEditing = !!editRecord

  // Populate form when editing
  useEffect(() => {
    if (open && editRecord) {
      setForm({
        'Claim ID': editRecord['Claim ID'] || '',
        'Last Name': editRecord['Last Name'] || '',
        'First Name': editRecord['First Name'] || '',
        Address: editRecord.Address || '',
        City: editRecord.City || '',
        State: editRecord.State || '',
        Carrier: editRecord.Carrier || '',
        'Policy Number': editRecord['Policy Number'] || '',
        'Date of Loss': editRecord['Date of Loss'] || '',
        RCV: editRecord.RCV || 0,
        ACV: editRecord.ACV || 0,
        Depreciation: editRecord.Depreciation || 0,
        'O&P': editRecord['O&P'] || 0,
        Deductible: editRecord.Deductible || 0,
        Status: editRecord.Status || 'Pending',
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
    if (!form['Claim ID'].trim()) e['Claim ID'] = 'Claim ID is required'
    if (!form['Last Name'].trim()) e['Last Name'] = 'Last name is required'
    if (!form['First Name'].trim()) e['First Name'] = 'First name is required'
    if (!form.Address.trim()) e['Address'] = 'Address is required'
    if (!form.City.trim()) e['City'] = 'City is required'
    if (!form.State.trim()) e['State'] = 'State is required'
    if (!form.Carrier.trim()) e['Carrier'] = 'Carrier is required'
    if (!form['Policy Number'].trim()) e['Policy Number'] = 'Policy number is required'
    if (!form['Date of Loss']) e['Date of Loss'] = 'Date of loss is required'
    if (form.RCV < 0) e['RCV'] = 'RCV cannot be negative'
    if (form.ACV < 0) e['ACV'] = 'ACV cannot be negative'
    if (form.Depreciation < 0) e['Depreciation'] = 'Depreciation cannot be negative'
    if (form['O&P'] < 0) e['O&P'] = 'O&P cannot be negative'
    if (form.Deductible < 0) e['Deductible'] = 'Deductible cannot be negative'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setIsSubmitting(true)
    try {
      if (isEditing) {
        await updateClaim(editRecord!.id, form)
      } else {
        await createClaim(form)
      }
      setForm({ ...INITIAL_STATE })
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      console.error(`Failed to ${isEditing ? 'update' : 'create'} claim:`, err)
      alert(`Failed to ${isEditing ? 'update' : 'create'} claim. Check the console for details.`)
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
          <DialogTitle>{isEditing ? 'Edit Claim' : 'New Claim'}</DialogTitle>
          <DialogDescription>{isEditing ? 'Update this insurance claim.' : 'Create a new insurance claim.'}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="claimId">Claim ID *</Label>
              <Input id="claimId" placeholder="CLM-2024-001" className={fieldClass('Claim ID')} value={form['Claim ID']} onChange={(e) => updateField('Claim ID', e.target.value)} />
              {errors['Claim ID'] && <p className="text-xs text-red-500">{errors['Claim ID']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status *</Label>
              <Select value={form.Status} onValueChange={(v) => updateField('Status', v)}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" className={fieldClass('First Name')} value={form['First Name']} onChange={(e) => updateField('First Name', e.target.value)} />
              {errors['First Name'] && <p className="text-xs text-red-500">{errors['First Name']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" className={fieldClass('Last Name')} value={form['Last Name']} onChange={(e) => updateField('Last Name', e.target.value)} />
              {errors['Last Name'] && <p className="text-xs text-red-500">{errors['Last Name']}</p>}
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address">Address *</Label>
            <Input id="address" className={fieldClass('Address')} value={form.Address} onChange={(e) => updateField('Address', e.target.value)} />
            {errors['Address'] && <p className="text-xs text-red-500">{errors['Address']}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input id="city" className={fieldClass('City')} value={form.City} onChange={(e) => updateField('City', e.target.value)} />
              {errors['City'] && <p className="text-xs text-red-500">{errors['City']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State *</Label>
              <Input id="state" placeholder="TX" maxLength={2} className={fieldClass('State')} value={form.State} onChange={(e) => updateField('State', e.target.value.toUpperCase())} />
              {errors['State'] && <p className="text-xs text-red-500">{errors['State']}</p>}
            </div>
          </div>

          {/* Insurance */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="carrier">Carrier *</Label>
              <Input id="carrier" className={fieldClass('Carrier')} value={form.Carrier} onChange={(e) => updateField('Carrier', e.target.value)} />
              {errors['Carrier'] && <p className="text-xs text-red-500">{errors['Carrier']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="policyNumber">Policy Number *</Label>
              <Input id="policyNumber" className={fieldClass('Policy Number')} value={form['Policy Number']} onChange={(e) => updateField('Policy Number', e.target.value)} />
              {errors['Policy Number'] && <p className="text-xs text-red-500">{errors['Policy Number']}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfLoss">Date of Loss *</Label>
            <Input id="dateOfLoss" type="date" className={fieldClass('Date of Loss')} value={form['Date of Loss']} onChange={(e) => updateField('Date of Loss', e.target.value)} />
            {errors['Date of Loss'] && <p className="text-xs text-red-500">{errors['Date of Loss']}</p>}
          </div>

          {/* Financials */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rcv">RCV ($)</Label>
              <Input id="rcv" type="number" step="0.01" min="0" className={fieldClass('RCV')} value={form.RCV || ''} onChange={(e) => updateField('RCV', parseFloat(e.target.value) || 0)} />
              {errors['RCV'] && <p className="text-xs text-red-500">{errors['RCV']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="acv">ACV ($)</Label>
              <Input id="acv" type="number" step="0.01" min="0" className={fieldClass('ACV')} value={form.ACV || ''} onChange={(e) => updateField('ACV', parseFloat(e.target.value) || 0)} />
              {errors['ACV'] && <p className="text-xs text-red-500">{errors['ACV']}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="depreciation">Depreciation ($)</Label>
              <Input id="depreciation" type="number" step="0.01" min="0" className={fieldClass('Depreciation')} value={form.Depreciation || ''} onChange={(e) => updateField('Depreciation', parseFloat(e.target.value) || 0)} />
              {errors['Depreciation'] && <p className="text-xs text-red-500">{errors['Depreciation']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="oAndP">O&P ($)</Label>
              <Input id="oAndP" type="number" step="0.01" min="0" className={fieldClass('O&P')} value={form['O&P'] || ''} onChange={(e) => updateField('O&P', parseFloat(e.target.value) || 0)} />
              {errors['O&P'] && <p className="text-xs text-red-500">{errors['O&P']}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="deductible">Deductible ($)</Label>
              <Input id="deductible" type="number" step="0.01" min="0" className={fieldClass('Deductible')} value={form.Deductible || ''} onChange={(e) => updateField('Deductible', parseFloat(e.target.value) || 0)} />
              {errors['Deductible'] && <p className="text-xs text-red-500">{errors['Deductible']}</p>}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Claim')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
