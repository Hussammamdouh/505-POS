export type StaffRole = 'BARISTA' | 'MANAGER' | 'ADMIN';

export type PaymentMethod = 'CASH' | 'VISA' | 'INSTAPAY' | 'VODAFONE_CASH' | 'TALABAT_CASH' | 'TALABAT_VISA' | 'WEBSITE_CASH';

export type OrderChannel = 'POS' | 'WEB' | 'TALABAT';

export type OrderStatus = 'PENDING' | 'ACCEPTED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED' | 'PARTIALLY_REFUNDED';

/** STAFF_LOAN: cash a staff member borrowed from the drawer, deducted from that month's salary. */
export type CashMovementType = 'CASH_DROP' | 'PETTY_PAYOUT' | 'STAFF_LOAN';

export type ExpenseCategory =
  | 'RENT'
  | 'ELECTRICITY'
  | 'WATER'
  | 'STAFF_PAYROLL'
  | 'STAFF_BONUS_OVERTIME'
  | 'MAINTENANCE_REPAIRS'
  | 'PACKAGING_CONSUMABLES'
  | 'MARKETING_ADS'
  | 'GOVERNMENT_PERMITS'
  | 'MISCELLANEOUS';

export interface StaffLoginTile {
  id: string;
  fullName: string;
  role: StaffRole;
}

export interface StaffAuthResponse {
  staffId: string;
  fullName: string;
  role: StaffRole;
  jwtToken: string;
}

export interface CatalogModifier {
  id: string;
  name: string;
  extraPrice: number;
  isDefault: boolean;
  isInStock: boolean;
}

export interface CatalogModifierGroup {
  id: string;
  name: string;
  minSelection: number;
  maxSelection: number;
  isRequired: boolean;
  modifiers: CatalogModifier[];
}

export interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  basePrice: number;
  imageUrl: string | null;
  modifierGroups: CatalogModifierGroup[];
}

export interface CatalogCategory {
  id: string;
  name: string;
  items: CatalogItem[];
}

export interface PrintingOptions {
  businessName: string;
  addressLines: string[];
  phone: string | null;
  receiptFooter: string | null;
  lineWidth: number;
  // Missing from options cached before these were added.
  qrUrl?: string | null;
  qrCaption?: string | null;
}

/** GET /api/v1/shifts/{id}/report: amounts in EGP, times in UTC. */
export interface ShiftReport {
  shiftId: string;
  staffName: string;
  closedByName: string | null;
  isClosed: boolean;
  openedAt: string;
  closedAt: string | null;
  completedOrders: number;
  grossSales: number;
  discounts: number;
  refundTotal: number;
  channels: { channel: OrderChannel; orders: number; netSales: number }[];
  /** Sales split by who took each order, since several people share the drawer. */
  cashiers: { name: string; orders: number; netSales: number }[];
  paymentMethods: { method: PaymentMethod; gross: number; refunds: number; net: number }[];
  itemsSold: { name: string; quantity: number; amount: number }[];
  cashMovements: { createdAt: string; type: CashMovementType; amount: number; reason: string; authorizedBy: string }[];
  refunds: { createdAt: string; displayCode: string; method: PaymentMethod; amount: number; reason: string; authorizedBy: string }[];
  cancellations: { createdAt: string; displayCode: string; amount: number; reason: string; authorizedBy: string }[];
  openingFloat: number;
  cashSalesNet: number;
  cashDrops: number;
  pettyPayouts: number;
  staffLoans: number;
  expectedCash: number;
  countedCash: number | null;
  cashVariance: number | null;
  notes: string | null;
}

export interface PrintJob {
  kind: string;
  documentName: string;
  escPosBase64: string;
  previewText: string;
}

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  amountTendered: number | null;
  changeGiven: number | null;
  referenceNumber: string | null;
}

export interface PosOrderModifierRequest {
  modifierId: string;
  extraPrice: number;
}

