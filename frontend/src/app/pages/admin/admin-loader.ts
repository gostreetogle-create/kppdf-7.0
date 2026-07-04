import { Observable, forkJoin, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import {
  ApiService,
  type Role,
  type Permission,
  type User,
  type Product,
  type Organization,
  type Material,
  type BomModule,
  type WorkType,
  type Employee,
} from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ADMIN_TABS, type AdminPermKey } from './admin-tabs';

/**
 * Pure dependency-injection-free helpers extracted from the admin
 * component's `initialDataLoader()` for unit-testability.
 *
 * Why pure:
 *   1. `buildAdminLoadStreams` + `awaitAllStreams` capture the admin tab's
 *      load choreography without coupling to RxJS identity, Angular DI, or
 *      component lifecycle (DestroyRef / takeUntilDestroyed stay in the
 *      caller). Unit tests inject fakes for `api`, `auth`, and `hooks`
 *      without standing up a TestBed.
 *   2. Side effects are funneled through hooks (`onXLoaded`, `onStreamError`)
 *      so the same stream-building code can drive SUT signals OR test
 *      assertions without component scaffolding.
 */

/**
 * Function shape exposed by `LoadDeps.api` — the minimum subset an
 * `ApiService`-compatible fake needs to satisfy for unit tests. Real
 * production code passes `this.api` (typed `ApiService`) which is a
 * structural superset.
 */
export type AdminApiSubset = Pick<
  ApiService,
  | 'getRoles'
  | 'getPermissions'
  | 'getUsers'
  | 'getProducts'
  | 'getOrganizations'
  | 'getMaterials'
  | 'getModules'
  | 'getWorkTypes'
  | 'getEmployees'
>;

/** Same idea for auth: any object exposing `hasPermission(key): boolean`. */
export type AdminAuthSubset = Pick<AuthService, 'hasPermission'>;

/**
 * Side-effect channel used by `buildAdminLoadStreams`. Each `onXLoaded`
 * is optional — tests can leave them unset when only error reporting
 * is under test. `onStreamError` is mandatory so every failure path
 * has a place to surface a message.
 *
 * Callback signatures use the concrete entity types imported from
 * `api.service.ts` so callers can route payloads directly into
 * strongly-typed Angular signals without unsafe casts.
 */
export interface LoadHooks {
  onRolesLoaded?: (roles: Role[]) => void;
  onPermissionsLoaded?: (permissions: Permission[]) => void;
  onUsersLoaded?: (users: User[]) => void;
  onProductsLoaded?: (products: Product[]) => void;
  onOrganizationsLoaded?: (organizations: Organization[]) => void;
  onMaterialsLoaded?: (materials: Material[]) => void;
  onModulesLoaded?: (modules: BomModule[]) => void;
  onWorkTypesLoaded?: (workTypes: WorkType[]) => void;
  onEmployeesLoaded?: (employees: Employee[]) => void;
  onStreamError: (key: string, msg: string | null) => void;
}

export interface LoadDeps {
  api: AdminApiSubset;
  auth: AdminAuthSubset;
  hooks: LoadHooks;
}

/**
 * Build the streams that hydrate the admin page on first paint
 * plus any subsequent reload. Each stream:
 *   - on success: invokes the matching `onXLoaded` hook with the
 *     server payload
 *   - on error:   invokes `onStreamError(<loadKey>, 'Ошибка …')` and
 *     recovers with `of(null)` so `forkJoin` can still complete
 *
 * Permission gating flows from `ADMIN_TABS` (admin-tabs.ts) — a single
 * source of truth shared with the dropdown nav renderer and the
 * default-tab seed. Per-perm stream count is encoded below:
 *
 *   ROLES_READ          → loadRoles + loadPermissions (RBAC matrix needs
 *                         both datasets hydrated before it can render)
 *   USERS_READ          → loadUsers
 *   PRODUCTS_READ       → loadProducts
 *   ORGANIZATIONS_READ  → loadOrganizations
 *   MATERIALS_READ      → loadMaterials
 *   MODULES_READ        → loadModules
 *   WORKTYPES_READ      → loadWorkTypes
 *   EMPLOYEES_READ      → loadEmployees
 *
 * Streams the user lacks permission for are not added to the output
 * array. The component layer renders the `no-permissions` placeholder
 * when the user has zero read-permissions, so empty arrays here are
 * the correct signal for "user has no admin tabs".
 *
 * The function does NOT subscribe — caller (component) decides the
 * subscribe pattern (e.g. with `takeUntilDestroyed`) and the downstream
 * coordinator (e.g. `awaitAllStreams`).
 */
