// Platform-owned (RUNTIME_FILES): rewritten on every preview start. Change the
// course guide's look in src/components/course/*, never here.
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { getReleaseRuntimeContext, isReleaseRuntime } from './runtime';

export interface CourseRole {
  roleKey: string;
  title: string;
  description: string;
}

export interface CourseMission {
  missionKey: string;
  order: number;
  title: string;
  learnerInstruction: string;
  /** Empty means every learner does this mission. */
  roleKeys: string[];
  startAt: { appKey: string; appTitle: string; path: string };
  completedAt: string | null;
}

export interface CourseView {
  mode: 'learner' | 'tester' | 'preview';
  readOnly: boolean;
  /** The App this page belongs to. */
  appKey: string;
  course: { name: string; objectives: string[] };
  roles: CourseRole[];
  role: string | null;
  /** Sorted by order. */
  missions: CourseMission[];
  /** Present only for a trusted, writable development tester. */
  development?: { agentId: string; platformOrigin: string; testUrl: string };
}

export type CourseStatus = 'hidden' | 'loading' | 'ready' | 'unavailable';

export interface Course {
  status: CourseStatus;
  view: CourseView | null;
  role: CourseRole | null;
  myMissions: CourseMission[];
  currentMission: CourseMission | null;
  /** Missions this refresh found completed that the previous one did not. The CourseGuide no longer announces
   *  them (2026-10-12); kept because Apps refresh this file but keep their own older CourseGuide that reads it. */
  justCompleted: CourseMission[];
  chooseRole(roleKey: string): Promise<void>;
  refresh(): Promise<void>;
}

export interface StepsAgentWorld {
  openApp(appKey: string, path?: string): void;
  invokeService(serviceKey: string, path: string, init?: RequestInit): Promise<Response>;
}

type WorldGlobal = { stepsAgentWorld?: StepsAgentWorld };

// Through unknown: a generated service client declares the global with invokeService only.
function worldGlobal(): WorldGlobal {
  return globalThis as unknown as WorldGlobal;
}

/** The live injected API, or the compatible API installed for a trusted development course. */
export function stepsAgentWorld(): StepsAgentWorld | undefined {
  return worldGlobal().stepsAgentWorld;
}

const APP_KEY = /^[a-z0-9][a-z0-9-]{0,79}$/;

function validCoursePath(path: string): boolean {
  if (path.length > 240) return false;
  let decoded = path;
  for (let round = 0; round < 4; round += 1) {
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\?#\u0000-\u001f\u007f]/.test(decoded)
      || decoded.split('/').some(segment => segment === '.' || segment === '..')) return false;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return true;
      decoded = next;
    } catch {
      return false;
    }
  }
  return false;
}

function trustedDevelopment(view: CourseView): CourseView['development'] {
  const development = view.development;
  if (view.mode !== 'tester' || view.readOnly || !development) return undefined;
  try {
    const origin = new URL(development.platformOrigin);
    const target = new URL(development.testUrl);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== development.platformOrigin
      || target.origin !== origin.origin || target.username || target.password || target.search || target.hash
      || target.pathname !== `/agents/${encodeURIComponent(development.agentId)}/test`) return undefined;
    return development;
  } catch {
    return undefined;
  }
}

function reportDevelopment(development: NonNullable<CourseView['development']>, message: object): void {
  if (window.parent !== window) window.parent.postMessage(message, development.platformOrigin);
}

const COURSE_PATH = '/__steps/course';
const ROLE_PATH = '/__steps/course/role';
const CourseContext = createContext<Course | null>(null);

type Source = 'world' | 'development' | null;

function courseSource(): Source {
  if (getReleaseRuntimeContext()?.projectId === 'world') return 'world';
  if (!isReleaseRuntime()) return 'development';
  // Other live paths (public visitors) have no course.
  return null;
}

// One empty list, so a read that finds nothing new leaves justCompleted (and the course) as it was.
const NONE: CourseMission[] = [];

function newlyCompleted(previous: CourseView | null, next: CourseView): CourseMission[] {
  if (!previous) return NONE;
  const before = new Set(
    previous.missions.filter((mission) => mission.completedAt !== null).map((mission) => mission.missionKey),
  );
  const found = next.missions.filter((mission) => mission.completedAt !== null && !before.has(mission.missionKey));
  return found.length > 0 ? found : NONE;
}

