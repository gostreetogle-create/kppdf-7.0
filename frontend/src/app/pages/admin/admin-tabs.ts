/**
 * Single source of truth for the admin page's tab/permission mapping.
 *
 * Previously this mapping was duplicated in three places:
 *   1) `admin-loader.ts`         — `auth.hasPermission('…_READ')` ternaries
 *   2) `admin.component.ts`      — cascading default seed for `activeTab`
 *   3) `admin.component.ts`      — local `NAV_GROUPS / AdminNavGroup` const
 *
 * Adding a 5th tab now requires editing ONLY this file. Downstream
 * files derive their behavior from it.
 *
 * The array shape also carries UI chrome (`navGroup`, `label`) so the
 * dropdown-nav renderer and the load-stream builder share a single
 * definition rather than maintaining two parallel metadata sets.
 */
export const ADMIN_TABS = [
  {
    tab: 'roles',
    label: 'Роли и права',
    perm: 'ROLES_READ',
    navGroup: 'system',
  },
  {
    tab: 'users',
    label: 'Пользователи',
    perm: 'USERS_READ',
    navGroup: 'system',
  },
  {
    tab: 'products',
    label: 'Товары',
    perm: 'PRODUCTS_READ',
    navGroup: 'catalog',
  },
  {
    tab: 'organizations',
    label: 'Организации',
    perm: 'ORGANIZATIONS_READ',
    navGroup: 'catalog',
  },
  // BOM domain (PSL-012). All four live under a single 'bom' nav group
  // so the top-nav stays compact even after adding 4 new entities.
  {
    tab: 'materials',
    label: 'Материалы',
    perm: 'MATERIALS_READ',
    navGroup: 'bom',
  },
  {
    tab: 'modules',
    label: 'Модули (BOM)',
    perm: 'MODULES_READ',
    navGroup: 'bom',
  },
  {
    tab: 'workTypes',
    label: 'Виды работ',
    perm: 'WORKTYPES_READ',
    navGroup: 'bom',
  },
  {
    tab: 'employees',
    label: 'Сотрудники',
    perm: 'EMPLOYEES_READ',
    navGroup: 'bom',
  },
] as const;

export type AdminTabName = (typeof ADMIN_TABS)[number]['tab'];
export type AdminPermKey = (typeof ADMIN_TABS)[number]['perm'];
export type AdminNavGroupId = 'system' | 'catalog' | 'bom';

/**
 * Shape of a single dropdown nav group (`NAV_GROUPS[i]`). Consumers
 * (admin.component.ts helpers + template) parameterize helpers like
 * `isGroupActive(group: AdminNavGroup)` against this — keeps us
 * DRY with `NAV_GROUPS` as the single source of truth, including
 * the per-item metadata `navGroup` field that's redundant for
 * iteration but useful for nested lookups.
 */
export type AdminNavGroup = (typeof NAV_GROUPS)[number];

/**
 * Grouped structure consumed by the dropdown nav in
 * `admin.component.html`. Group `items` is a `readonly` slice of
 * `ADMIN_TABS` filtered by `navGroup` — computed at module load
 * time so consumers can iterate without a per-render filter pass.
 *
 * Order matches `ADMIN_TABS`'s source-order so Система renders
 * Роли→Пользователи before Каталог renders Товары→Организации.
 */
export const NAV_GROUPS: readonly {
  readonly id: AdminNavGroupId;
  readonly label: string;
  readonly items: readonly (typeof ADMIN_TABS)[number][];
}[] = [
  {
    id: 'system',
    label: 'Система',
    items: ADMIN_TABS.filter((t) => t.navGroup === 'system'),
  },
  {
    id: 'catalog',
    label: 'Каталог',
    items: ADMIN_TABS.filter((t) => t.navGroup === 'catalog'),
  },
  {
    id: 'bom',
    label: 'BOM',
    items: ADMIN_TABS.filter((t) => t.navGroup === 'bom'),
  },
];
