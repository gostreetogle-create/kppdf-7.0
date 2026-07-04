import { Component, OnInit, inject, signal, computed, DestroyRef, HostListener } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';

import {
  ReactiveFormsModule,
  FormBuilder,
  FormArray,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { buildAdminLoadStreams, awaitAllStreams } from './admin-loader';
import {
  ApiService,
  type Role,
  type Permission,
  type User,
  type Product,
  type Organization,
  type LegalType,
  type PartyType,
  type OrganizationContact,
  type Material,
  type BomModule,
  type WorkType,
  type Employee,
  type ProductStatus,
  type ModuleMaterial,
  type ModuleWork,
  type CreateMaterialDto,
  type CreateBomModuleDto,
  type CreateWorkTypeDto,
  type CreateEmployeeDto,
} from '../../services/api.service';
import { ADMIN_TABS, NAV_GROUPS, type AdminNavGroup, type AdminNavGroupId, type AdminTabName } from './admin-tabs';

interface SectionGroup {
  section: string;
  actions: string[];
}

/**
 * Top-nav grouping + tab/permission mapping live in `./admin-tabs.ts`
 * (ADMIN_TABS + NAV_GROUPS) — single source of truth shared with
 * `admin-loader.ts`. Adding a 5th tab now requires editing only that
 * file. The shape `{id, label, items[]}` plus each item's
 * `{tab, label, perm}` is preserved, so the dropdown-nav renderer
 * and the load-stream builder iterate the same metadata.
 */

/**
 * Read the user's explicit theme pick from `localStorage`, or
 * `null` if no choice has been recorded yet. SSR / private-mode
 * safe via try/catch — single helper used by BOTH `readInitialTheme`
 * (boot-time paint) AND `listenSystemThemeChanges` (live system-pref
 * updates) so the two paths can't drift on storage semantics.
 */
function readStoredTheme(): 'dark' | 'light' | null {
  try {
    const v =
      typeof localStorage !== 'undefined'
        ? localStorage.getItem('kppdf-theme')
        : null;
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Synchronously pick the user's initial theme to keep the very
 * first paint `data-theme`-correct (no FOUC). Lookup order:
 *   1. `localStorage['kppdf-theme']` — explicit user pick via toggle
 *   2. `prefers-color-scheme: light` media query — OS-level hint for
 *      users who haven't yet visited the theme toggle
 *   3. `'dark'` — safe default brand-grade palette
 *
 * The `matchMedia` read is private-mode safe via try/catch so the
 * field initializer never throws even when storage APIs are unavailable.
 */
function readInitialTheme(): 'dark' | 'light' {
  const stored = readStoredTheme();
  if (stored !== null) return stored;
  try {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-color-scheme: light)').matches
    ) {
      return 'light';
    }
  } catch {
    /* fall through */
  }
  return 'dark';
}

/**
 * Reactive FormGroup for a single Organization.contact[] entry.
 * Kept as a normal `FormGroup` (not strictly typed) for ergonomic array access.
 */
type ContactFormGroup = FormGroup<{
  name: FormControl<string>;
  position: FormControl<string>;
  phone: FormControl<string>;
  email: FormControl<string>;
}>;

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
  // Bind the theme as a data-theme attribute on the host element so
  // `:host([data-theme="light"])` selectors in CSS flip the palette.
  // Using host bindings instead of [attr.data-theme] on a wrapper
  // element avoids adding an extra DOM node just for theming.
  host: {
    '[attr.data-theme]': 'theme()',
  },
})
export class AdminComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly roles = signal<Role[]>([]);
  readonly permissions = signal<Permission[]>([]);
  readonly users = signal<User[]>([]);
  readonly products = signal<Product[]>([]);
  readonly organizations = signal<Organization[]>([]);
  // BOM domain (PSL-012) — four new entities, one signal each.
  readonly materials = signal<Material[]>([]);
  readonly modules = signal<BomModule[]>([]);
  readonly workTypes = signal<WorkType[]>([]);
  readonly employees = signal<Employee[]>([]);
  /**
   * Per-stream error map. Each key is a stream name; the value is a
   * human-readable error message (or `null` if the slot is empty). Keys:
   *
   *   load:           loadRoles / loadPermissions / loadUsers /
   *                   loadProducts / loadOrganizations
   *   mutations:      updateRole (permission toggle PATCH)
   *                   saveRole / deleteRole / saveUser / deleteUser /
   *                   saveProduct / copyProduct / deleteProduct /
   *                   saveOrg / deleteOrganization
   *
   * Multiple simultaneous failures stay visible (no clobbering). The
   * per-key helper's `null` arg removes the slot, used to clear prior
   * errors after a successful retry.
   */
  readonly streamErrors = signal<Record<string, string | null>>({});
  readonly activeTab = signal<AdminTabName>(
    // Pick the first accessible tab as the landing page so users with
    // a non-default permission profile never start on a hidden tab.
    // Iterating `ADMIN_TABS` keeps this cascade in lockstep with the
    // dropdown-nav menu — adding a 5th tab is automatic and free of
    // a second edit-site to keep in sync.
    // Frozen at component instantiation; mid-session role switching
    // re-routes them via @if guards but does NOT change `activeTab()`
    // — they have to click an available tab to navigate.
    ADMIN_TABS.find((t) => this.auth.hasPermission(t.perm))?.tab ??
      'organizations',
  );

  /** Available legal types + party types — single source of truth for templates. */
  readonly LEGAL_TYPES: LegalType[] = ['OOO', 'IP', 'FL'];
  readonly PARTY_TYPES: PartyType[] = ['SUPPLIER', 'SELLER', 'BUYER'];

  /**
   * Russian display labels for backend-stored enums. The DB and API
   * keep wire-format keys (OOO / SUPPLIER / …) so we don't need a
   * backend i18n pass — only the UI translates when reading.
   *
   * - Keep `Record<EnumType, string>` so a future schema change that
   *   adds a new enum value forces an explicit translation decision
   *   instead of silently falling through to the raw English key.
   * - Don't translate `Role.name` / `Permission.section` here — those
   *   are user-defined dynamic data sourced from the API, and would
   *   need a DB migration or backend i18n layer to localize properly.
   * - Role.status (`ACTIVE` / `ARCHIVED`) intentionally has no
   *   translate helper: the template branches on the status itself
   *   (`@if (role.isSystemRole)` / `@if (role.status === 'ARCHIVED')`)
   *   and uses inline Russian badge text in each branch, so a
   *   getLabel(s) helper would just be a no-op indirection.
   */
  readonly LEGAL_TYPE_LABELS: Record<LegalType, string> = {
    OOO: 'ООО',
    IP: 'ИП',
    FL: 'Физ. лицо',
  };
  readonly PARTY_TYPE_LABELS: Record<PartyType, string> = {
    SUPPLIER: 'Поставщик',
    SELLER: 'Продавец',
    BUYER: 'Покупатель',
  };

  // ─── Enum → label helpers (called from templates) ────────────────

  translateLegalType(t: LegalType): string {
    return this.LEGAL_TYPE_LABELS[t] ?? t;
  }

  translatePartyType(t: PartyType): string {
    return this.PARTY_TYPE_LABELS[t] ?? t;
  }

  /**
   * Whole-array formatter for the Organizations table partyTypes cell.
   * Falls back to em-dash when empty so the column never renders blank.
   */
  translatePartyTypes(
    types: readonly PartyType[] | null | undefined,
  ): string {
    return types?.length
      ? types.map((t) => this.translatePartyType(t)).join(', ')
      : '—';
  }

  /** Top-nav groups — re-exported from `./admin-tabs.ts` for template access. */
  readonly NAV_GROUPS = NAV_GROUPS;

  /**
   * UI theme. Persisted to localStorage under `kppdf-theme` and read
   * synchronously here so the initial paint already has the right
   * `:host([data-theme=...])` attribute (no FOUC). SSR / private-mode
   * safe — both reads and writes are wrapped in try/catch.
   */
  readonly theme = signal<'dark' | 'light'>(readInitialTheme());

  /** Which nav-group's dropdown panel is currently open (null = none). */
  readonly openGroupId = signal<AdminNavGroupId | null>(null);

  // ━━ BOM domain (PSL-012) — 4 new entities + 4 form groups ━━━━━━

  /** All product status values + their human labels (BR-PRD-5). */
  readonly PRODUCT_STATUSES: ProductStatus[] = [
    'DRAFT',
    'READY',
    'IN_PRODUCTION',
    'COMPLETED',
    'ARCHIVED',
  ];
  readonly PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
    DRAFT: 'Черновик',
    READY: 'Готов к реализации',
    IN_PRODUCTION: 'В производстве',
    COMPLETED: 'Завершён',
    ARCHIVED: 'В архиве',
  };

  // ── Materials ──
  readonly editingMaterial = signal<Material | null>(null);
  readonly showMaterialForm = signal(false);
  readonly materialForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    sku: [
      '',
      [
        // BR-MAT-3: regex ^MAT-[A-Z0-9-]+$, 8–50 chars (validated backend-side too).
        Validators.required,
        Validators.pattern(/^MAT-[A-Z0-9-]+$/),
        Validators.minLength(8),
        Validators.maxLength(50),
      ],
    ],
    supplierId: ['', [Validators.required]],
    unit: ['', [Validators.required]],
    pricePerUnit: [0, [Validators.min(0)]],
    category: [''],
    priceCurrency: ['RUB'],
    notes: [''],
  });

  // ── Modules (BOM) ──
  readonly editingModule = signal<BomModule | null>(null);
  readonly showModuleForm = signal(false);
  readonly moduleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    sku: [
      '',
      [
        // BR-MOD-3: regex ^[A-Z0-9-]+$, 3–32 chars.
        Validators.required,
        Validators.pattern(/^[A-Z0-9-]+$/),
        Validators.minLength(3),
        Validators.maxLength(32),
      ],
    ],
    category: [''],
    notes: [''],
  });

  // ── WorkTypes ──
  readonly editingWorkType = signal<WorkType | null>(null);
  readonly showWorkTypeForm = signal(false);
  readonly workTypeForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    hourlyRate: [0, [Validators.required, Validators.min(0)]],
    description: [''],
  });

  // ── Employees ──
  readonly editingEmployee = signal<Employee | null>(null);
  readonly showEmployeeForm = signal(false);
  readonly employeeForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    fullName: [''],
    phone: [''],
    email: ['', [Validators.email]],
    active: [true],
  });

  // ── BOM Materials / Works sub-arrays (module form detail) ──
  readonly moduleMaterials = signal<ModuleMaterial[]>([]);
  readonly moduleWorks = signal<ModuleWork[]>([]);
  readonly computeModuleCostResult = signal<{
    materialsCost: number;
    worksCost: number;
    childModulesCost: number;
    totalCost: number;
  } | null>(null);

  // ━━ Role editing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  readonly editingRole = signal<Role | null>(null);
  readonly showRoleForm = signal(false);
  readonly roleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    permissions: [[] as string[], []],
  });

  // ━━ User editing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  readonly editingUser = signal<User | null>(null);
  readonly showUserForm = signal(false);
  readonly userForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.minLength(8)]],
    fullName: ['', [Validators.required]],
    phone: [''],
    roleId: ['', [Validators.required]],
  });

  // ━━ Product editing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  readonly editingProduct = signal<Product | null>(null);
  readonly showProductForm = signal(false);
  readonly productForm = this.fb.nonNullable.group({
    name: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(255)],
    ],
    sku: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(32),
        // BR-PRD-3: uppercase alphanumeric + hyphen
        Validators.pattern(/^[A-Z0-9-]+$/),
      ],
    ],
    description: [''],
    category: [''],
    unit: [''],
    price: [0, [Validators.min(0)]],
    cost: [0, [Validators.min(0)]],
  });
  // MVP: products take exactly one photo (linkedPhotoId). BR-PRD-4
  // requires photoIds to be non-empty on POST. We send a 1-element array.
  //
  // Note: `productPhotoError` is form-local (rendered inside `.photo-uploader`
  // next to the file input — NOT in the per-stream `streamErrors` map). The
  // asymmetry is intentional: photo failures are contextual to the current
  // form-open moment, not to a tab-level data load. Migrating it to
  // `streamErrors` would conflate two different error scopes.
  readonly productPhotoUploading = signal(false);
  readonly productPhotoError = signal<string | null>(null);
  readonly productPhotoLinkedId = signal<string | null>(null);
  readonly productPhotoPreviewUrl = signal<string | null>(null);
  /**
   * Tracks photo clusters uploaded during this form session that haven't
   * yet been attached to a saved Product. On Cancel without Save (or
   * tab-switch) we cascade-delete them via /api/storage/photos/:id so the
   * filesystem doesn't collect orphans. Existing product photos (loaded
   * via `editProduct`) are NOT in this set — they are owned by the
   * product and must not be deleted client-side.
   */
  readonly pendingProductPhotoIds = signal<Set<string>>(new Set());

  // ━━ Organization editing ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  readonly editingOrg = signal<Organization | null>(null);
  readonly showOrgForm = signal(false);
  readonly orgForm = this.fb.nonNullable.group({
    name: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(255)],
    ],
    // The selected legal type drives which conditional fields are
    // required (OOO→inn/kpp/ogrn + director; IP→inn/ogrnip; FL→passport).
    legalType: this.fb.nonNullable.control<LegalType>('OOO'),
    // ─── Common ───
    inn: [''],
    phone: [''],
    email: ['', [Validators.email]],
    website: [''],
    legalAddress: [''],
    actualAddress: [''],
    // ─── OOO ───
    kpp: [''],
    ogrn: [''],
    directorName: [''],
    registrationDate: [''],
    // ─── IP ───
    ogrnip: [''],
    ipRegistrationDate: [''],
    // ─── FL ───
    passportSeries: [''],
    passportNumber: [''],
    passportIssuedBy: [''],
    passportIssuedDate: [''],
    // partyTypes is a FormControl<PartyType[]> — checked via forEach in
    // template; non-empty validated in saveOrg().
    partyTypes: this.fb.nonNullable.control<PartyType[]>([]),
    // contacts is a FormArray, populated lazily via makeContactGroup().
    contacts: this.fb.array<ContactFormGroup>([]),
  });

  readonly sectionGroups = computed<SectionGroup[]>(() => {
    const groups = new Map<string, Set<string>>();
    for (const p of this.permissions()) {
      if (!groups.has(p.section)) groups.set(p.section, new Set());
      groups.get(p.section)!.add(p.action);
    }
    return Array.from(groups.entries()).map(([section, actions]) => ({
      section,
      actions: Array.from(actions).sort(),
    }));
  });

  readonly activeRoles = computed(() =>
    this.roles().filter((r) => r.status === 'ACTIVE'),
  );

  ngOnInit(): void {
    this.initialDataLoader();
    this.listenSystemThemeChanges();
  }

  /**
   * Glue between component state and the pure helpers in
   * `admin-loader.ts`. The actual stream-building and fork-join
   * choreography live there so unit tests can stub `api`/`auth` and
   * assert against `hooks` without standing up a TestBed.
   *
   * This method stays in the component because it touches
   * Angular-specific state: `signal.set`, `takeUntilDestroyed`,
   * loading flag, and streamErrors map.
   */
  private initialDataLoader(): void {
    this.loading.set(true);
    // Clear stale load errors from a previous visit; action errors (saveX,
    // deleteX, copyX) keep their slots so a user can switch tabs and come
    // back without losing the failure context.
    this.clearStreamErrorsByPrefix('load');

    const streams = buildAdminLoadStreams({
      api: this.api,
      auth: this.auth,
      hooks: {
        onRolesLoaded: (r) => this.roles.set(r),
        onPermissionsLoaded: (p) => this.permissions.set(p),
        onUsersLoaded: (u) => this.users.set(u),
        onProductsLoaded: (p) => this.products.set(p),
        onOrganizationsLoaded: (o) => this.organizations.set(o),
        onMaterialsLoaded: (m) => this.materials.set(m),
        onModulesLoaded: (m) => this.modules.set(m),
        onWorkTypesLoaded: (w) => this.workTypes.set(w),
        onEmployeesLoaded: (e) => this.employees.set(e),
        onStreamError: (k, m) => this.setStreamError(k, m),
      },
    });

    // `takeUntilDestroyed` cancels in-flight streams on component teardown
    // (logout, nav-away) so we don't fire `loading.set(false)` against a
    // destroyed view or leak via closure capture. forkJoin itself cannot
    // error here — every source is already `catchError`-wrapped to `of(null)`.
    awaitAllStreams(streams)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        complete: () => this.loading.set(false),
      });
  }

  // ─── Stream error helpers ─────────────────────────────

  /** Set or clear a single error slot. Pass `null` to remove the key. */
  setStreamError(key: string, msg: string | null): void {
    this.streamErrors.update((m) => {
      const next = { ...m };
      if (msg === null || msg === '') delete next[key];
      else next[key] = msg;
      return next;
    });
  }

  /** Helper for templates — returns the stored error string or null. */
  getStreamError(key: string): string | null {
    return this.streamErrors()[key] ?? null;
  }

  /** Bulk-remove all keys with a given prefix ("load", "save", "delete", …). */
  clearStreamErrorsByPrefix(prefix: string): void {
    this.streamErrors.update((m) => {
      const next = { ...m };
      for (const k of Object.keys(next)) {
        if (k.startsWith(prefix)) delete next[k];
      }
      return next;
    });
  }

  // ─── Generic helpers ─────────────────────────────────

  /**
   * NestJS HTTP errors come in two shapes:
   *   - validation pipe fails → `err.error = { statusCode, message: string[], error: 'Bad Request' }`
   *   - business exception   → `err.error = { statusCode, message: string,    error: 'Conflict' }`
   * Returns a human-readable single-line string, or `fallback` if no message found.
   */
  private extractErrorMessage(err: unknown, fallback: string): string {
    const e = (err as any)?.error;
    const m = e?.message;
    if (Array.isArray(m)) return m.join('; ');
    if (typeof m === 'string' && m.length > 0) return m;
    return fallback;
  }

  /**
   * Convert Mongo Date or ISO 8601 datetime → YYYY-MM-DD for `<input type="date">`.
   * Empty when no value. Handles already-truncated strings.
   */
  private toDateInput(v: string | Date | null | undefined): string {
    if (!v) return '';
    if (typeof v === 'string') return v.length >= 10 ? v.slice(0, 10) : v;
    return v.toISOString().slice(0, 10);
  }

  // ─── Role matrix helpers ─────────────────────────────

  hasPermission(role: Role, section: string, action: string): boolean {
    const key = `${section}_${action}`;
    return (role.permissions ?? []).includes(key);
  }

  togglePermission(role: Role, section: string, action: string): void {
    if (role.isSystemRole) return;
    const key = `${section}_${action}`;
    const keys = [...(role.permissions ?? [])];
    const idx = keys.indexOf(key);

    if (idx >= 0) {
      keys.splice(idx, 1);
      // If removing WRITE, also remove READ
      if (action === 'WRITE') {
        const readKey = `${section}_READ`;
        const ri = keys.indexOf(readKey);
        if (ri >= 0) keys.splice(ri, 1);
      }
    } else {
      keys.push(key);
      // If adding WRITE, also add READ (BR-USR-7)
      if (action === 'WRITE') {
        const readKey = `${section}_READ`;
        if (!keys.includes(readKey)) keys.push(readKey);
      }
    }

    this.api.updateRole(role._id, { permissions: keys }).subscribe({
      next: (updated) => {
        this.roles.update((list) =>
          list.map((r) => (r._id === updated._id ? updated : r)),
        );
        this.setStreamError('updateRole', null);
      },
      error: (err) => {
        this.setStreamError(
          'updateRole',
          this.extractErrorMessage(err, 'Ошибка обновления роли'),
        );
      },
    });
  }

  // ─── Role CRUD ───────────────────────────────────────

  openNewRole(): void {
    this.editingRole.set(null);
    this.roleForm.reset({ name: '', description: '', permissions: [] });
    this.showRoleForm.set(true);
  }

  editRole(role: Role): void {
    this.editingRole.set(role);
    this.roleForm.setValue({
      name: role.name,
      description: role.description ?? '',
      permissions: role.permissions,
    });
    this.showRoleForm.set(true);
  }

  saveRole(): void {
    if (this.roleForm.invalid) return;
    const data = this.roleForm.getRawValue();
    const edit = this.editingRole();

    const obs$ = edit
      ? this.api.updateRole(edit._id, data)
      : this.api.createRole(data);

    obs$.subscribe({
      next: (saved) => {
        this.roles.update((list) => {
          const idx = list.findIndex((r) => r._id === saved._id);
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
          return [...list];
        });
        this.setStreamError('saveRole', null);
        this.showRoleForm.set(false);
      },
      error: (err) => {
        this.setStreamError(
          'saveRole',
          this.extractErrorMessage(err, 'Ошибка сохранения роли'),
        );
      },
    });
  }

  deleteRole(role: Role): void {
    if (!confirm(`Удалить роль "${role.name}"?`)) return;
    this.api.deleteRole(role._id).subscribe({
      next: () => this.roles.update((list) => list.filter((r) => r._id !== role._id)),
      error: (err) =>
        this.setStreamError(
          'deleteRole',
          this.extractErrorMessage(err, 'Ошибка удаления роли'),
        ),
    });
  }

  // ─── User CRUD ───────────────────────────────────────

  openNewUser(): void {
    this.editingUser.set(null);
    // FormGroup.reset() re-enables all controls by default, so username
    // becomes editable again after a prior editUser() disable().
    this.userForm.reset();
    this.showUserForm.set(true);
  }

  editUser(user: User): void {
    this.editingUser.set(user);
    const roleId = typeof user.roleId === 'string' ? user.roleId : user.roleId._id;
    this.userForm.setValue({
      username: user.username,
      password: '',
      fullName: user.fullName,
      phone: user.phone ?? '',
      roleId,
    });
    // Lock username on edit (BR-USR-1) — toggling [disabled] on the DOM input
    // would emit "changed after checked" warnings. Control the disabled state
    // through the FormControl, which propagates to the DOM cleanly.
    this.userForm.controls.username.disable();
    this.showUserForm.set(true);
  }

  saveUser(): void {
    if (this.userForm.invalid) return;
    const data = this.userForm.getRawValue();
    const edit = this.editingUser();

    const payload: any = { fullName: data.fullName, phone: data.phone, roleId: data.roleId };
    if (data.password) payload.password = data.password;

    const obs$ = edit
      ? this.api.updateUser(edit._id, payload)
      : this.api.createUser({ ...payload, username: data.username });

    obs$.subscribe({
      next: (saved) => {
        this.users.update((list) => {
          const idx = list.findIndex((u) => u._id === saved._id);
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
          return [...list];
        });
        this.setStreamError('saveUser', null);
        this.showUserForm.set(false);
      },
      error: (err) => {
        this.setStreamError(
          'saveUser',
          this.extractErrorMessage(err, 'Ошибка сохранения пользователя'),
        );
      },
    });
  }

  deleteUser(user: User): void {
    if (!confirm(`Удалить пользователя "${user.username}"?`)) return;
    this.api.deleteUser(user._id).subscribe({
      next: () => this.users.update((list) => list.filter((u) => u._id !== user._id)),
      error: (err) =>
        this.setStreamError(
          'deleteUser',
          this.extractErrorMessage(err, 'Ошибка удаления пользователя'),
        ),
    });
  }

  // ─── Product CRUD (photo upload + COPY) ──────────────

  openNewProduct(): void {
    this.editingProduct.set(null);
    this.productForm.reset({
      name: '',
      sku: '',
      description: '',
      category: '',
      unit: '',
      price: 0,
      cost: 0,
    });
    this.productPhotoLinkedId.set(null);
    this.productPhotoPreviewUrl.set(null);
    this.productPhotoError.set(null);
    this.pendingProductPhotoIds.set(new Set());
    this.showProductForm.set(true);
  }

  editProduct(product: Product): void {
    this.editingProduct.set(product);
    this.productForm.setValue({
      name: product.name,
      sku: product.sku,
      description: product.description ?? '',
      category: product.category ?? '',
      unit: product.unit ?? '',
      price: product.price,
      cost: product.cost,
    });
    // Seed photo state from first photo. The existing product's photo is
    // owned by it — do NOT add to pendingProductPhotoIds.
    this.productPhotoLinkedId.set(product.photoIds?.[0] ?? null);
    this.productPhotoPreviewUrl.set(null);
    this.productPhotoError.set(null);
    this.pendingProductPhotoIds.set(new Set());
    this.showProductForm.set(true);
  }

  /** File-input change handler — uploads the chosen file immediately. */
  onProductPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadProductPhoto(file);
    // Reset so re-selecting the same file re-triggers `change`.
    input.value = '';
  }

  private uploadProductPhoto(file: File): void {
    this.productPhotoUploading.set(true);
    this.productPhotoError.set(null);
    this.api.uploadPhoto('products', file).subscribe({
      next: (res) => {
        // Backend (StorageService.upload) returns { linkedPhotoId, cluster: Photo[] }
        // — 3 photos sharing linkedPhotoId (ORIGINAL + MEDIUM + THUMBNAIL).
        const newId = res.linkedPhotoId;
        const cluster = res.cluster;

        // If user is REPLACING a previously-uploaded pending photo,
        // cascade-delete the orphan on the server side. If replacing the
        // existing product's photo, keep it (owned by product).
        const previousId = this.productPhotoLinkedId();
        if (previousId && this.pendingProductPhotoIds().has(previousId)) {
          this.api.deletePhoto(previousId).subscribe({
            error: () => {/* best-effort cleanup */},
          });
          this.pendingProductPhotoIds.update((s) => {
            const next = new Set(s);
            next.delete(previousId);
            return next;
          });
        }
        this.pendingProductPhotoIds.update((s) => {
          const next = new Set(s);
          next.add(newId);
          return next;
        });
        this.productPhotoLinkedId.set(newId);
        const thumb = cluster.find((p) => p.variant === 'THUMBNAIL');
        if (thumb) this.productPhotoPreviewUrl.set(thumb.storageUrl);
        this.productPhotoUploading.set(false);
      },
      error: (err) => {
        this.productPhotoError.set(
          this.extractErrorMessage(err, 'Ошибка загрузки фото'),
        );
        this.productPhotoUploading.set(false);
      },
    });
  }

  removeProductPhoto(): void {
    const id = this.productPhotoLinkedId();
    if (id && this.pendingProductPhotoIds().has(id)) {
      this.api.deletePhoto(id).subscribe({ error: () => {} });
      this.pendingProductPhotoIds.update((s) => {
        const next = new Set(s);
        next.delete(id);
        return next;
      });
    }
    this.productPhotoLinkedId.set(null);
    this.productPhotoPreviewUrl.set(null);
    this.productPhotoError.set(null);
  }

  saveProduct(): void {
    if (!this.auth.hasPermission('PRODUCTS_WRITE')) return;
    const photoLinkedId = this.productPhotoLinkedId();
    if (!photoLinkedId) {
      this.productPhotoError.set('Загрузите фото товара');
      return;
    }
    if (this.productForm.invalid) return;
    const raw = this.productForm.getRawValue();
    const data: any = {
      name: raw.name,
      sku: raw.sku,
      description: raw.description || undefined,
      category: raw.category || undefined,
      unit: raw.unit || undefined,
      price: raw.price,
      cost: raw.cost,
      photoIds: [photoLinkedId],
    };
    const edit = this.editingProduct();
    const obs$ = edit
      ? this.api.updateProduct(edit._id, data)
      : this.api.createProduct(data);
    obs$.subscribe({
      next: (saved) => {
        this.products.update((list) => {
          const idx = list.findIndex((p) => p._id === saved._id);
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
          return [...list];
        });
        // Product now owns the photos — clear pending tracker.
        this.pendingProductPhotoIds.set(new Set());
        this.setStreamError('saveProduct', null);
        this.showProductForm.set(false);
      },
      error: (err) => {
        this.setStreamError(
          'saveProduct',
          this.extractErrorMessage(err, 'Ошибка сохранения товара'),
        );
      },
    });
  }

  /**
   * Cancel button: cascade-delete any pending (newly-uploaded, not yet
   * saved) photo clusters, then close the form. Existing product photos
   * are NEVER deleted from this code path.
   */
  cancelProductForm(): void {
    const pending = Array.from(this.pendingProductPhotoIds());
    for (const id of pending) {
      this.api.deletePhoto(id).subscribe({ error: () => {} });
    }
    this.pendingProductPhotoIds.set(new Set());
    this.productPhotoLinkedId.set(null);
    this.productPhotoPreviewUrl.set(null);
    this.productPhotoError.set(null);
    this.showProductForm.set(false);
  }

  /** Deep-copy via POST /products/:id/copy — server auto-suffixes name/sku. */
  copyProduct(product: Product): void {
    if (!confirm(`Создать копию товара "${product.name}"?`)) return;
    this.api.copyProduct(product._id).subscribe({
      next: (copied) => {
        this.products.update((list) => [copied, ...list]);
        this.setStreamError('copyProduct', null);
      },
      error: (err) => {
        this.setStreamError(
          'copyProduct',
          this.extractErrorMessage(err, 'Ошибка копирования товара'),
        );
      },
    });
  }

  deleteProduct(product: Product): void {
    if (!confirm(`Удалить товар "${product.name}" (${product.sku})?`)) return;
    this.api.deleteProduct(product._id).subscribe({
      next: () =>
        this.products.update((list) =>
          list.filter((p) => p._id !== product._id),
        ),
      error: (err) =>
        this.setStreamError(
          'deleteProduct',
          this.extractErrorMessage(err, 'Ошибка удаления товара'),
        ),
    });
  }

  // ─── Organization CRUD (OOO/IP/FL conditional) ──────

  /** Translate `name`/etc of an empty seeded group → a reusable factory. */
  private makeContactGroup(c?: Partial<OrganizationContact>): ContactFormGroup {
    return this.fb.nonNullable.group({
      name: this.fb.nonNullable.control<string>(c?.name ?? '', [
        Validators.required,
      ]),
      position: this.fb.nonNullable.control<string>(c?.position ?? ''),
      phone: this.fb.nonNullable.control<string>(c?.phone ?? ''),
      email: this.fb.nonNullable.control<string>(c?.email ?? '', [
        Validators.email,
      ]),
    });
  }

  get orgContacts(): FormArray<ContactFormGroup> {
    return this.orgForm.controls.contacts as FormArray<ContactFormGroup>;
  }

  addOrgContact(): void {
    this.orgContacts.push(this.makeContactGroup());
  }

  removeOrgContact(idx: number): void {
    this.orgContacts.removeAt(idx);
  }

  togglePartyType(type: PartyType, checked: boolean): void {
    const current = this.orgForm.controls.partyTypes.value;
    if (checked) {
      if (!current.includes(type)) {
        this.orgForm.controls.partyTypes.setValue([...current, type]);
      }
    } else {
      this.orgForm.controls.partyTypes.setValue(
        current.filter((t) => t !== type),
      );
    }
  }

  hasPartyType(type: PartyType): boolean {
    return this.orgForm.controls.partyTypes.value.includes(type);
  }

  openNewOrg(): void {
    this.editingOrg.set(null);
    this.orgContacts.clear();
    this.orgForm.reset({
      name: '',
      legalType: 'OOO',
      inn: '',
      kpp: '',
      ogrn: '',
      directorName: '',
      registrationDate: '',
      ogrnip: '',
      ipRegistrationDate: '',
      passportSeries: '',
      passportNumber: '',
      passportIssuedBy: '',
      passportIssuedDate: '',
      phone: '',
      email: '',
      website: '',
      legalAddress: '',
      actualAddress: '',
      partyTypes: [],
    });
    this.showOrgForm.set(true);
  }

  editOrg(org: Organization): void {
    this.editingOrg.set(org);
    this.orgContacts.clear();
    for (const c of org.contacts ?? []) {
      this.orgContacts.push(this.makeContactGroup(c));
    }
    // Populate every conditional field with the value from the stored
    // document (if any). Without this, switching legal-types-after-save
    // silently blanks OOO/IP/FL data on edit (regression fix #2).
    this.orgForm.patchValue({
      name: org.name,
      legalType: org.legalType,
      // Common
      inn: org.inn ?? '',
      phone: org.phone ?? '',
      email: org.email ?? '',
      website: org.website ?? '',
      legalAddress: org.legalAddress ?? '',
      actualAddress: org.actualAddress ?? '',
      // OOO
      kpp: org.kpp ?? '',
      ogrn: org.ogrn ?? '',
      directorName: org.directorName ?? '',
      registrationDate: this.toDateInput(org.registrationDate),
      // IP
      ogrnip: org.ogrnip ?? '',
      ipRegistrationDate: this.toDateInput(org.ipRegistrationDate),
      // FL
      passportSeries: org.passportSeries ?? '',
      passportNumber: org.passportNumber ?? '',
      passportIssuedBy: org.passportIssuedBy ?? '',
      passportIssuedDate: this.toDateInput(org.passportIssuedDate),
      // Required
      partyTypes: org.partyTypes ?? [],
    });
    this.showOrgForm.set(true);
  }

  saveOrg(): void {
    if (!this.auth.hasPermission('ORGANIZATIONS_WRITE')) return;
    const partyTypes = this.orgForm.controls.partyTypes.value;
    if (partyTypes.length === 0) {
      this.setStreamError(
        'saveOrg',
        'Выберите хотя бы одну роль контрагента (BR-ORG-4)',
      );
      return;
    }
    const contacts = this.orgContacts.controls;
    for (const c of contacts) {
      if (c.invalid) {
        c.markAllAsTouched();
        this.setStreamError('saveOrg', 'Заполните обязательные поля контактов');
        return;
      }
    }
    const raw = this.orgForm.getRawValue();
    const legalType = raw.legalType as LegalType;
    // Strip legal-type-incompatible AND empty fields from the payload so
    // backend doesn't accidentally overwrite stored data with `null`.
    const clean = (v: string): string | undefined => v?.trim() || undefined;
    const data: any = {
      name: raw.name,
      legalType,
      partyTypes,
      contacts: this.orgContacts.getRawValue(),
    };
    // Common
    if (clean(raw.inn)) data.inn = clean(raw.inn);
    if (clean(raw.phone)) data.phone = clean(raw.phone);
    if (clean(raw.email)) data.email = clean(raw.email);
    if (clean(raw.website)) data.website = clean(raw.website);
    if (clean(raw.legalAddress)) data.legalAddress = clean(raw.legalAddress);
    if (clean(raw.actualAddress)) data.actualAddress = clean(raw.actualAddress);
    // Type-specific
    if (legalType === 'OOO') {
      if (clean(raw.kpp)) data.kpp = clean(raw.kpp);
      if (clean(raw.ogrn)) data.ogrn = clean(raw.ogrn);
      if (clean(raw.directorName)) data.directorName = clean(raw.directorName);
      if (clean(raw.registrationDate))
        data.registrationDate = clean(raw.registrationDate);
    } else if (legalType === 'IP') {
      if (clean(raw.ogrnip)) data.ogrnip = clean(raw.ogrnip);
      if (clean(raw.ipRegistrationDate))
        data.ipRegistrationDate = clean(raw.ipRegistrationDate);
    } else if (legalType === 'FL') {
      if (clean(raw.passportSeries))
        data.passportSeries = clean(raw.passportSeries);
      if (clean(raw.passportNumber))
        data.passportNumber = clean(raw.passportNumber);
      if (clean(raw.passportIssuedBy))
        data.passportIssuedBy = clean(raw.passportIssuedBy);
      if (clean(raw.passportIssuedDate))
        data.passportIssuedDate = clean(raw.passportIssuedDate);
    }

    const edit = this.editingOrg();
    const obs$ = edit
      ? this.api.updateOrganization(edit._id, data)
      : this.api.createOrganization(data);
    obs$.subscribe({
      next: (saved) => {
        this.organizations.update((list) => {
          const idx = list.findIndex((o) => o._id === saved._id);
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
          return [...list];
        });
        this.setStreamError('saveOrg', null);
        this.showOrgForm.set(false);
      },
      error: (err) => {
        this.setStreamError(
          'saveOrg',
          this.extractErrorMessage(err, 'Ошибка сохранения организации'),
        );
      },
    });
  }

  deleteOrganization(org: Organization): void {
    if (!confirm(`Удалить организацию "${org.name}"?`)) return;
    this.api.deleteOrganization(org._id).subscribe({
      next: () =>
        this.organizations.update((list) =>
          list.filter((o) => o._id !== org._id),
        ),
      error: (err) =>
        this.setStreamError(
          'deleteOrganization',
          this.extractErrorMessage(err, 'Ошибка удаления организации'),
        ),
    });
  }

  getRoleName(roleId: string | Role): string {
    if (typeof roleId === 'object') return roleId.name;
    const role = this.roles().find((r) => r._id === roleId);
    return role?.name ?? '—';
  }

  // ─── Tab helpers ─────────────────────────────────────

  setTab(tab: AdminTabName): void {
    // Cascade-cleanup: if the user is leaving the product form with
    // pending (un-saved) photo uploads, delete them server-side so they
    // don't accumulate as orphans. Existing product photos stay.
    if (this.showProductForm() && tab !== 'products') {
      const pending = Array.from(this.pendingProductPhotoIds());
      for (const id of pending) {
        this.api.deletePhoto(id).subscribe({ error: () => {} });
      }
      this.pendingProductPhotoIds.set(new Set());
      this.showProductForm.set(false);
      this.productPhotoLinkedId.set(null);
      this.productPhotoPreviewUrl.set(null);
    }
    this.editingRole.set(null);
    this.editingUser.set(null);
    this.showRoleForm.set(false);
    this.showUserForm.set(false);
    this.showOrgForm.set(false);
    // Clear stale LOAD-X errors visible on the new tab; preserve action
    // errors (saveX/deleteX/copyX) so context survives tab-switching.
    this.clearStreamErrorsByPrefix('load');
    this.activeTab.set(tab);
    // Close any open dropdown so the user sees the tab change cleanly.
    this.openGroupId.set(null);
  }

  // ─── Theme handling ────────────────────────────────

  /**
   * Flip the theme between dark and light. The host element's
   * `data-theme` attribute is bound reactively via `@Component({host})`
   * so the CSS variable layer (`admin.component.css`) re-resolves
   * automatically. localStorage persists across reloads.
   */
  toggleTheme(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('kppdf-theme', this.theme());
      }
    } catch {
      /* private-mode / quota — non-fatal */
    }
  }

  // ─── Top nav dropdown handling ────────────────────

  /**
   * Toggle a group dropdown. Outside-click + ESC are handled by
   * `onDocumentInteraction` so the user doesn't end up with a
   * stranded open menu when they click elsewhere on the page.
   */
  toggleNavGroup(id: AdminNavGroupId): void {
    this.openGroupId.update((current) => (current === id ? null : id));
  }

  /** Wraps setTab + dropdown-close for nav-item clicks in template. */
  selectTabFromNav(tab: AdminTabName): void {
    this.setTab(tab);
  }

  /**
   * Document-level interaction handler. Two responsibilities:
   *   1. Close any open dropdown panel when the user clicks outside
   *      it — covers clicks on the table area, form inputs, the
   *      theme-toggle button, etc.
   *   2. Close any open dropdown panel on `Escape` so keyboard users
   *      can dismiss the menu without tabbing back to the trigger.
   *
   * Skips the close path entirely when no group is open so we don't
   * impose a global click listener cost on the steady-state page.
   * The `closest('.nav-group')` check intentionally includes
   * BOTH the trigger button AND its dropdown panel children —
   * otherwise clicking an item would dismiss the menu before its
   * own click handler ran.
   */
  @HostListener('document:click', ['$event'])
  @HostListener('document:keydown.escape', ['$event'])
  onDocumentInteraction(event: Event): void {
    if (this.openGroupId() === null) return;
    if (event instanceof KeyboardEvent) {
      this.openGroupId.set(null);
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target && !target.closest('.nav-group')) {
      this.openGroupId.set(null);
    }
  }

  /**
   * Subscribe to OS-level theme changes. Auto-switches the local
   * theme ONLY when the user hasn't picked one explicitly — once
   * the toggle writes `localStorage['kppdf-theme']`, system
   * changes are ignored to respect the user's explicit choice.
   *
   * The matchMedia listener is cleaned up via `DestroyRef.onDestroy`
   * so it doesn't leak across logout/login cycles. SSR / browsers
   * without `matchMedia` short-circuit cleanly via the surrounding
   * try/catch — no-op fallback preserves the previous storage-only
   * behavior on those platforms.
   */
  private listenSystemThemeChanges(): void {
    try {
      if (typeof window === 'undefined' || !window.matchMedia) return;
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      const onChange = (e: MediaQueryListEvent): void => {
        // Only auto-switch if the user hasn't picked explicitly — once
        // the toggle writes `localStorage['kppdf-theme']` we always
        // respect that choice over the OS preference.
        if (readStoredTheme() !== null) return;
        this.theme.set(e.matches ? 'light' : 'dark');
      };
      mq.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() =>
        mq.removeEventListener('change', onChange),
      );
    } catch {
      /* private-mode / older browsers — non-fatal */
    }
  }

  /** Whether any item in this group is the currently active tab. */
  isGroupActive(group: AdminNavGroup): boolean {
    return group.items.some((item) => item.tab === this.activeTab());
  }

  /** Whether at least one item in this group is permission-visible. */
  hasAnyPermissionInGroup(group: AdminNavGroup): boolean {
    return group.items.some((item) => this.auth.hasPermission(item.perm));
  }

  /**
   * Whether the user has ANY admin read-permission. The
   * `no-permissions` placeholder template uses this to decide
   * whether to render "you have no admin tabs" vs the regular
   * tab content. Iterates `ADMIN_TABS` directly rather than
   * flattening `NAV_GROUPS.items[]` so the no-perm check stays
   * in lockstep with the same source-of-truth as the dropdown
   * nav and load-stream builder.
   */
  hasAnyReadPerm(): boolean {
    return ADMIN_TABS.some((t) => this.auth.hasPermission(t.perm));
  }

  logout(): void {
    this.auth.logout();
  }

  // ════════════════════════════════════════════════════════════════════
  // BOM domain (PSL-012) — CRUD for Materials, Modules, WorkTypes,
  // Employees + Product status/modules extension + computeModuleCost.
  // Aliases below are deliberately short — each tab UI shows 4 pipes per
  // entity. Naming convention matches existing methods (openNewX / saveX).
  // ════════════════════════════════════════════════════════════════════

  /** LABELS for Material.unit enum (admin.component.html). */
  readonly MATERIAL_UNIT_LABELS: Record<string, string> = {
    mm: 'мм',
    cm: 'см',
    m: 'м',
    kg: 'кг',
    g: 'г',
    pcs: 'шт.',
  };

  /** Material CRUD ────────────────────────────────────────────── */

  openNewMaterial(): void {
    this.editingMaterial.set(null);
    this.materialForm.reset({
      name: '',
      sku: '',
      supplierId: '',
      unit: 'pcs',
      pricePerUnit: 0,
      category: '',
      priceCurrency: 'RUB',
      notes: '',
    });
    this.showMaterialForm.set(true);
  }

  editMaterial(mat: Material): void {
    this.editingMaterial.set(mat);
    this.materialForm.patchValue({
      name: mat.name,
      sku: mat.sku,
      supplierId: mat.supplierId,
      unit: mat.unit,
      pricePerUnit: mat.pricePerUnit,
      category: mat.category ?? '',
      priceCurrency: mat.priceCurrency ?? 'RUB',
      notes: mat.notes ?? '',
    });
    this.showMaterialForm.set(true);
  }

  saveMaterial(): void {
    if (!this.auth.hasPermission('MATERIALS_WRITE')) return;
    if (this.materialForm.invalid) return;
    const raw = this.materialForm.getRawValue();
    const data: CreateMaterialDto = {
      name: raw.name,
      sku: raw.sku,
      supplierId: raw.supplierId,
      unit: raw.unit as CreateMaterialDto['unit'],
      pricePerUnit: raw.pricePerUnit,
      category: raw.category || undefined,
      priceCurrency: raw.priceCurrency || undefined,
      notes: raw.notes || undefined,
    };
    const edit = this.editingMaterial();
    const obs$ = edit
      ? this.api.updateMaterial(edit._id, data)
      : this.api.createMaterial(data);
    obs$.subscribe({
      next: (saved) => {
        this.materials.update((list) => {
          const idx = list.findIndex((m) => m._id === saved._id);
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
          return [...list];
        });
        this.setStreamError('saveMaterial', null);
        this.showMaterialForm.set(false);
      },
      error: (err) =>
        this.setStreamError(
          'saveMaterial',
          this.extractErrorMessage(err, 'Ошибка сохранения материала'),
        ),
    });
  }

  deleteMaterial(mat: Material): void {
    if (!confirm(`Удалить материал "${mat.name}"?`)) return;
    this.api.deleteMaterial(mat._id).subscribe({
      next: () =>
        this.materials.update((list) =>
          list.filter((m) => m._id !== mat._id),
        ),
      error: (err) =>
        this.setStreamError(
          'deleteMaterial',
          this.extractErrorMessage(err, 'Ошибка удаления материала'),
        ),
    });
  }

  /** Suppliers for material.supplierId dropdown (BR-MAT-1: must be a SUPPLIER-party org). */
  suppliers = computed(() =>
    this.organizations().filter((o) => o.partyTypes?.includes('SUPPLIER')),
  );

  getSupplierName(id: string): string {
    const org = this.organizations().find((o) => o._id === id);
    return org?.name ?? id;
  }

  /** Module CRUD ─────────────────────────────────────────────── */

  openNewModule(): void {
    this.editingModule.set(null);
    this.moduleForm.reset({ name: '', sku: '', category: '', notes: '' });
    this.moduleMaterials.set([]);
    this.moduleWorks.set([]);
    this.computeModuleCostResult.set(null);
    this.showModuleForm.set(true);
  }

  editModule(m: BomModule): void {
    this.editingModule.set(m);
    this.moduleForm.patchValue({
      name: m.name,
      sku: m.sku,
      category: m.category ?? '',
      notes: m.notes ?? '',
    });
    this.moduleMaterials.set(m.moduleMaterials ?? []);
    this.moduleWorks.set(m.moduleWorks ?? []);
    this.computeModuleCostResult.set(null);
    this.showModuleForm.set(true);
  }

  /**
   * BR-MOD-8: live cost rollup — no caching on backend side either.
   * Shows the result in the Module form for visual feedback before save.
   */
  computeModuleCost(moduleId: string): void {
    if (!moduleId) {
      this.computeModuleCostResult.set(null);
      return;
    }
    this.api.computeModuleCost(moduleId).subscribe({
      next: (res) =>
        this.computeModuleCostResult.set({
          materialsCost: res.materialsCost,
          worksCost: res.worksCost,
          childModulesCost: res.childModulesCost,
          totalCost: res.totalCost,
        }),
      error: () => this.computeModuleCostResult.set(null),
    });
  }

  saveModule(): void {
    if (!this.auth.hasPermission('MODULES_WRITE')) return;
    if (this.moduleForm.invalid) return;
    const raw = this.moduleForm.getRawValue();
    const data: CreateBomModuleDto = {
      name: raw.name,
      sku: raw.sku,
      category: raw.category || undefined,
      notes: raw.notes || undefined,
      moduleMaterials: this.moduleMaterials(),
      moduleWorks: this.moduleWorks(),
    };
    const edit = this.editingModule();
    const obs$ = edit
      ? this.api.updateBomModule(edit._id, data)
      : this.api.createBomModule(data);
    obs$.subscribe({
      next: (saved) => {
        this.modules.update((list) => {
          const idx = list.findIndex((m) => m._id === saved._id);
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
          return [...list];
        });
        this.setStreamError('saveModule', null);
        this.showModuleForm.set(false);
      },
      error: (err) =>
        this.setStreamError(
          'saveModule',
          this.extractErrorMessage(err, 'Ошибка сохранения модуля'),
        ),
    });
  }

  deleteModule(m: BomModule): void {
    if (!confirm(`Удалить модуль "${m.name}"?`)) return;
    this.api.deleteBomModule(m._id).subscribe({
      next: () =>
        this.modules.update((list) =>
          list.filter((mod) => mod._id !== m._id),
        ),
      error: (err) =>
        this.setStreamError(
          'deleteModule',
          this.extractErrorMessage(err, 'Ошибка удаления модуля'),
        ),
    });
  }

  /** Material ↔ Module helpers (used in Module form) ─────────── */

  getMaterialName(id: string): string {
    return this.materials().find((m) => m._id === id)?.name ?? id;
  }

  getWorkTypeName(id: string): string {
    return this.workTypes().find((w) => w._id === id)?.name ?? id;
  }

  addMaterialToModule(): void {
    const firstAvailable = this.materials().find(
      (m) =>
        !this.moduleMaterials().some((mm) => mm.materialId === m._id) &&
        !m.deletedAt,
    );
    if (!firstAvailable) {
      this.setStreamError(
        'saveModule',
        'Нет доступных материалов — сначала создайте материал',
      );
      return;
    }
    this.moduleMaterials.update((arr) => [
      ...arr,
      { materialId: firstAvailable._id, qty: 1, order: arr.length },
    ]);
  }

  removeMaterialFromModule(idx: number): void {
    this.moduleMaterials.update((arr) => arr.filter((_, i) => i !== idx));
  }

  addWorkToModule(): void {
    const firstAvailable = this.workTypes().find(
      (w) => !w.deletedAt && !this.moduleWorks().some((mw) => mw.workTypeId === w._id),
    );
    if (!firstAvailable) {
      this.setStreamError(
        'saveModule',
        'Нет доступных видов работ — сначала создайте WorkType',
      );
      return;
    }
    this.moduleWorks.update((arr) => [
      ...arr,
      { workTypeId: firstAvailable._id, hours: 1, order: arr.length },
    ]);
  }

  removeWorkFromModule(idx: number): void {
    this.moduleWorks.update((arr) => arr.filter((_, i) => i !== idx));
  }

  /** WorkType CRUD ──────────────────────────────────────────── */

  openNewWorkType(): void {
    this.editingWorkType.set(null);
    this.workTypeForm.reset({ name: '', hourlyRate: 0, description: '' });
    this.showWorkTypeForm.set(true);
  }

  editWorkType(w: WorkType): void {
    this.editingWorkType.set(w);
    this.workTypeForm.patchValue({
      name: w.name,
      hourlyRate: w.hourlyRate,
      description: w.description ?? '',
    });
    this.showWorkTypeForm.set(true);
  }

  saveWorkType(): void {
    if (!this.auth.hasPermission('WORKTYPES_WRITE')) return;
    if (this.workTypeForm.invalid) return;
    const raw = this.workTypeForm.getRawValue();
    const data: CreateWorkTypeDto = {
      name: raw.name,
      hourlyRate: raw.hourlyRate,
      description: raw.description || undefined,
    };
    const edit = this.editingWorkType();
    const obs$ = edit
      ? this.api.updateWorkType(edit._id, data)
      : this.api.createWorkType(data);
    obs$.subscribe({
      next: (saved) => {
        this.workTypes.update((list) => {
          const idx = list.findIndex((w) => w._id === saved._id);
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
          return [...list];
        });
        this.setStreamError('saveWorkType', null);
        this.showWorkTypeForm.set(false);
      },
      error: (err) =>
        this.setStreamError(
          'saveWorkType',
          this.extractErrorMessage(err, 'Ошибка сохранения вида работ'),
        ),
    });
  }

  deleteWorkType(w: WorkType): void {
    if (!confirm(`Удалить вид работ "${w.name}"?`)) return;
    this.api.deleteWorkType(w._id).subscribe({
      next: () =>
        this.workTypes.update((list) =>
          list.filter((x) => x._id !== w._id),
        ),
      error: (err) =>
        this.setStreamError(
          'deleteWorkType',
          this.extractErrorMessage(err, 'Ошибка удаления вида работ'),
        ),
    });
  }

  /** Employee CRUD ───────────────────────────────────────────── */

  openNewEmployee(): void {
    this.editingEmployee.set(null);
    this.employeeForm.reset({
      name: '',
      fullName: '',
      phone: '',
      email: '',
      active: true,
    });
    this.showEmployeeForm.set(true);
  }

  editEmployee(emp: Employee): void {
    this.editingEmployee.set(emp);
    this.employeeForm.patchValue({
      name: emp.name,
      fullName: emp.fullName ?? '',
      phone: emp.phone ?? '',
      email: emp.email ?? '',
      active: emp.active ?? true,
    });
    this.showEmployeeForm.set(true);
  }

  saveEmployee(): void {
    if (!this.auth.hasPermission('EMPLOYEES_WRITE')) return;
    if (this.employeeForm.invalid) return;
    const raw = this.employeeForm.getRawValue();
    const data: CreateEmployeeDto = {
      name: raw.name,
      fullName: raw.fullName || undefined,
      phone: raw.phone || undefined,
      email: raw.email || undefined,
      active: raw.active,
    };
    const edit = this.editingEmployee();
    const obs$ = edit
      ? this.api.updateEmployee(edit._id, data)
      : this.api.createEmployee(data);
    obs$.subscribe({
      next: (saved) => {
        this.employees.update((list) => {
          const idx = list.findIndex((e) => e._id === saved._id);
          if (idx >= 0) list[idx] = saved;
          else list.push(saved);
          return [...list];
        });
        this.setStreamError('saveEmployee', null);
        this.showEmployeeForm.set(false);
      },
      error: (err) =>
        this.setStreamError(
          'saveEmployee',
          this.extractErrorMessage(err, 'Ошибка сохранения сотрудника'),
        ),
    });
  }

  deleteEmployee(emp: Employee): void {
    if (!confirm(`Удалить сотрудника "${emp.name}"?`)) return;
    this.api.deleteEmployee(emp._id).subscribe({
      next: () =>
        this.employees.update((list) =>
          list.filter((e) => e._id !== emp._id),
        ),
      error: (err) =>
        this.setStreamError(
          'deleteEmployee',
          this.extractErrorMessage(err, 'Ошибка удаления сотрудника'),
        ),
    });
  }

  /** Product extensions (BR-PRD-5 status + BR-PRD-6 modules) ───── */

  translateProductStatus(s: ProductStatus | undefined | null): string {
    return s ? this.PRODUCT_STATUS_LABELS[s] ?? s : '—';
  }

  /** Quick status toggle from table — single PATCH. */
  changeProductStatus(product: Product, next: ProductStatus): void {
    if (!this.auth.hasPermission('PRODUCTS_WRITE')) return;
    this.api.setProductStatus(product._id, next).subscribe({
      next: (saved) => {
        this.products.update((list) =>
          list.map((p) => (p._id === saved._id ? saved : p)),
        );
        this.setStreamError('productStatus', null);
      },
      error: (err) =>
        this.setStreamError(
          'productStatus',
          this.extractErrorMessage(err, 'Ошибка изменения статуса'),
        ),
    });
  }

  /** Resolve productModuleIds → BomModule info for table display. */
  getModuleName(id: string): string {
    return this.modules().find((m) => m._id === id)?.name ?? id;
  }

  /** Add a module to a product (sets productModuleIds[] wholesale). */
  addModuleToProduct(product: Product, moduleId: string): void {
    const current = (product as any).productModuleIds as
      | string[]
      | undefined;
    if (current?.includes(moduleId)) return;
    const next = [...(current ?? []), moduleId];
    this.api.setProductModules(product._id, next).subscribe({
      next: (saved) => {
        this.products.update((list) =>
          list.map((p) => (p._id === saved._id ? saved : p)),
        );
        this.setStreamError('productModules', null);
      },
      error: (err) =>
        this.setStreamError(
          'productModules',
          this.extractErrorMessage(err, 'Ошибка привязки модуля'),
        ),
    });
  }

  removeModuleFromProduct(product: Product, moduleId: string): void {
    const current = (product as any).productModuleIds as
      | string[]
      | undefined;
    if (!current?.includes(moduleId)) return;
    const next = current.filter((id) => id !== moduleId);
    this.api.setProductModules(product._id, next).subscribe({
      next: (saved) => {
        this.products.update((list) =>
          list.map((p) => (p._id === saved._id ? saved : p)),
        );
        this.setStreamError('productModules', null);
      },
      error: (err) =>
        this.setStreamError(
          'productModules',
          this.extractErrorMessage(err, 'Ошибка отвязки модуля'),
        ),
    });
  }
}
