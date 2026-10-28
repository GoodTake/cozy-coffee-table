import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ListChecks, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { stepsAgentWorld, useCourse, type CourseMission } from '../../lib/course';
import CourseBar, { CourseUnavailableBar } from './CourseBar';
import MissionSheet from './MissionSheet';
import RoleGate from './RoleGate';
import WelcomeCard from './WelcomeCard';

export interface MissionLink {
  /** This page is the mission's start page. */
  here: boolean;
  /** Set when Go cannot leave this App here; explains where the mission opens. */
  blockedTitle: string | undefined;
  go(): void;
}

export type MissionLinkFor = (mission: CourseMission) => MissionLink;

// Each App is its own origin, so one key per App. The bar starts collapsed; without storage it stays so.
const BAR_SHOWN_KEY = 'steps-course-bar-shown';

function barShownStored(): boolean {
  try {
    return localStorage.getItem(BAR_SHOWN_KEY) !== null;
  } catch {
    return false;
  }
}

function storeBarShown(shown: boolean) {
  try {
    if (shown) localStorage.setItem(BAR_SHOWN_KEY, new Date().toISOString());
    else localStorage.removeItem(BAR_SHOWN_KEY);
  } catch {
    // See barShownStored.
  }
}

/**
 * The course guide every App page carries: role gate, course bar (collapsed to a button until the learner
 * opens it), mission sheet and the course card the bar's role name opens. Once the learner has a role it shows
 * nothing on its own. Restyle freely; keep every part and when it shows.
 */
export default function CourseGuide() {
  const { status, view, role } = useCourse();
  const location = useLocation();
  const navigate = useNavigate();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const [changingRole, setChangingRole] = useState(false);
  const [barShown, setBarShown] = useState(barShownStored);
  const hideButton = useRef<HTMLButtonElement>(null);
  const showButton = useRef<HTMLButtonElement>(null);
  const toggled = useRef(false);

  const needsRole = status === 'ready' && view !== null && view.roles.length > 0 && role === null;
  // A top bar takes room only while the course bar is open or the unavailable bar shows. A remembered open
  // bar keeps its room while the course loads, so the page does not jump when it appears.
  const topBar = status === 'unavailable'
    || (barShown && (status === 'loading' || (status === 'ready' && view !== null && !needsRole && !changingRole)));

  // Apps offset their own sticky headers by var(--course-bar-height); with no top bar it is 0px. Set before
  // paint so a page never shows the gap first.
  useLayoutEffect(() => {
    if (topBar) return;
    document.documentElement.style.setProperty('--course-bar-height', '0px');
    return () => {
      document.documentElement.style.removeProperty('--course-bar-height');
    };
  }, [topBar]);

  // The pressed button unmounts; keep keyboard focus on the one that replaces it.
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    (barShown ? hideButton : showButton).current?.focus();
  }, [barShown]);

  const toggleBar = (shown: boolean) => {
    toggled.current = true;
    storeBarShown(shown);
    setBarShown(shown);
  };

  if (status === 'hidden' || status === 'loading') return null;
  if (status === 'unavailable' || !view) return <CourseUnavailableBar />;

  const linkFor: MissionLinkFor = (mission) => {
    const { appKey, appTitle, path } = mission.startAt;
    const sameApp = appKey === view.appKey;
    return {
      here: sameApp && path === location.pathname,
      blockedTitle: !sameApp && view.mode === 'preview' ? `Opens in ${appTitle} on the live campus` : undefined,
      go: () => (sameApp ? navigate(path) : stepsAgentWorld()?.openApp(appKey, path)),
    };
  };

  // Anyone may change role; a preview or read-only session only changes it on this page (see useCourse).
  const canChangeRole = view.roles.length > 0;
  const changeRole = canChangeRole ? () => setChangingRole(true) : undefined;

  if (needsRole || changingRole) return <RoleGate onClose={changingRole ? () => setChangingRole(false) : undefined} />;

  // A course with roles and no missions has no Missions sheet, so the collapsed bar names the role.
  const rolesOnly = view.missions.length === 0;

  return (
    <>
      {barShown ? (
        <CourseBar
          linkFor={linkFor}
          onOpenMissions={() => setMissionsOpen(true)}
          onOpenWelcome={() => setWelcomeOpen(true)}
          onChangeRole={changeRole}
          onHide={() => toggleBar(false)}
          hideRef={hideButton}
        />
      ) : (
        <Button
          ref={showButton}
          title="Show course bar"
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 h-12 max-w-[calc(100%-2rem)] gap-2 rounded-full px-5 text-base font-semibold shadow-lg"
          onClick={() => toggleBar(true)}
        >
          {rolesOnly ? <UserRound aria-hidden="true" /> : <ListChecks aria-hidden="true" />}
          <span className="min-w-0 truncate">{rolesOnly ? (role?.title ?? view.course.name) : 'Missions'}</span>
        </Button>
      )}
      <WelcomeCard open={welcomeOpen} onClose={() => setWelcomeOpen(false)} linkFor={linkFor} />
      <MissionSheet open={missionsOpen} onOpenChange={setMissionsOpen} linkFor={linkFor} onChangeRole={changeRole} />
    </>
  );
}
