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
  // BOM-domain extensions (PSL-012). Optional because pre-existing products
  // created before this commit don't have these fields.
  status?: ProductStatus;
  productModuleIds?: string[];
}

// ─── BOM domain extensions on Product (PSL-012) ─────
export type ProductStatus =
  | 'DRAFT'
  | 'READY'
  | 'IN_PRODUCTION'
  | 'COMPLETED'
  | 'ARCHIVED';
export interface CreateProductDto {
  name: string;
  sku: string;
  description?: string;
  category?: string;
  unit?: string;
  price?: number;
  cost?: number;
  photoIds: string[];
  status?: ProductStatus;
  productModuleIds?: string[];
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
  status?: ProductStatus;
  productModuleIds?: string[];
}

export interface ComputeProductCostResult {
  totalCost: number;
  modules: Array<{ moduleId: string; name: string; cost: number }>;
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

// ─── BOM domain — Materials (PSL-012) ──────────
export const MATERIAL_UNITS = [
  'mm',
  'cm',
  'm',
  'kg',
  'g',
  'pcs',
] as const;
export type MaterialUnit = (typeof MATERIAL_UNITS)[number];

export interface MaterialDimensions {
  length?: number;
  width?: number;
  height?: number;
  diameter?: number;
  thickness?: number;
}

export interface MaterialFixedDimensions {
  length?: boolean;
  width?: boolean;
  height?: boolean;
  diameter?: boolean;
  thickness?: boolean;
}

export interface Material {
  _id: string;
  name: string;
  sku: string;
  supplierId: string;
  category?: string;
  unit: MaterialUnit;
  pricePerUnit: number;
  priceCurrency?: string;
  dimensions?: MaterialDimensions;
  fixedDimensions?: MaterialFixedDimensions;
  photoIds?: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateMaterialDto {
  name: string;
  sku: string;
  supplierId: string;
  unit: MaterialUnit;
  pricePerUnit: number;
  category?: string;
  priceCurrency?: string;
  dimensions?: MaterialDimensions;
  fixedDimensions?: MaterialFixedDimensions;
  photoIds?: string[];
  notes?: string;
}

export type UpdateMaterialDto = Partial<CreateMaterialDto>;

// ─── BOM domain — Modules (PSL-012; entity in backend is BomModule) ─────
export interface ModuleMaterial {
  materialId: string;
  qty: number;
  unit?: string;
  usedDimensions?: MaterialDimensions;
  order?: number;
}

export interface ModuleWork {
  workTypeId: string;
  hours: number;
  overrideRate?: number;
  order?: number;
}

export interface BomModuleDimensions {
  length?: number;
  width?: number;
  height?: number;
}

export interface BomModule {
  _id: string;
  name: string;
  /** BR-MOD-3: regex ^[A-Z0-9-]+$, 3–32 chars. */
  sku: string;
  category?: string;
  notes?: string;
  dimensions?: BomModuleDimensions;
  childModuleIds: string[];
  moduleMaterials: ModuleMaterial[];
  moduleWorks: ModuleWork[];
  photoIds?: string[];
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateBomModuleDto {
  name: string;
  sku: string;
  category?: string;
  notes?: string;
  dimensions?: BomModuleDimensions;
  childModuleIds?: string[];
  moduleMaterials?: ModuleMaterial[];
  moduleWorks?: ModuleWork[];
  photoIds?: string[];
}

export type UpdateBomModuleDto = Partial<CreateBomModuleDto>;

/**
 * BR-MOD-8: live cost rollup. Re-computed on every call (no cache).
 * breakdown is a flat list of material/work/module entries with per-line costs.
 */
export interface ComputeModuleCostResult {
  materialsCost: number;
  worksCost: number;
  childModulesCost: number;
  totalCost: number;
  breakdown: Array<{
    type: 'material' | 'work' | 'module';
    refId: string;
    name: string;
    qty?: number;
    hours?: number;
    unitCost?: number;
    totalCost: number;
  }>;
}

// ─── BOM domain — WorkTypes (PSL-012) ──────────
export interface WorkType {
  _id: string;
  name: string;
  /** RUB/hour default hire rate (BR-WT-1) */
  hourlyRate: number;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateWorkTypeDto {
  name: string;
  hourlyRate: number;
  description?: string;
}

export type UpdateWorkTypeDto = Partial<CreateWorkTypeDto>;

// ─── BOM domain — Employees (PSL-012) ──────────
export interface Employee {
  _id: string;
  name: string;
  fullName?: string;
  phone?: string;
  email?: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface CreateEmployeeDto {
  name: string;
  fullName?: string;
  phone?: string;
  email?: string;
  active?: boolean;
}

export type UpdateEmployeeDto = Partial<CreateEmployeeDto>;

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

