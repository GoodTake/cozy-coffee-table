import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useCourse, type CourseMission } from '../../lib/course';
import type { MissionLinkFor } from './CourseGuide';

const WIDE = '(min-width: 768px)';

/** Right-hand drawer from `md` up, bottom drawer below. */
function useWideScreen() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = () => setWide(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return wide;
}

type MissionState = 'Completed' | 'Current' | 'Upcoming';

function StatusMark({ state }: { state: MissionState }) {
  return (
    <span
      role="img"
      aria-label={state}
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
        state === 'Completed' && 'border-primary bg-primary text-primary-foreground',
        state === 'Current' && 'border-primary',
        state === 'Upcoming' && 'border-border',
      )}
    >
      {state === 'Completed' && <Check className="size-3.5" aria-hidden="true" />}
      {state === 'Current' && <span className="size-2 rounded-full bg-primary" />}
    </span>
  );
}

interface MissionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkFor: MissionLinkFor;
  /** Set on a course with roles. */
  onChangeRole?: () => void;
}

export default function MissionSheet({ open, onOpenChange, linkFor, onChangeRole }: MissionSheetProps) {
  const { view, myMissions, currentMission } = useCourse();
  const wide = useWideScreen();
  if (!view) return null;
  const preview = view.mode === 'preview';

  const stateOf = (mission: CourseMission): MissionState =>
    mission.completedAt !== null
      ? 'Completed'
      : mission.missionKey === currentMission?.missionKey
        ? 'Current'
        : 'Upcoming';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        {...(preview ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'flex flex-col gap-4 overflow-y-auto px-4 sm:px-6',
          wide ? 'w-full sm:max-w-md' : 'max-h-[85vh] rounded-t-lg',
          // The built-in close control, enlarged to a 44px target.
          '[&>button:last-child]:right-2 [&>button:last-child]:top-2 [&>button:last-child]:flex [&>button:last-child]:size-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center',
        )}
      >
        <SheetHeader className="pr-10 text-left">
          <SheetTitle>Missions</SheetTitle>
          {preview && <SheetDescription>Preview — progress isn't saved</SheetDescription>}
          {onChangeRole && (
            <Button
              variant="outline"
              className="h-11 self-start"
              onClick={() => {
                onOpenChange(false);
                onChangeRole();
              }}
            >
              Change role
            </Button>
          )}
        </SheetHeader>
        <ol className="flex flex-col gap-2">
          {myMissions.map((mission, index) => {
            const state = stateOf(mission);
            const link = linkFor(mission);
            return (
              <li
                key={mission.missionKey}
                className={cn('rounded-lg border', state === 'Current' && 'border-primary')}
              >
                <details open={state === 'Current'}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-3 py-2 [&::-webkit-details-marker]:hidden">
                    <StatusMark state={state} />
                    <span
                      className={cn('text-sm font-medium', state === 'Completed' && 'text-muted-foreground')}
                    >
                      {index + 1}. {mission.title}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3 px-3 pb-3 pl-12">
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{mission.learnerInstruction}</p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-xs text-muted-foreground">
                        Starts in {mission.startAt.appTitle}
                      </span>
                      {/* A disabled button gets no pointer events, so the reason sits on its wrapper. */}
                      <span className="shrink-0" title={link.blockedTitle}>
                        <Button
                          className="h-11 min-w-11 px-3"
                          variant={state === 'Current' ? 'default' : 'outline'}
                          disabled={link.blockedTitle !== undefined}
                          onClick={() => {
                            onOpenChange(false);
                            if (!link.here) link.go();
                          }}
                        >
                          Go
                        </Button>
                      </span>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ol>
      </SheetContent>
    </Sheet>
  );
}
