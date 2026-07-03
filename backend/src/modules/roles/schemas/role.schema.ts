import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum RoleStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

@Schema({ collection: 'roles', timestamps: true })
export class Role extends Document {
  @Prop({ required: true, unique: true, type: String })
  name!: string;

  @Prop({ required: true, default: false, type: Boolean })
  isSystemRole!: boolean;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(RoleStatus),
    default: RoleStatus.ACTIVE,
  })
  status!: RoleStatus;

  @Prop({ required: true, type: [String], default: [] })
  permissions!: string[];

  @Prop({ type: String })
  description?: string;

  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

RoleSchema.index({ status: 1 });
