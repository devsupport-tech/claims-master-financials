import type {
  InsuranceSubmissionChecklist,
  InsuranceSubmissionChecklistItem,
  InsuranceSubmissionChecklistKey,
} from '@/types';

const DEFAULT_CHECKLIST_TEMPLATE: InsuranceSubmissionChecklistItem[] = [
  { key: 'mitigation', label: 'Mitigation', submitted: false, amount: 0 },
  { key: 'rebuild', label: 'Rebuild', submitted: false, amount: 0 },
  { key: 'packout', label: 'Packout', submitted: false, amount: 0 },
  { key: 'packIn', label: 'Pack-In', submitted: false, amount: 0 },
  { key: 'supplement', label: 'Supplement', submitted: false, amount: 0 },
  { key: 'finalReport', label: 'Final Report', submitted: false, amount: 0 },
  { key: 'invoiceReceipt', label: 'Invoice / Receipt', submitted: false, amount: 0 },
];

function sanitizeNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    if (!normalized) {
      return 0;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function createTemplateItem(item: InsuranceSubmissionChecklistItem): InsuranceSubmissionChecklistItem {
  return {
    key: item.key,
    label: item.label,
    submitted: false,
    submittedDate: '',
    amount: 0,
    amountReleased: 0,
    releaseDate: '',
    notes: '',
  };
}

export function calculateTotalSubmittedAmount(items: InsuranceSubmissionChecklistItem[]): number {
  return items.reduce((total, item) => {
    if (!item.submitted) {
      return total;
    }
    return total + sanitizeNumber(item.amount);
  }, 0);
}

export function createDefaultInsuranceSubmissionChecklist(): InsuranceSubmissionChecklist {
  const items = DEFAULT_CHECKLIST_TEMPLATE.map(createTemplateItem);

  return {
    items,
    totalSubmittedAmount: calculateTotalSubmittedAmount(items),
  };
}

function normalizeChecklistItem(
  template: InsuranceSubmissionChecklistItem,
  rawItem?: Partial<InsuranceSubmissionChecklistItem> | null
): InsuranceSubmissionChecklistItem {
  const submittedDate = typeof rawItem?.submittedDate === 'string' ? rawItem.submittedDate : '';
  const releaseDate = typeof rawItem?.releaseDate === 'string' ? rawItem.releaseDate : '';
  const notes = typeof rawItem?.notes === 'string' ? rawItem.notes : '';

  return {
    key: template.key,
    label: template.label,
    submitted: Boolean(rawItem?.submitted),
    submittedDate,
    amount: sanitizeNumber(rawItem?.amount),
    amountReleased: sanitizeNumber(rawItem?.amountReleased),
    releaseDate,
    notes,
  };
}

export function normalizeInsuranceSubmissionChecklist(
  checklist: InsuranceSubmissionChecklist
): InsuranceSubmissionChecklist {
  const itemMap = new Map<InsuranceSubmissionChecklistKey, Partial<InsuranceSubmissionChecklistItem>>();

  for (const item of checklist.items || []) {
    if (item?.key) {
      itemMap.set(item.key, item);
    }
  }

  const items = DEFAULT_CHECKLIST_TEMPLATE.map((template) =>
    normalizeChecklistItem(template, itemMap.get(template.key))
  );

  return {
    items,
    totalSubmittedAmount: calculateTotalSubmittedAmount(items),
    lastUpdatedAt: checklist.lastUpdatedAt,
  };
}

export function parseInsuranceSubmissionChecklist(rawChecklist?: string): InsuranceSubmissionChecklist {
  if (!rawChecklist || typeof rawChecklist !== 'string') {
    return createDefaultInsuranceSubmissionChecklist();
  }

  try {
    const parsed = JSON.parse(rawChecklist);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      return createDefaultInsuranceSubmissionChecklist();
    }

    return normalizeInsuranceSubmissionChecklist({
      items: parsed.items,
      totalSubmittedAmount: sanitizeNumber(parsed.totalSubmittedAmount),
      lastUpdatedAt: typeof parsed.lastUpdatedAt === 'string' ? parsed.lastUpdatedAt : undefined,
    });
  } catch {
    return createDefaultInsuranceSubmissionChecklist();
  }
}

export function serializeInsuranceSubmissionChecklist(
  checklist: InsuranceSubmissionChecklist
): string {
  const normalizedChecklist = normalizeInsuranceSubmissionChecklist(checklist);

  return JSON.stringify({
    ...normalizedChecklist,
    lastUpdatedAt: new Date().toISOString(),
  });
}