export function CourseProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [source] = useState(courseSource);
  const [status, setStatus] = useState<CourseStatus>(source ? 'loading' : 'hidden');
  const [view, setView] = useState<CourseView | null>(null);
  const [justCompleted, setJustCompleted] = useState<CourseMission[]>(NONE);
  // Preview and read-only sessions keep the chosen role on this page only.
  const [localRole, setLocalRole] = useState<string | null>(null);
  const viewRef = useRef<CourseView | null>(null);
  // Reads overlap (route change, focus); only the newest request may land, so an
  // older answer can't roll the view back and announce a completion twice.
  const latestRequest = useRef(0);
  const developmentRef = useRef<CourseView['development']>();
  const runtimeRef = useRef<StepsAgentWorld>();

  const updateDevelopment = useCallback((development: CourseView['development']) => {
    developmentRef.current = development;
    const globals = worldGlobal();
    if (!development) {
      if (runtimeRef.current && globals.stepsAgentWorld === runtimeRef.current) delete globals.stepsAgentWorld;
      return;
    }
    if (globals.stepsAgentWorld) return;
    const requireDevelopment = () => {
      const current = developmentRef.current;
      if (!current) throw new Error('course_unavailable');
      return current;
    };
    const runtime: StepsAgentWorld = {
      openApp(appKey, path = '/') {
        const current = requireDevelopment();
        if (!APP_KEY.test(appKey) || !validCoursePath(path)) throw new Error('invalid_course_target');
        if (window.parent !== window) {
          reportDevelopment(current, { type: 'steps:open-app', appKey, path });
        } else {
          const target = new URL(current.testUrl);
          target.searchParams.set('app', appKey);
          target.searchParams.set('path', path);
          window.location.assign(target.toString());
        }
      },
      async invokeService(serviceKey, path, init) {
        requireDevelopment();
        const pathname = path.split('?')[0]!;
        if (!APP_KEY.test(serviceKey) || path.includes('#') || !validCoursePath(pathname)) {
          throw new Error('invalid_course_service');
        }
        const response = await fetch(`/__steps/course/services/${encodeURIComponent(serviceKey)}/invoke${path}`, {
          ...init, credentials: 'same-origin', redirect: 'manual',
        });
        return response;
      },
    };
    runtimeRef.current = runtime;
    globals.stepsAgentWorld = runtime;
  }, []);

  useEffect(() => () => updateDevelopment(undefined), [updateDevelopment]);

  const apply = useCallback((next: CourseView) => {
    // An unchanged course keeps its objects: an App effect keyed on view or currentMission that refreshes
    // after its own check would otherwise run again on every refresh, forever.
    if (viewRef.current && JSON.stringify(viewRef.current) === JSON.stringify(next)) {
      setJustCompleted(NONE);
      return;
    }
    const previousDevelopment = developmentRef.current;
    const development = source === 'development' ? trustedDevelopment(next) : undefined;
    const lostDevelopment = previousDevelopment && !development;
    if (lostDevelopment) reportDevelopment(previousDevelopment, { type: 'steps:course-unavailable' });
    if (source === 'development') updateDevelopment(development);
    if (next.mode !== 'preview' && !next.readOnly) setLocalRole(null);
    setJustCompleted(newlyCompleted(viewRef.current, next));
    viewRef.current = next;
    setView(next);
    // A course with no missions and at most one role has nothing to guide (the one role is given, below);
    // two roles are enough to show it.
    const empty = next.missions.length === 0 && next.roles.length <= 1;
    setStatus(lostDevelopment ? 'unavailable' : empty ? 'hidden' : 'ready');
  }, [source, updateDevelopment]);

  const refresh = useCallback(async () => {
    if (!source) return;
    const request = ++latestRequest.current;
    try {
      const response = await fetch(COURSE_PATH, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error('course_unavailable');
      const next = (await response.json()) as CourseView;
      if (request === latestRequest.current) apply(next);
    } catch {
      // A learner without a readable World session is told how to get back in;
      // preview and development without a course show nothing.
      if (request === latestRequest.current) {
        const development = developmentRef.current;
        if (development) reportDevelopment(development, { type: 'steps:course-unavailable' });
        updateDevelopment(undefined);
        viewRef.current = null;
        setView(null);
        setJustCompleted(NONE);
        setStatus(source === 'world' || development ? 'unavailable' : 'hidden');
      }
    }
  }, [apply, source, updateDevelopment]);

  useEffect(() => {
    void refresh();
  }, [location.pathname, location.search, refresh]);

  useEffect(() => {
    const development = developmentRef.current;
    if (development && validCoursePath(location.pathname)) {
      reportDevelopment(development, { type: 'steps:location', path: location.pathname });
    }
  }, [view, location.pathname]);

  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const chooseRole = useCallback(async (roleKey: string) => {
    const current = viewRef.current;
    if (!current) return;
    if (current.mode === 'preview' || current.readOnly) {
      setLocalRole(roleKey);
      return;
    }
    const request = ++latestRequest.current;
    try {
      const response = await fetch(ROLE_PATH, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ roleKey }),
      });
      if (!response.ok) throw new Error('course_role_refused');
      const next = (await response.json()) as CourseView;
      if (request === latestRequest.current) apply(next);
    } catch {
      // A refused or lost choice (already chosen elsewhere, session ended,
      // network) re-reads the course rather than failing the page.
      await refresh();
    }
  }, [apply, refresh]);

  // One role and no missions is no choice: the person is given that role (once per page) so the App's server
  // still receives it, and the guide shows nothing.
  const givenRole = useRef<string | null>(null);
  useEffect(() => {
    if (!view || view.missions.length > 0 || view.roles.length !== 1 || view.role !== null) return;
    const { roleKey } = view.roles[0]!;
    if (givenRole.current === roleKey) return;
    givenRole.current = roleKey;
    void chooseRole(roleKey);
  }, [chooseRole, view]);

  const course = useMemo<Course>(() => {
    // A local choice (preview, read-only session) is the newest one, so it wins over a saved role.
    const roleKey = localRole ?? view?.role ?? null;
    const role = view?.roles.find((candidate) => candidate.roleKey === roleKey) ?? null;
    const myMissions = (view?.missions ?? []).filter(
      (mission) => mission.roleKeys.length === 0 || (roleKey !== null && mission.roleKeys.includes(roleKey)),
    );
    return {
      status,
      view,
      role,
      myMissions,
      currentMission: myMissions.find((mission) => mission.completedAt === null) ?? null,
      justCompleted,
      chooseRole,
      refresh,
    };
  }, [chooseRole, justCompleted, localRole, refresh, status, view]);

  return createElement(CourseContext.Provider, { value: course }, children);
}

export function useCourse(): Course {
  const course = useContext(CourseContext);
  if (!course) throw new Error('useCourse must be used inside CourseProvider');
  return course;
}
