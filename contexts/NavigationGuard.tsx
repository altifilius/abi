import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useBlocker } from 'react-router-dom';
import { useI18n } from '../i18n';

interface GuardRegistry {
  setDirty: (id: string, dirty: boolean, onDiscard?: () => void) => void;
}
const GuardContext = createContext<GuardRegistry | null>(null);
const DirtyContext = createContext(false);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const { text } = useI18n();
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(() => new Set());
  const discardHandlers = useRef<Record<string, (() => void) | undefined>>({});
  const dirtyRef = useRef(false);
  const dirty = dirtyIds.size > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current &&
      `${currentLocation.pathname}${currentLocation.search}` !==
        `${nextLocation.pathname}${nextLocation.search}`,
  );
  const [registry] = useState<GuardRegistry>(() => ({
    setDirty(id, isDirty, onDiscard) {
      if (isDirty) discardHandlers.current[id] = onDiscard;
      else delete discardHandlers.current[id];
      dirtyRef.current = Object.keys(discardHandlers.current).length > 0;
      setDirtyIds((previous) => {
        if (previous.has(id) === isDirty) return previous;
        const next = new Set(previous);
        if (isDirty) next.add(id);
        else next.delete(id);
        return next;
      });
    },
  }));
  const dialogRef = useRef<HTMLDialogElement>(null);
  const stayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (blocker.state === 'blocked' && !dirty) {
      blocker.proceed();
      return;
    }
    if (blocker.state === 'blocked') {
      dialogRef.current?.showModal();
      stayRef.current?.focus();
    } else dialogRef.current?.close();
  }, [blocker.state, dirty, blocker]);
  return (
    <GuardContext.Provider value={registry}>
      <DirtyContext.Provider value={dirty}>
        {children}
        <dialog
          ref={dialogRef}
          aria-labelledby="unsaved-title"
          onCancel={(event) => {
            event.preventDefault();
            if (blocker.state === 'blocked') blocker.reset();
          }}
        >
          <h2 id="unsaved-title">{text('Kaydedilmemiş değişiklikler var', 'Unsaved changes')}</h2>
          <p>
            {text(
              'Bu ekrandan ayrılırsanız kaydedilmemiş değişiklikler silinir. Önce kaydetmek için ekranda kalın.',
              'Leaving will discard unsaved changes. Stay on this screen to save first.',
            )}
          </p>
          <div className="actions">
            <button
              type="button"
              ref={stayRef}
              onClick={() => {
                if (blocker.state === 'blocked') blocker.reset();
              }}
            >
              {text('Ekranda kal', 'Stay here')}
            </button>
            <button
              type="button"
              onClick={() => {
                for (const id of dirtyIds) discardHandlers.current[id]?.();
                discardHandlers.current = {};
                dirtyRef.current = false;
                setDirtyIds(new Set());
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              {text('Değişiklikleri bırak ve ayrıl', 'Discard and leave')}
            </button>
          </div>
        </dialog>
      </DirtyContext.Provider>
    </GuardContext.Provider>
  );
}

export function useUnsavedChanges(dirty: boolean, onDiscard?: () => void): void {
  const registry = useContext(GuardContext);
  const id = useId();
  const discard = useRef(onDiscard);
  discard.current = onDiscard;
  if (!registry) throw new Error('NavigationGuardProvider is required');
  useEffect(() => {
    registry.setDirty(id, dirty, () => discard.current?.());
    return () => registry.setDirty(id, false);
  }, [id, dirty, registry]);
}

export function useHasUnsavedChanges(): boolean {
  return useContext(DirtyContext);
}
