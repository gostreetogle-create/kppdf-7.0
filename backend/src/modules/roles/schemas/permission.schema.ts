import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum PermissionSection {
  USERS = 'USERS',
  ORGANIZATIONS = 'ORGANIZATIONS',
  PRODUCTS = 'PRODUCTS',
  ROLES = 'ROLES',
  IMPORTS = 'IMPORTS',
  // BOM domain (PSL-012)
  MATERIALS = 'MATERIALS',
  MODULES = 'MODULES',
  WORKTYPES = 'WORKTYPES',
  EMPLOYEES = 'EMPLOYEES',
}

export enum PermissionAction {
  READ = 'READ',
  WRITE = 'WRITE',
  DELETE = 'DELETE',
  COPY = 'COPY',
}

@Schema({ collection: 'permissions', timestamps: true })
export class Permission extends Document {
  @Prop({ required: true, unique: true, type: String })
  key!: string;

  @Prop({ required: true, type: String, enum: Object.values(PermissionSection) })
  section!: PermissionSection;

  @Prop({ required: true, type: String, enum: Object.values(PermissionAction) })
  action!: PermissionAction;

  @Prop({ required: true, type: String })
  description!: string;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);

PermissionSchema.index({ section: 1, action: 1 });