export interface PosOrderLineRequest {
  menuItemId: string;
  quantity: number;
  unitBasePrice: number;
  modifiers: PosOrderModifierRequest[];
}

export interface OfflineOrderContext {
  offlineCode: string;
  createdAt: string;
  cashierId: string;
  shiftSessionId: string | null;
}

export interface SubmitPosOrderRequest {
  customerName: string | null;
  customerPhone: string | null;
  orderNotes: string | null;
  items: PosOrderLineRequest[];
  payments: PaymentSplit[];
  offline: OfflineOrderContext | null;
  promoCode: string | null;
  /** EGP off that the cashier charged; online it must match the server's quote. */
  discount: number;
  offerId: string | null;
  offerName: string | null;
}

export interface OrderItemModifier {
  modifierId: string;
  modifierName: string;
  extraPrice: number;
}

export interface OrderItem {
  id: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  unitBasePrice: number;
  unitModifiersPrice: number;
  totalLinePrice: number;
  isFreeLoyaltyItem: boolean;
  modifiers: OrderItemModifier[];
}

export interface OrderPayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  amountTendered: number | null;
  changeGiven: number;
  referenceNumber: string | null;
  cashierId: string;
  createdAt: string;
}

export interface OrderRefund {
  id: string;
  orderPaymentId: string;
  method: PaymentMethod;
  amount: number;
  reason: string;
  createdAt: string;
}

export interface Order {
  id: string;
  displayCode: string;
  offlineCode: string | null;
  businessDate: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerName: string | null;
  customerPhone: string | null;
  orderNotes: string | null;
  subtotalAmount: number;
  discountAmount: number;
  netAmountDue: number;
  amountPaid: number;
  balanceDue: number;
  amountRefunded: number;
  cashierId: string | null;
  createdAt: string;
  promoCodeUsed: string | null;
  loyaltyRewardApplied: string | null;
  offerName: string | null;
  cancellationReason: string | null;
  items: OrderItem[];
  payments: OrderPayment[];
  refunds: OrderRefund[];
}

export interface OrderSummary {
  id: string;
  displayCode: string;
  offlineCode: string | null;
  businessDate: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  customerName: string | null;
  customerPhone: string | null;
  netAmountDue: number;
  amountPaid: number;
  amountRefunded: number;
  itemCount: number;
  cashierName: string | null;
  createdAt: string;
}