export function buildAdminLoadStreams({
  api,
  auth,
  hooks,
}: LoadDeps): Observable<unknown>[] {
  const report = (key: string, msg: string): void =>
    hooks.onStreamError(key, msg);

  /**
   * Stream catalog keyed by permission. Each permission maps to the
   * list of streams that must run when an admin user has that perm.
   * The RBAC-matrix co-load for `ROLES_READ` is encoded here as a
   * two-element array; everything else is a single stream.
   *
   * Decoupling rationale: keeping each stream array here (rather than
   * e.g. an `extraStreams` field on `ADMIN_TABS`) preserves the
   * "tab/perm = UI metadata; stream catalog = load-time wiring"
   * boundary. UI changes don't touch load streams and vice versa.
   */
  const streamByPerm: Record<AdminPermKey, Observable<unknown>[]> = {
    ROLES_READ: [
      api.getRoles().pipe(
        tap((r) => hooks.onRolesLoaded?.(r)),
        catchError(() => {
          report('loadRoles', 'Ошибка загрузки ролей');
          return of(null);
        }),
      ),
      api.getPermissions().pipe(
        tap((p) => hooks.onPermissionsLoaded?.(p)),
        catchError(() => {
          report('loadPermissions', 'Ошибка загрузки разрешений');
          return of(null);
        }),
      ),
    ],
    USERS_READ: [
      api.getUsers().pipe(
        tap((u) => hooks.onUsersLoaded?.(u)),
        catchError(() => {
          report('loadUsers', 'Ошибка загрузки пользователей');
          return of(null);
        }),
      ),
    ],
    PRODUCTS_READ: [
      api.getProducts().pipe(
        tap((p) => hooks.onProductsLoaded?.(p)),
        catchError(() => {
          report('loadProducts', 'Ошибка загрузки товаров');
          return of(null);
        }),
      ),
    ],
    ORGANIZATIONS_READ: [
      api.getOrganizations().pipe(
        tap((o) => hooks.onOrganizationsLoaded?.(o)),
        catchError(() => {
          report('loadOrganizations', 'Ошибка загрузки организаций');
          return of(null);
        }),
      ),
    ],
    MATERIALS_READ: [
      api.getMaterials().pipe(
        tap((m) => hooks.onMaterialsLoaded?.(m)),
        catchError(() => {
          report('loadMaterials', 'Ошибка загрузки материалов');
          return of(null);
        }),
      ),
    ],
    MODULES_READ: [
      api.getModules().pipe(
        tap((m) => hooks.onModulesLoaded?.(m)),
        catchError(() => {
          report('loadModules', 'Ошибка загрузки модулей');
          return of(null);
        }),
      ),
    ],
    WORKTYPES_READ: [
      api.getWorkTypes().pipe(
        tap((w) => hooks.onWorkTypesLoaded?.(w)),
        catchError(() => {
          report('loadWorkTypes', 'Ошибка загрузки видов работ');
          return of(null);
        }),
      ),
    ],
    EMPLOYEES_READ: [
      api.getEmployees().pipe(
        tap((e) => hooks.onEmployeesLoaded?.(e)),
        catchError(() => {
          report('loadEmployees', 'Ошибка загрузки сотрудников');
          return of(null);
        }),
      ),
    ],
  };

  // Walk ADMIN_TABS in its declared order. Perm-short users contribute
  // an empty array which `flatMap` collapses to no streams. Stable
  // order preserved end-to-end so test fixtures that introspect
  // stream order remain reliable.
  //
  // `streamByPerm[tab.perm]` cannot be `undefined` here:
  //   - `Record<AdminPermKey, T>` guarantees every key has a value
  //   - We intentionally do NOT add `?? []` because TS under
  //     `noUncheckedIndexedAccess` would still widen the lookup to
  //     `Observable<unknown>[] | undefined` — a missing catalog entry
  //     would then silently become a no-op. Loud failure at runtime
  //     is preferable to silently shipping a broken perm gate.
  return ADMIN_TABS.flatMap((tab) =>
    auth.hasPermission(tab.perm) ? streamByPerm[tab.perm] : [],
  );
}

/**
 * Completion coordinator. Pure thin wrapper around `forkJoin` whose
 * only value is being a named seam — tests can swap in
 * `combineLatest`, sequential awaits, race-condition test doubles, etc.
 * The component layer (admin.component.ts) attaches lifecycle operators
 * (`takeUntilDestroyed`) downstream of this seam.
 *
 * Emits an array of N values (one per input stream) on completion of
 * every source. All inputs are required to complete; this mirrors the
 * "wait for ALL streams to settle" rule documented on
 * `streamErrors`/`forkJoin` integration.
 */
export function awaitAllStreams<T>(streams: Observable<T>[]): Observable<T[]> {
  return forkJoin(streams);
}
