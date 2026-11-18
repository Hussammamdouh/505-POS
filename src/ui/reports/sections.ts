import { canManage } from '@/store/app';

import type { Section } from '../SectionNav';

export const REPORT_SECTIONS: Section[] = [
  { label: 'Today', href: '/reports/today', allowed: canManage },
  { label: 'Sales', href: '/reports/sales', allowed: canManage },
  { label: 'Item profit', href: '/reports/items', allowed: canManage },
  { label: 'Profit & loss', href: '/reports/profit', allowed: canManage },
  { label: 'Cash flow', href: '/reports/cash', allowed: canManage },
  { label: 'Staff', href: '/reports/staff', allowed: canManage },
  { label: 'Shifts', href: '/reports/shifts', allowed: canManage },
  { label: 'Hours', href: '/reports/hours', allowed: canManage },
];