  /**
   * PATCH /api/products/:id — pass only `{ status: 'READY' }` etc.
   * BR-PRD-5: status transition DRAFT → READY → IN_PRODUCTION → COMPLETED → ARCHIVED.
   */
  setProductStatus(id: string, status: ProductStatus) {
    return this.http.patch<Product>(`${this.baseUrl}/products/${id}`, { status });
  }

  /**
   * PATCH /api/products/:id — replace productModuleIds[] wholesale.
   * BR-PRD-6: a product is composed of 1+ operational modules.
   */
  setProductModules(
    id: string,
    productModuleIds: string[],
  ) {
    return this.http.patch<Product>(`${this.baseUrl}/products/${id}`, {
      productModuleIds,
    });
  }

  /**
   * GET /api/products/:id/compute-cost — Σ(active module totalCost).
   * (Backend returns ComputeProductCostResult, see api.service.ts.)
   */
  computeProductCost(id: string) {
    return this.http.get<ComputeProductCostResult>(
      `${this.baseUrl}/products/${id}/compute-cost`,
    );
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
  // BOM domain — Materials (PSL-012)
  // ═══════════════════════════════════════════

  getMaterials() {
    return this.http.get<Material[]>(`${this.baseUrl}/materials`);
  }

  getMaterial(id: string) {
    return this.http.get<Material>(`${this.baseUrl}/materials/${id}`);
  }

  createMaterial(data: CreateMaterialDto) {
    return this.http.post<Material>(`${this.baseUrl}/materials`, data);
  }

  updateMaterial(id: string, data: UpdateMaterialDto) {
    return this.http.patch<Material>(`${this.baseUrl}/materials/${id}`, data);
  }

  deleteMaterial(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/materials/${id}`);
  }

  // ═══════════════════════════════════════════
  // BOM domain — Modules (PSL-012; backend entity is BomModule)
  // ═══════════════════════════════════════════

  getModules() {
    return this.http.get<BomModule[]>(`${this.baseUrl}/modules`);
  }

  getBomModule(id: string) {
    return this.http.get<BomModule>(`${this.baseUrl}/modules/${id}`);
  }

  createBomModule(data: CreateBomModuleDto) {
    return this.http.post<BomModule>(`${this.baseUrl}/modules`, data);
  }

  updateBomModule(id: string, data: UpdateBomModuleDto) {
    return this.http.patch<BomModule>(
      `${this.baseUrl}/modules/${id}`,
      data,
    );
  }

  deleteBomModule(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/modules/${id}`);
  }

  /**
   * GET /api/modules/:id/compute-cost — BR-MOD-8 live rollup.
   */
  computeModuleCost(id: string) {
    return this.http.get<ComputeModuleCostResult>(
      `${this.baseUrl}/modules/${id}/compute-cost`,
    );
  }

  // ═══════════════════════════════════════════
  // BOM domain — WorkTypes (PSL-012)
  // ═══════════════════════════════════════════

  getWorkTypes() {
    return this.http.get<WorkType[]>(`${this.baseUrl}/work-types`);
  }

  getWorkType(id: string) {
    return this.http.get<WorkType>(`${this.baseUrl}/work-types/${id}`);
  }

  createWorkType(data: CreateWorkTypeDto) {
    return this.http.post<WorkType>(`${this.baseUrl}/work-types`, data);
  }

  updateWorkType(id: string, data: UpdateWorkTypeDto) {
    return this.http.patch<WorkType>(
      `${this.baseUrl}/work-types/${id}`,
      data,
    );
  }

  deleteWorkType(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/work-types/${id}`);
  }

  // ═══════════════════════════════════════════
  // BOM domain — Employees (PSL-012)
  // ═══════════════════════════════════════════

  getEmployees() {
    return this.http.get<Employee[]>(`${this.baseUrl}/employees`);
  }

  getEmployee(id: string) {
    return this.http.get<Employee>(`${this.baseUrl}/employees/${id}`);
  }

  createEmployee(data: CreateEmployeeDto) {
    return this.http.post<Employee>(`${this.baseUrl}/employees`, data);
  }

  updateEmployee(id: string, data: UpdateEmployeeDto) {
    return this.http.patch<Employee>(`${this.baseUrl}/employees/${id}`, data);
  }

  deleteEmployee(id: string) {
    return this.http.delete<void>(`${this.baseUrl}/employees/${id}`);
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
