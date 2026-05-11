export interface AdminState {
    action: string;
    step?: number;
    planId?: number;
    editField?: string;
    data?: any;
  }
  
  export const adminStates = new Map<number, AdminState>();