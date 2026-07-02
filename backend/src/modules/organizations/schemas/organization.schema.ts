import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Document } from 'mongoose';

export enum LegalType {
  OOO = 'OOO',
  IP = 'IP',
  FL = 'FL',
}

export enum PartyType {
  SUPPLIER = 'SUPPLIER',
  SELLER = 'SELLER',
  BUYER = 'BUYER',
}

@Schema({ collection: 'organizations', timestamps: true })
export class Organization extends Document {
  @Prop({ required: true, type: String })
  name!: string;

  @Prop({ required: true, type: String, enum: Object.values(LegalType) })
  legalType!: LegalType;

  // === Общие поля ===
  @Prop({ type: String })
  inn?: string;

  @Prop({ type: String })
  kpp?: string;

  @Prop({ type: String })
  ogrn?: string;

  @Prop({ type: String })
  legalAddress?: string;

  @Prop({ type: String })
  actualAddress?: string;

  @Prop({ type: String })
  phone?: string;

  @Prop({ type: String })
  email?: string;

  @Prop({ type: String })
  website?: string;

  // === Специфичные для ООО ===
  @Prop({ type: String })
  directorName?: string;

  @Prop({ default: null, type: Date })
  registrationDate!: Date | null;

  // === Специфичные для ИП ===
  @Prop({ type: String })
  ogrnip?: string;

  @Prop({ type: Date })
  ipRegistrationDate?: Date;

  // === Специфичные для ФЛ ===
  @Prop({ type: String })
  passportSeries?: string;

  @Prop({ type: String })
  passportNumber?: string;

  @Prop({ type: String })
  passportIssuedBy?: string;

  @Prop({ type: Date })
  passportIssuedDate?: Date;

  // === Контрактные роли (multi-select, минимум 1) ===
  @Prop({
    required: true,
    type: [String],
    enum: Object.values(PartyType),
    default: [PartyType.SUPPLIER],
    validate: {
      validator: (v: string[]) => Array.isArray(v) && v.length >= 1,
      message: 'Организация должна иметь хотя бы одну partyType (BR-ORG-4)',
    },
  })
  partyTypes!: PartyType[];

  // === Контакты и фото ===
  @Prop({
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Photo' }],
    default: [],
  })
  photoIds!: mongoose.Types.ObjectId[];

  @Prop({
    type: [
      {
        name: { type: String },
        position: { type: String },
        phone: { type: String },
        email: { type: String },
      },
    ],
    default: [],
  })
  contacts!: Array<{
    name: string;
    position: string;
    phone: string;
    email: string;
  }>;

  @Prop({ default: null, type: Date })
  deletedAt!: Date | null;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);

OrganizationSchema.index({ name: 1 });
OrganizationSchema.index({ inn: 1 });
