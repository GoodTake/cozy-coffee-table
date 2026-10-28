import type { Ref } from 'react';
import { ChevronUp, ListChecks, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCourse } from '../../lib/course';
import type { MissionLinkFor } from './CourseGuide';

// One line, never taller than 44px on phones and 48px on desktop. The rule is a
// shadow so it adds no height under the 44px buttons.
const BAR =
  'sticky top-0 z-40 flex h-11 items-center gap-2 bg-background px-4 text-sm text-foreground shadow-[0_1px_0_0_hsl(var(--border))] md:h-12';

interface CourseBarProps {
  linkFor: MissionLinkFor;
  onOpenMissions: () => void;
  onOpenWelcome: () => void;
  /** A tester or preview can change role; on a course without missions the bar carries the entry. */
  onChangeRole?: () => void;
  /** The learner collapses the bar to a small button; CourseGuide remembers it. */
  onHide: () => void;
  hideRef?: Ref<HTMLButtonElement>;
}

/** Shown instead of the bar when this browser has no readable course session. */
export function CourseUnavailableBar() {
  return (
    <div className={BAR}>
      <p className="min-w-0 truncate text-muted-foreground">Open this course again from Campus Earth</p>
    </div>
  );
}

export default function CourseBar({ linkFor, onOpenMissions, onOpenWelcome, onChangeRole, onHide, hideRef }: CourseBarProps) {
  const { view, role, myMissions, currentMission } = useCourse();
  if (!view) return null;

  const link = currentMission ? linkFor(currentMission) : null;
  const position = currentMission ? myMissions.indexOf(currentMission) + 1 : 0;
  const preview = view.mode === 'preview';
  // Roles without missions: there are no missions to show, so the bar names the course instead.
  const rolesOnly = view.missions.length === 0;
  // A phone-width preview hides the role button and a roles-only course has no Missions sheet, so the text names the role.
  const courseText = preview ? (role?.title ?? view.course.name) : view.course.name;

  return (
    <div className={BAR}>
      <button
        type="button"
        onClick={onOpenWelcome}
        className={cn(
          'h-11 min-w-11 max-w-[5.5rem] shrink-0 truncate rounded-md text-left font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[10rem]',
          // Below md the preview marker takes this slot; Missions and the welcome card still name the role (with no missions, the middle text does).
          preview && 'hidden md:block',
        )}
      >
        {role?.title ?? view.course.name}
      </button>
      <p className="min-w-0 flex-1 truncate text-muted-foreground">
        {rolesOnly
          ? courseText
          : currentMission
            ? `Mission ${position} of ${myMissions.length} · ${currentMission.title}`
            : 'All missions complete'}
      </p>
      {preview && (
        <span className="order-first min-w-0 max-w-[45%] truncate rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground md:order-none md:max-w-none md:shrink-0">
          Preview — progress isn't saved
        </span>
      )}
      {link && !link.here && (
        // A disabled button gets no pointer events, so the reason sits on its wrapper.
        <span className="shrink-0" title={link.blockedTitle}>
          <Button className="h-11 min-w-11 px-3" disabled={link.blockedTitle !== undefined} onClick={link.go}>
            Go
          </Button>
        </span>
      )}
      {rolesOnly ? (
        onChangeRole && (
          <Button
            variant="outline"
            aria-label="Change role"
            className="h-11 min-w-11 shrink-0 px-3"
            onClick={onChangeRole}
          >
            <UserCog aria-hidden="true" />
            <span className="hidden sm:inline">Change role</span>
          </Button>
        )
      ) : (
        <Button
          variant="outline"
          aria-label="Missions"
          className="h-11 min-w-11 shrink-0 px-3"
          onClick={onOpenMissions}
        >
          <ListChecks aria-hidden="true" />
          <span className="hidden sm:inline">Missions</span>
        </Button>
      )}
      <Button
        ref={hideRef}
        variant="ghost"
        aria-label="Hide course bar"
        title="Hide course bar"
        className="h-11 w-11 shrink-0 px-0"
        onClick={onHide}
      >
        <ChevronUp aria-hidden="true" />
      </Button>
    </div>
  );
}
