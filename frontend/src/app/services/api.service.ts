import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

// ─── Auth ─────────────────────────────────────

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
}

// ─── Roles & Permissions ──────────────────────

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

// ─── Products ──────────────────────────────────

export interface Product {
  _id: string;
  name: string;
  sku: string;
  description?: string;
  category?: string;
  unit?: string;
  price: number;
  cost: number;
  photoIds: string[];
  copiedFromProductId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateProductDto {
  name: string;
  sku: string;
  description?: string;
  category?: string;
  unit?: string;
  price?: number;
  cost?: number;
  photoIds: string[];
}

export interface UpdateProductDto {
  name?: string;
  sku?: string;
  description?: string;
  category?: string;
  unit?: string;
  price?: number;
  cost?: number;
  photoIds?: string[];
}

// ─── Organizations ────────────────────────────

export type LegalType = 'OOO' | 'IP' | 'FL';
export type PartyType = 'SUPPLIER' | 'SELLER' | 'BUYER';

export interface OrganizationContact {
  name: string;
  position: string;
  phone: string;
  email: string;
}

export interface Organization {
  _id: string;
  name: string;
  legalType: LegalType;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  legalAddress?: string;
  actualAddress?: string;
  phone?: string;
  email?: string;
  website?: string;
  directorName?: string;
  registrationDate?: string | null;
  ogrnip?: string;
  ipRegistrationDate?: string;
  passportSeries?: string;
  passportNumber?: string;
  passportIssuedBy?: string;
  passportIssuedDate?: string;
  partyTypes: PartyType[];
  photoIds: string[];
  contacts: OrganizationContact[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateOrganizationDto {
  name: string;
  legalType: LegalType;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  legalAddress?: string;
  actualAddress?: string;
  phone?: string;
  email?: string;
  website?: string;
  directorName?: string;
  registrationDate?: string;
  ogrnip?: string;
  ipRegistrationDate?: string;
  passportSeries?: string;
  passportNumber?: string;
  passportIssuedBy?: string;
  passportIssuedDate?: string;
  partyTypes: PartyType[];
  contacts?: OrganizationContact[];
}

export interface UpdateOrganizationDto {
  name?: string;
  legalType?: LegalType;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  legalAddress?: string;
  actualAddress?: string;
  phone?: string;
  email?: string;
  website?: string;
  directorName?: string;
  registrationDate?: string;
  ogrnip?: string;
  ipRegistrationDate?: string;
  passportSeries?: string;
  passportNumber?: string;
  passportIssuedBy?: string;
  passportIssuedDate?: string;
  partyTypes?: PartyType[];
  contacts?: OrganizationContact[];
}

// ─── Photos / Storage ─────────────────────────
/**
 * Photo cluster — mirrors backend `backend/src/modules/storage/schemas/photo.schema.ts`.
 * One upload → 3 documents (ORIGINAL + MEDIUM + THUMBNAIL) sharing `linkedPhotoId`.
 */
export interface Photo {
  _id: string;
  storageUrl: string;
  originalFilename: string;
  variant: 'ORIGINAL' | 'MEDIUM' | 'THUMBNAIL' | 'LARGE';
  mimeType: string;
  sizeBytes: number;
  widthPx?: number;
  heightPx?: number;
  parentPhotoId?: string | null;
  linkedPhotoId: string;
  deletedAt?: string | null;
}

export interface UploadPhotoResponse {
  /**
   * id ORIGINAL-варианта — передавай в Product.photoIds[] / Organization.photoIds[].
   */
  linkedPhotoId: string;
  cluster: Photo[];
}

// ─── Service ──────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  // ═══════════════════════════════════════════
  // Auth
  // ═══════════════════════════════════════════

  login(username: string, password: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/login`, {
      username,
      password,
    });
  }

  refreshToken(refreshToken: string) {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/refresh`, {
      refreshToken,
    });
  }

  // ═══════════════════════════════════════════
  // Roles
  // ═══════════════════════════════════════════

  getRoles() {
    return this.http.get<Role[]>(`${this.baseUrl}/roles`);
  }

  getRole(id: string) {
    return this.http.get<Role>(`${this.baseUrl}/roles/${id}`);
  }

  createRole(data: {
    name: string;
    permissions?: string[];
    description?: string;
  }) {
    return this.http.post<Role>(`${this.baseUrl}/roles`, data);
  }

  updateRole(
    id: string,
    data: {
      name?: string;
      permissions?: string[];
      status?: string;
      description?: string;
    },
  ) {
    return this.http.patch<Role>(`${this.baseUrl}/roles/${id}`, data);
  }