export interface OrderSearchResult {
  orders: OrderSummary[];
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface SalesBreakdown {
  gross: number;
  refunds: number;
  net: number;
}

export interface ShiftTotals {
  cash: SalesBreakdown;
  visa: SalesBreakdown;
  instapay: SalesBreakdown;
  vodafoneCash: SalesBreakdown;
  talabat: SalesBreakdown;
  talabatCash: SalesBreakdown;
  talabatVisa: SalesBreakdown;
  allMethods: SalesBreakdown;
  totalCashDrops: number;
  totalPettyPayouts: number;
  totalStaffLoans: number;
  expectedCash: number;
}

export interface ShiftListItem {
  id: string;
  staffUserId: string;
  staffName: string;
  closedByName: string | null;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  totals: ShiftTotals;
  countedCashAtClose: number | null;
  expectedCashAtClose: number | null;
  cashVariance: number | null;
}

export interface StockBoard {
  items: { id: string; name: string; categoryName: string; isInStock: boolean }[];
  modifiers: { id: string; name: string; groupName: string; isInStock: boolean }[];
}

export interface CurrentShift {
  id: string;
  staffUserId: string;
  staffName: string;
  openedAt: string;
  openingFloat: number;
  isMine: boolean;
  totals: ShiftTotals | null;
  cashMovements: ShiftCashMovement[];
  /** Register orders still open; the shift can't close until they're finished or cancelled. */
  unfinishedPosOrders: string[];
}

export interface ShiftCashMovement {
  id: string;
  movementType: CashMovementType;
  amount: number;
  reason: string;
  authorizedById: string;
  authorizedByName: string;
  expenseId: string | null;
  expenseCategory: ExpenseCategory | null;
  createdAt: string;
}

export interface AdminCategory {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface AdminMenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePrice: number;
  estimatedMaterialCost: number;
  imageUrl: string | null;
  isAvailablePos: boolean;
  isAvailableWeb: boolean;
  isAvailableTalabat: boolean;
  isInStock: boolean;
  sortOrder: number;
  modifierGroupIds: string[];
  hasRecipe: boolean;
}

export interface AdminModifier {
  id: string;
  groupId: string;
  name: string;
  extraPrice: number;
  estimatedMaterialCost: number;
  isDefault: boolean;
  isInStock: boolean;
  sortOrder: number;
  hasRecipe: boolean;
}

export interface AdminModifierGroup {
  id: string;
  name: string;
  minSelection: number;
  maxSelection: number;
  isRequired: boolean;
  isActive: boolean;
  modifiers: AdminModifier[];
}

export interface AdminCatalog {
  categories: AdminCategory[];
  items: AdminMenuItem[];
  modifierGroups: AdminModifierGroup[];
}

export type SaveMenuItemRequest = Omit<AdminMenuItem, 'id' | 'hasRecipe'>;

export interface StaffSummary {
  id: string;
  fullName: string;
  role: StaffRole;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  /** EGP a month; with workingDaysPerMonth it gives a day's pay for penalties. */
  monthlySalary: number | null;
  workingDaysPerMonth: number | null;
  /** Business date the current salary counts from (null without a salary). */
  salaryStartsOn: string | null;
}

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export type PromoState = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'EXHAUSTED' | 'DISABLED';

export interface PromoCode {
  id: string;
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountCap: number | null;
  minOrderAmount: number;
  maxTotalUses: number | null;
  maxUsesPerCustomer: number;
  currentUsesCount: number;
  totalDiscountGiven: number;
  startsAt: string;
  expiresAt: string | null;
  isValidOnPos: boolean;
  isActive: boolean;
  state: PromoState;
  createdByAdminId: string;
  createdAt: string;
}

export type LoyaltyRewardType = 'FREE_ITEM' | 'FIXED_DISCOUNT';

export interface LoyaltyRewardAdmin {
  id: string;
  title: string;
  pointsRequired: number;
  rewardType: LoyaltyRewardType;
  discountAmount: number;
  eligibleCategoryId: string | null;
  isActive: boolean;
  timesRedeemed: number;
  createdAt: string;
}

export type ExpensePaymentSource = 'DRAWER_CASH' | 'SAFE_CASH' | 'BANK_TRANSFER' | 'COMPANY_CARD' | 'OWNER_CASH';

export type RecurringFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Expense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  paymentSource: ExpensePaymentSource;
  incurredDate: string;
  shiftSessionId: string | null;
  shiftCashMovementId: string | null;
  recurringExpenseId: string | null;
  recurringExpenseTitle: string | null;
  authorizedById: string;
  authorizedByName: string;
  invoiceNumber: string | null;
  receiptImageUrl: string | null;
  notes: string | null;
  createdAt: string;
}

export interface RecurringOverhead {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  frequency: RecurringFrequency;
  paymentSource: ExpensePaymentSource | null;
  isActive: boolean;
  effectiveFrom: string;
  effectiveUntil: string | null;
  createdAt: string;
  /** Set when this is a staff member's salary, kept in step from Admin → Staff. */
  staffUserId: string | null;
  /** Start of the current period (this month for a monthly cost) and how much of it is paid. */
  periodStart: string;
  paidThisPeriod: number;
}

export interface ReceiptUploadSignature {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
}

export interface CashFlowSummary {
  fromDate: string;
  toDate: string;
  totalCashIn: number;
  totalCashOut: number;
  netCashChange: number;
  drawerCashCollected: number;
  digitalPaymentsCollected: number;
  talabatPaymentsCollected: number;
  refundsPaid: number;
  drawerCashRefunded: number;
  cashExpensesPaid: number;
  ownerCashExpensesPaid: number;
  nonCashExpensesPaid: number;
  supplierPaymentsPaid: number;
  cashDrops: number;
  netDrawerCashChange: number;
  /** Staff salaries, counted automatically (spread per day like the profit report). */
  salariesPaid: number;
  /** Cash staff borrowed from the drawer. Lowers the drawer but not total out: it's an advance on salaries. */
  staffLoans: number;
}

