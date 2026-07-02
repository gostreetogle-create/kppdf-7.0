import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, type LoginResponse } from './api.service';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: { sub: string; username: string; roleName: string; roleId: string; permissions: string[] } | null;
}

const STORAGE_KEY = 'kppdf7_auth';

function decodeJwt(token: string): AuthState['user'] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      sub: payload.sub,
      username: payload.username,
      roleName: payload.roleName,
      roleId: payload.roleId,
      permissions: payload.permissions ?? [],
    };
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly state = signal<AuthState>(this.loadFromStorage());

  readonly user = computed(() => this.state().user);
  readonly isAuthenticated = computed(() => !!this.state().accessToken);
  readonly accessToken = computed(() => this.state().accessToken);
  readonly permissions = computed(() => this.state().user?.permissions ?? []);

  constructor() {
    // Auto-refresh token on expiry (simplified: check every 10 min)
    setInterval(() => {
      const rt = this.state().refreshToken;
      if (rt && this.isAuthenticated()) {
        this.api.refreshToken(rt).subscribe({
          next: (res) => this.setSession(res),
          error: () => this.logout(),
        });
      }
    }, 10 * 60 * 1000);
  }

  login(username: string, password: string) {
    return this.api.login(username, password);
  }

  setSession(res: LoginResponse) {
    const user = decodeJwt(res.accessToken);
    this.state.set({ accessToken: res.accessToken, refreshToken: res.refreshToken, user });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state()));
  }

  logout() {
    this.state.set({ accessToken: null, refreshToken: null, user: null });
    localStorage.removeItem(STORAGE_KEY);
    this.router.navigate(['/login']);
  }

  hasPermission(key: string): boolean {
    const user = this.state().user;
    if (!user) return false;
    if (user.roleName === 'admin') return true;
    return user.permissions.includes(key);
  }

  private loadFromStorage(): AuthState {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AuthState;
        if (parsed.accessToken) return parsed;
      }
    } catch { /* ignore */ }
    return { accessToken: null, refreshToken: null, user: null };
  }
}
