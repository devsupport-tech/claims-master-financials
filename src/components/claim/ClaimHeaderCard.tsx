import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getStatusColor, getStageColor } from '@/lib/claim-badges';

const BADGE_CLASSES = 'inline-flex items-center px-3 py-1 rounded-full text-xs font-medium';

export interface ClaimHeaderClaim {
  'Last Name'?: string;
  'Carrier Claim #'?: string;
  ClaimID?: string;
  Status?: string;
  Stage?: string;
}

export interface ClaimHeaderCardProps {
  claim: ClaimHeaderClaim;
  driveFolderUrl?: string | null;
  stageActions?: ReactNode;
  stageMessage?: ReactNode;
  rightActions?: ReactNode;
  stageGroupKeyDown?: React.KeyboardEventHandler<HTMLElement>;
}

/**
 * Shared "Claim Info" header for the suite.
 *
 * COPY OF: Claims-Master-VEC/dashboard/src/components/claim/ClaimHeaderCard.tsx
 * Claims Master is the design truth — keep this copy aligned with that one.
 * The two apps live in separate packages with different React/RR versions, so
 * we duplicate the JSX rather than build a shared package.
 */
export default function ClaimHeaderCard({
  claim,
  driveFolderUrl,
  stageActions,
  stageMessage,
  rightActions,
  stageGroupKeyDown,
}: ClaimHeaderCardProps) {
  return (
    <Card className="overflow-hidden border-border bg-gradient-to-r from-background via-muted/50 to-info/5 text-foreground shadow-lg dark:from-background dark:via-muted/30 dark:to-info/5">
      <CardContent className="pt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-border bg-background/80 px-5 py-4 shadow-sm backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                  {claim['Last Name'] || 'N/A'}  :  {claim['Carrier Claim #'] || claim.ClaimID}
                </h1>
                {claim.Status && (
                  <span className={`${BADGE_CLASSES} ${getStatusColor(claim.Status)}`}>
                    {claim.Status}
                  </span>
                )}
              </div>
              {(stageActions || stageMessage) && (
                <div
                  className="mt-4 flex flex-col gap-3 md:flex-row md:items-end"
                  data-sequential-group="stage-edit"
                  onKeyDownCapture={stageGroupKeyDown}
                >
                  {stageActions}
                </div>
              )}
              {stageMessage}
            </div>
            <div className="rounded-2xl border border-border bg-background/80 px-5 py-4 shadow-sm backdrop-blur-sm text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stage</p>
              <span className={`${BADGE_CLASSES} mt-1 ${getStageColor(claim.Stage || '')}`}>
                {claim.Stage}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 self-start lg:items-end">
            {rightActions}
            {driveFolderUrl && (
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                asChild
              >
                <a
                  href={driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Drive Folder
                </a>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
