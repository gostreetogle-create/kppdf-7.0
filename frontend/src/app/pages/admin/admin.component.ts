import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ApiService, type Role, type Permission, type User } from '../../services/api.service';

interface SectionGroup {
  section: string;
  actions: string[];
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css',
})
export class AdminComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly roles = signal<Role[]>([]);
  readonly permissions = signal<Permission[]>([]);
  readonly users = signal<User[]>([]);
  readonly error = signal<string | null>(null);
  readonly activeTab = signal<'roles' | 'users'>('roles');

  // Role editing
  readonly editingRole = signal<Role | null>(null);
  readonly showRoleForm = signal(false);
  readonly roleForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    permissions: [[] as string[], []],
  });

  // User editing
  readonly editingUser = signal<User | null>(null);
  readonly showUserForm = signal(false);
  readonly userForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.minLength(8)]],
    fullName: ['', [Validators.required]],
    phone: [''],
    roleId: ['', [Validators.required]],
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

  readonly activeRoles = computed(() => this.roles().filter((r) => r.status === 'ACTIVE'));

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getRoles().subscribe({
      next: (r) => this.roles.set(r),
      error: () => this.error.set('Ошибка загрузки ролей'),
    });
    this.api.getPermissions().subscribe({
      next: (p) => this.permissions.set(p),
      error: () => this.error.set('Ошибка загрузки разрешений'),
    });
    this.api.getUsers().subscribe({
      next: (u) => this.users.set(u),
      error: () => this.error.set('Ошибка загрузки пользователей'),
      complete: () => this.loading.set(false),
    });
  }

  // ─── Role matrix helpers ─────────────────────────────────

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
      },
    });
  }

  // ─── Role CRUD ───────────────────────────────────────────

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
        this.showRoleForm.set(false);
      },
    });
  }

  deleteRole(role: Role): void {
    if (!confirm(`Удалить роль "${role.name}"?`)) return;
    this.api.deleteRole(role._id).subscribe({
      next: () => this.roles.update((list) => list.filter((r) => r._id !== role._id)),
    });
  }

  // ─── User CRUD ───────────────────────────────────────────

  openNewUser(): void {
    this.editingUser.set(null);
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
        this.showUserForm.set(false);
      },
    });
  }

  deleteUser(user: User): void {
    if (!confirm(`Удалить пользователя "${user.username}"?`)) return;
    this.api.deleteUser(user._id).subscribe({
      next: () => this.users.update((list) => list.filter((u) => u._id !== user._id)),
    });
  }

  getRoleName(roleId: string | Role): string {
    if (typeof roleId === 'object') return roleId.name;
    const role = this.roles().find((r) => r._id === roleId);
    return role?.name ?? '—';
  }

  // ─── Tab helpers ─────────────────────────────────────────

  setTab(tab: 'roles' | 'users'): void {
    this.activeTab.set(tab);
    this.showRoleForm.set(false);
    this.showUserForm.set(false);
  }

  logout(): void {
    this.auth.logout();
  }
}