/** GET /api/v1/finance/staff-month: one month per staff member. Amounts in EGP, dates are business dates. */
export interface StaffMonth {
  month: string;
  from: string;
  to: string;
  penaltiesLocked: boolean;
  staff: StaffMonthRow[];
}

export interface StaffMonthRow {
  staffId: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
  daysAttended: number;
  scheduledShifts: number;
  lateCount: number;
  noShowCount: number;
  penaltyDays: number;
  /** Null when the person has no salary or working days set. */
  penaltyAmount: number | null;
  loansTotal: number;
  expectedSalary: number | null;
  actualSalary: number | null;
  lateShifts: { date: string; shiftName: string; lateMinutes: number; waived: boolean }[];
  noShows: { date: string; shiftName: string; waived: boolean }[];
  loans: { id: string; createdAt: string; amount: number; reason: string; recordedByName: string }[];
}

export interface FinancialStatement {
  fromDate: string;
  toDate: string;
  completedOrders: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPercentage: number;
  directExpenses: number;
  amortizedOverheads: number;
  totalOpex: number;
  opexByCategory: { category: ExpenseCategory; amount: number }[];
  netOperatingProfit: number;
  netProfitMarginPercentage: number;
  cashFlow: CashFlowSummary;
}

export interface BreakEvenToday {
  businessDate: string;
  dailyFixedCostTarget: number;
  currentNetSales: number;
  currentContributionMargin: number;
  contributionMarginPercentage: number | null;
  breakEvenSalesRequired: number | null;
  remainingSalesToBreakEven: number | null;
  isBreakEvenAchieved: boolean;
  netMarginSoFar: number;
}

export interface StaffReportRow {
  staffId: string;
  fullName: string;
  role: StaffRole;
  isActive: boolean;
  shiftsClosed: number;
  totalCashVariance: number;
  shortShifts: number;
  largestShortage: number;
  ordersServed: number;
  paymentsTaken: number;
  refundsIssued: number;
  refundsIssuedAmount: number;
  refundsApproved: number;
  refundsApprovedAmount: number;
  cancellationsApproved: number;
  cashMovementsApproved: number;
  cashMovementsApprovedAmount: number;
}

export interface StaffReportEvent {
  kind: 'REFUND' | 'CANCELLATION';
  occurredAt: string;
  orderDisplayCode: string | null;
  amount: number | null;
  reason: string | null;
  approvedById: string;
  approvedByName: string;
  requestedById: string | null;
  requestedByName: string | null;
}

export interface StaffReport {
  fromDate: string;
  toDate: string;
  staff: StaffReportRow[];
  events: StaffReportEvent[];
}

export interface SalesInsights {
  fromDate: string;
  toDate: string;
  completedOrders: number;
  cancelledOrders: number;
  netSales: number;
  averageOrderValue: number;
  itemsSold: number;
  byDay: { date: string; orders: number; netSales: number }[];
  byHour: { hour: number; orders: number; netSales: number }[];
  byChannel: { channel: OrderChannel; orders: number; netSales: number }[];
  byPaymentMethod: { method: PaymentMethod; payments: number; amount: number }[];
  items: { menuItemId: string; name: string; categoryName: string | null; quantity: number; netRevenue: number }[];
}

export interface ItemProfit {
  menuItemId: string;
  name: string;
  categoryName: string | null;
  quantitySold: number;
  freeQuantity: number;
  netRevenue: number;
  ingredientCost: number;
  grossProfit: number;
  marginPercentage: number | null;
  currentPrice: number | null;
  currentCost: number | null;
  currentMarginPercentage: number | null;
  isOnMenu: boolean;
}

