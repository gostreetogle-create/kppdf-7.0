import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

export interface Role {
  _id: string;
  name: string;
  isSystemRole: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  permissions: string[];
  description?: string;
  deletedAt?: string | null;
}

export interface User {
  _id: string;
  username: string;
  fullName: string;
  phone?: string;
  roleId: string | Role;
  lastLoginAt?: string | null;
  deletedAt?: string | null;
}

export interface Permission {
  _id: string;
  key: string;
  section: string;
  action: string;
  description: string;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  // Auth
  login(username: string, password: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/login`, { username, password });
  }

  refreshToken(refreshToken: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/refresh`, { refreshToken });
  }

  // Roles
  getRoles() {
    return this.http.get<Role[]>(`${this.baseUrl}/roles`);
  }

  getRole(id: string) {
    return this.http.get<Role>(`${this.baseUrl}/roles/${id}`);
  }

  createRole(data: { name: string; permissions?: string[]; description?: string }) {
    return this.http.post<Role>(`${this.baseUrl}/roles`, data);
  }

  updateRole(id: string, data: { name?: string; permissions?: string[]; status?: string; description?: string }) {
    return this.http.patch<Role>(`${this.baseUrl}/roles/${id}`, data);
  }

  deleteRole(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/roles/${id}`);
  }

  // Permissions
  getPermissions() {
    return this.http.get<Permission[]>(`${this.baseUrl}/permissions`);
  }

  // Users
  getUsers() {
    return this.http.get<User[]>(`${this.baseUrl}/users`);
  }

  getUser(id: string) {
    return this.http.get<User>(`${this.baseUrl}/users/${id}`);
  }

  createUser(data: { username: string; password: string; fullName: string; phone?: string; roleId: string }) {
    return this.http.post<User>(`${this.baseUrl}/users`, data);
  }

  updateUser(id: string, data: { fullName?: string; phone?: string; roleId?: string; password?: string }) {
    return this.http.patch<User>(`${this.baseUrl}/users/${id}`, data);
  }

  deleteUser(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/users/${id}`);
  }
}
