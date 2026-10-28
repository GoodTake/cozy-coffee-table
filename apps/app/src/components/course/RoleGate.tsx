import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCourse } from '../../lib/course';

const keepOpen = (event: Event) => event.preventDefault();

interface RoleGateProps {
  /** Set when the gate is reopened to change role: it can be closed without choosing. */
  onClose?: () => void;
}

/** Covers the whole App until the learner picks a role. One click picks it: no confirmation, and no skip on the first choice. */
export default function RoleGate({ onClose }: RoleGateProps) {
  const { view, chooseRole } = useCourse();
  const [choosing, setChoosing] = useState(false);
  if (!view) return null;
  const rolesOnly = view.missions.length === 0;

  const choose = async (roleKey: string) => {
    setChoosing(true);
    try {
      await chooseRole(roleKey);
    } finally {
      setChoosing(false);
    }
    onClose?.();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent
        onEscapeKeyDown={onClose ? undefined : keepOpen}
        onPointerDownOutside={keepOpen}
        onInteractOutside={keepOpen}
        className="left-0 top-0 block h-full max-w-none translate-x-0 translate-y-0 overflow-y-auto border-0 px-4 py-10 data-[state=open]:animate-none sm:rounded-none sm:px-6 [&>button:last-child]:hidden"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-semibold sm:text-3xl">Choose your role</DialogTitle>
            <DialogDescription className="text-base">
              {rolesOnly
                ? 'Your role decides what you can do in this course.'
                : 'Your role decides which missions you do in this course.'}
            </DialogDescription>
          </DialogHeader>
          {onClose && (
            <Button variant="outline" className="h-11 self-start" onClick={onClose}>
              Cancel
            </Button>
          )}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {view.roles.map((role) => {
              const missions = view.missions.filter(
                (mission) => mission.roleKeys.length === 0 || mission.roleKeys.includes(role.roleKey),
              );
              return (
                <li
                  key={role.roleKey}
                  className="flex flex-col gap-4 rounded-lg border bg-card p-5 text-card-foreground"
                >
                  <div className="flex flex-col gap-1">
                    <h2 className="text-lg font-semibold">{role.title}</h2>
                    <p className="text-sm text-muted-foreground">{role.description}</p>
                  </div>
                  {missions.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Your missions
                      </h3>
                      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
                        {missions.map((mission) => (
                          <li key={mission.missionKey}>{mission.title}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                  <Button className="mt-auto h-11 w-full" disabled={choosing} onClick={() => void choose(role.roleKey)}>
                    Play as {role.title}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