export interface ItemProfitability {
  fromDate: string;
  toDate: string;
  netRevenue: number;
  ingredientCost: number;
  grossProfit: number;
  marginPercentage: number | null;
  items: ItemProfit[];
}

export type InventoryUnit = 'G' | 'KG' | 'ML' | 'L' | 'UNIT';

export type RecipeSection = 'CUP' | 'COFFEE' | 'MILK' | 'SYRUP' | 'SAUCE' | 'ADD_ON' | 'OTHER';

export type InventoryMovement = 'SALE_DEPLETION' | 'PURCHASE_RECEIPT' | 'WASTE_SPOILAGE' | 'AUDIT_ADJUSTMENT' | 'ORDER_REFUND_RESTOCK';

export interface InventoryItem {
  id: string;
  name: string;
  sku: string | null;
  unitOfMeasure: InventoryUnit;
  currentStock: number;
  minStockAlert: number;
  costPerUnit: number;
  stockValue: number;
  isActive: boolean;
  isLow: boolean;
  usedInRecipes: number;
  recipeSection: RecipeSection;
}

export interface InventoryTransaction {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  movementType: InventoryMovement;
  quantityChange: number;
  unitCost: number;
  totalCost: number | null;
  paymentSource: ExpensePaymentSource | null;
  supplierName: string | null;
  orderDisplayCode: string | null;
  reasonNotes: string | null;
  staffName: string | null;
  createdAt: string;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  quantity: number;
}

export interface Recipe {
  ownerId: string;
  ingredients: RecipeIngredient[];
  cost: number;
  /** Options only: used instead of the drink's ingredient in the same recipe section, at the drink's amount. */
  swapInventoryItemId?: string | null;
}

export interface RecipeBook {
  menuItems: Recipe[];
  modifiers: Recipe[];
}

/** An order paid in a shift, for the full shift view. */
export interface ShiftOrder {
  id: string;
  displayCode: string;
  channel: OrderChannel;
  status: OrderStatus;
  createdAt: string;
  cashierName: string | null;
  customerName: string | null;
  subtotal: number;
  discount: number;
  total: number;
  refunded: number;
  items: { name: string; quantity: number; lineTotal: number; modifiers: string[]; isFree: boolean }[];
  payments: { method: PaymentMethod; amount: number; amountTendered: number | null; changeGiven: number; referenceNumber: string | null; createdAt: string }[];
}

/** Result of receiving a whole delivery (Stock → Receive delivery). */
export interface ShipmentResult {
  items: InventoryItem[];
  lines: number;
  totalCost: number;
  /** Names of ingredients that were new and created by this delivery. */
  createdItems: string[];
}

/** Admin → Customers: one loyalty customer (register phone-only or website account). */
export interface LoyaltyCustomer {
  id: string;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  hasWebsiteAccount: boolean;
  emailVerified: boolean;
  inStoreOrders: number;
  websiteOrders: number;
  totalSpent: number;
  stamps: number;
  rewardDue: boolean;
  freeDrinksRedeemed: number;
  lastOrderAt: string | null;
  createdAt: string;
}

export interface LoyaltyCustomerList {
  ordersForReward: number;
  cardIsActive: boolean;
  totalCustomers: number;
  websiteAccounts: number;
  rewardsDue: number;
  customers: LoyaltyCustomer[];
}

export interface LoyaltyCustomerOrder {
  id: string;
  displayCode: string;
  channel: OrderChannel;
  status: OrderStatus;
  paymentStatus: string;
  netAmountDue: number;
  refunded: number;
  hadFreeDrink: boolean;
  countsAsStamp: boolean;
  createdAt: string;
}

export interface StaffLoanEntry {
  id: string;
  staffId: string;
  staffName: string;
  amount: number;
  reason: string;
  recordedByName: string;
  createdAt: string;
}

export interface StaffLoanMonth {
  month: string;
  total: number;
  loans: StaffLoanEntry[];
}
