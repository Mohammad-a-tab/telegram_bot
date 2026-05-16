export type AdminAction =
  | 'add_plan'
  | 'edit_plan'
  | 'add_configs'
  | 'delete_config'
  | 'add_sub'
  | 'edit_sub'
  | 'set_discount_price'
  | 'waiting_for_receipt'
  | 'waiting_for_coupon'
  | 'coupon_create'
  | 'broadcast';

export interface AdminState {
  action: AdminAction;
  step?: number;
  planId?: number;
  editField?: string;
  messageId?: number;
  data?: Record<string, any>;
}

export class AdminStateManager {
  private readonly states = new Map<number, AdminState>();

  get(userId: number): AdminState | null {
    return this.states.get(userId) ?? null;
  }

  set(userId: number, state: AdminState): void {
    this.states.set(userId, state);
  }

  clear(userId: number): void {
    this.states.delete(userId);
  }

  has(userId: number): boolean {
    return this.states.has(userId);
  }
}
