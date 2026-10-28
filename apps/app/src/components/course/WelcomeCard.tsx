import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCourse } from '../../lib/course';
import type { MissionLinkFor } from './CourseGuide';

interface WelcomeCardProps {
  open: boolean;
  onClose: () => void;
  linkFor: MissionLinkFor;
}

/** The course card. Only the course bar's role name opens it; it never opens by itself. */
export default function WelcomeCard({ open, onClose, linkFor }: WelcomeCardProps) {
  const { view, role, myMissions, currentMission } = useCourse();
  if (!view) return null;

  // Only the current mission: once every mission is complete there is nowhere to start.
  const link = currentMission ? linkFor(currentMission) : null;
  const allComplete = myMissions.length > 0 && currentMission === null;
  const elsewhere = currentMission !== null && currentMission.startAt.appKey !== view.appKey;
  const objectives = view.course.objectives.slice(0, 3);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        // Without a role there is no description; say so instead of pointing at none.
        {...(role ? {} : { 'aria-describedby': undefined })}
        className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto rounded-lg sm:max-w-md [&>button:last-child]:hidden"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl">{view.course.name}</DialogTitle>
          {role && <DialogDescription>You are {role.title}</DialogDescription>}
        </DialogHeader>
        {objectives.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What you'll do</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </section>
        )}
        {currentMission && (
          <p className="text-sm font-medium">
            {myMissions.indexOf(currentMission) === 0 ? 'First mission' : 'Next mission'}: {currentMission.title}
          </p>
        )}
        {allComplete && <p className="text-sm font-medium">All missions complete</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11" onClick={onClose}>
            Close
          </Button>
          {currentMission && link && (
            // A disabled button gets no pointer events, so the reason sits on its wrapper.
            <span className="flex min-w-0" title={link.blockedTitle}>
              <Button
                className="h-11 w-full min-w-0"
                disabled={link.blockedTitle !== undefined}
                onClick={() => {
                  onClose();
                  if (!link.here) link.go();
                }}
              >
                {/* Name the App when Start would leave this one. */}
                <span className="min-w-0 truncate">{elsewhere ? `Go to ${currentMission.startAt.appTitle}` : 'Start'}</span>
              </Button>
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
