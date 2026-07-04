// Update DTO — все поля опциональны + active (для увольнения).
export class UpdateEmployeeDto {
  name?: string;
  fullName?: string;
  phone?: string;
  email?: string;
  position?: string;
  active?: boolean;
}
