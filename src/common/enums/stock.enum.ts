export enum StockThreshold {
  LOW  = 3,
  ZERO = 0,
}

export enum StockCheckInterval {
  PENDING_ORDERS_MS = 5  * 60 * 1000,   // 5 min
  STOCK_CHECKER_MS  = 15 * 60 * 1000,   // 15 min
}