  deleteRole(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/roles/${id}`);
  }

  // ═══════════════════════════════════════════
  // Permissions
  // ═══════════════════════════════════════════

  getPermissions() {
    return this.http.get<Permission[]>(`${this.baseUrl}/permissions`);
  }

  // ═══════════════════════════════════════════
  // Users
  // ═══════════════════════════════════════════

  getUsers() {
    return this.http.get<User[]>(`${this.baseUrl}/users`);
  }

  getUser(id: string) {
    return this.http.get<User>(`${this.baseUrl}/users/${id}`);
  }

  createUser(data: {
    username: string;
    password: string;
    fullName: string;
    phone?: string;
    roleId: string;
  }) {
    return this.http.post<User>(`${this.baseUrl}/users`, data);
  }

  updateUser(
    id: string,
    data: {
      fullName?: string;
      phone?: string;
      roleId?: string;
      password?: string;
    },
  ) {
    return this.http.patch<User>(`${this.baseUrl}/users/${id}`, data);
  }

  deleteUser(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/users/${id}`);
  }

  // ═══════════════════════════════════════════
  // Products
  // ═══════════════════════════════════════════

  getProducts() {
    return this.http.get<Product[]>(`${this.baseUrl}/products`);
  }

  getProduct(id: string) {
    return this.http.get<Product>(`${this.baseUrl}/products/${id}`);
  }

  createProduct(data: CreateProductDto) {
    return this.http.post<Product>(`${this.baseUrl}/products`, data);
  }

  updateProduct(id: string, data: UpdateProductDto) {
    return this.http.patch<Product>(`${this.baseUrl}/products/${id}`, data);
  }

  /**
   * POST /api/products/:id/copy — deep-copy a product with auto-generated sku.
   */
  copyProduct(id: string) {
    return this.http.post<Product>(`${this.baseUrl}/products/${id}/copy`, {});
  }

  deleteProduct(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/products/${id}`);
  }

  // ═══════════════════════════════════════════
  // Organizations
  // ═══════════════════════════════════════════

  getOrganizations() {
    return this.http.get<Organization[]>(`${this.baseUrl}/organizations`);
  }

  getOrganization(id: string) {
    return this.http.get<Organization>(`${this.baseUrl}/organizations/${id}`);
  }

  createOrganization(data: CreateOrganizationDto) {
    return this.http.post<Organization>(
      `${this.baseUrl}/organizations`,
      data,
    );
  }

  updateOrganization(id: string, data: UpdateOrganizationDto) {
    return this.http.patch<Organization>(
      `${this.baseUrl}/organizations/${id}`,
      data,
    );
  }

  deleteOrganization(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/organizations/${id}`);
  }

  // ═══════════════════════════════════════════
  // Photos / Storage
  // ═══════════════════════════════════════════

  /**
   * Multipart photo upload — POST /api/storage/photos.
   *
   * Per backend StorageService.upload: one image → cluster of 3 documents
   * (ORIGINAL + MEDIUM + THUMBNAIL) sharing `linkedPhotoId`. UI only needs
   * `linkedPhotoId` to attach to Product/Organization; the cluster is kept
   * in the response for inspection (e.g. thumbnail URLs).
   *
   * @param context — 'products' | 'organizations' (form field, drives storage path)
   * @param file — raw File from <input type="file">
   *
   * **Do not** set the `Content-Type` header — HttpClient auto-sets the
   * multipart boundary. Setting it manually breaks the upload.
   */
  uploadPhoto(context: 'products' | 'organizations', file: File) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('context', context);
    return this.http.post<UploadPhotoResponse>(
      `${this.baseUrl}/storage/photos`,
      fd,
    );
  }

  /**
   * GET /api/photos/:id — get a single photo document.
   */
  getPhoto(id: string) {
    return this.http.get<Photo>(`${this.baseUrl}/photos/${id}`);
  }

  /**
   * GET /api/photos/:id/cluster — get all variants in the same cluster.
   */
  findPhotoCluster(id: string) {
    return this.http.get<Photo[]>(`${this.baseUrl}/photos/${id}/cluster`);
  }

  /**
   * DELETE /api/photos/:id — soft-delete a single photo.
   */
  deletePhoto(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/photos/${id}`);
  }

  /**
   * DELETE /api/photos/:id/cluster — cascade-delete an entire photo cluster.
   */
  deletePhotoCluster(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/photos/${id}/cluster`);
  }
}
