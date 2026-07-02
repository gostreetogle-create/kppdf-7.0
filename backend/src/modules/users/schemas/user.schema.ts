import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

@Schema({ collection: 'users', timestamps: true })
export class User extends Document {
  @Prop({ required: true, unique: true, type: String })
  username!: string;

  @Prop({ required: true, type: String })
  passwordHash!: string;

  @Prop({ required: true, type: String })
  fullName!: string;

  @Prop({ type: String })
  phone?: string;

  @Prop({
    required: true,
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
  })
  roleId!: mongoose.Types.ObjectId;

  @Prop({ default: null, type: Date })
  lastLoginAt!: Date | null;

  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Strip passwordHash from all JSON responses (security: never leak bcrypt hashes via API)
UserSchema.set('toJSON', {
  transform(_doc: any, ret: Record<string, any>) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

UserSchema.index({ username: 1 }, { unique: true });
UserSchema.index({ roleId: 1 });
