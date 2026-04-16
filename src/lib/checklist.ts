import type {
  InsuranceSubmissionChecklist,
  InsuranceSubmissionChecklistItem,
  InsuranceSubmissionChecklistKey,
} from '@/types';

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

export function calculateTotalSubmittedAmount(items: InsuranceSubmissionChecklistItem[]): number {
  return items.reduce((total, item) => {
    if (!item.submitted) {
      return total;
    }
    return total + sanitizeNumber(item.amount);
  }, 0);
}

/**
 * Attempt to parse items out of a raw checklist JSON string.
 * Returns a Map keyed by item key (module record ID or legacy key).
 */
function tryParseItemsMap(
  raw?: string
): Map<InsuranceSubmissionChecklistKey, Partial<InsuranceSubmissionChecklistItem>> {
  const map = new Map<InsuranceSubmissionChecklistKey, Partial<InsuranceSubmissionChecklistItem>>();
  if (!raw || typeof raw !== 'string') return map;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      for (const item of parsed.items) {
        if (item?.key) {
          map.set(item.key, item);
        }
      }
    }
  } catch {
    // corrupt JSON — return empty map
  }
  return map;
}

/**
 * Build a checklist from the claim's linked modules.
 * Each module becomes one row; previously-saved data (from the Checklist JSON
 * field) is merged by matching module record IDs.
 */
export function buildChecklistFromModules(
  modules: { id: string; 'Module Name': string }[],
  existingJson?: string,
): InsuranceSubmissionChecklist {
  const existing = tryParseItemsMap(existingJson);

  const items: InsuranceSubmissionChecklistItem[] = modules.map(m => {
    const saved = existing.get(m.id);
    return {
      key: m.id,
      label: m['Module Name'] || 'Module',
      submitted: Boolean(saved?.submitted),
      submittedDate: typeof saved?.submittedDate === 'string' ? saved.submittedDate : '',
      amount: sanitizeNumber(saved?.amount),
      amountReleased: sanitizeNumber(saved?.amountReleased),
      releaseDate: typeof saved?.releaseDate === 'string' ? saved.releaseDate : '',
      notes: typeof saved?.notes === 'string' ? saved.notes : '',
    };
  });

  return {
    items,
    totalSubmittedAmount: calculateTotalSubmittedAmount(items),
  };
}

/**
 * Re-calculate totals after an in-memory edit.
 */
export function normalizeInsuranceSubmissionChecklist(
  checklist: InsuranceSubmissionChecklist
): InsuranceSubmissionChecklist {
  const items = (checklist.items || []).map((item) => ({
    ...item,
    amount: sanitizeNumber(item.amount),
    amountReleased: sanitizeNumber(item.amountReleased),
  }));

  return {
    items,
    totalSubmittedAmount: calculateTotalSubmittedAmount(items),
    lastUpdatedAt: checklist.lastUpdatedAt,
  };
}

/**
 * Parse a raw checklist JSON string into a checklist object.
 * Used as a fallback when modules haven't been loaded yet.
 */
export function parseInsuranceSubmissionChecklist(rawChecklist?: string): InsuranceSubmissionChecklist {
  if (!rawChecklist || typeof rawChecklist !== 'string') {
    return { items: [], totalSubmittedAmount: 0 };
  }

  try {
    const parsed = JSON.parse(rawChecklist);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      return { items: [], totalSubmittedAmount: 0 };
    }

    return normalizeInsuranceSubmissionChecklist({
      items: parsed.items,
      totalSubmittedAmount: sanitizeNumber(parsed.totalSubmittedAmount),
      lastUpdatedAt: typeof parsed.lastUpdatedAt === 'string' ? parsed.lastUpdatedAt : undefined,
    });
  } catch {
    return { items: [], totalSubmittedAmount: 0 };
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
