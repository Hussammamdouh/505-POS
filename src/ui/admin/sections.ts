import { canManage, isAdmin } from '@/store/app';

import type { Section } from '../SectionNav';

// Menu, staff and pricing stay ADMIN-only; managers get the sections the backend lets them use.
export const ADMIN_SECTIONS: Section[] = [
  { label: 'Menu', href: '/admin/menu', allowed: isAdmin },
  { label: 'Recipes', href: '/admin/recipes', allowed: isAdmin },
  { label: 'Staff', href: '/admin/staff', allowed: isAdmin },
  { label: 'Promos & loyalty', href: '/admin/promos', allowed: isAdmin },
  { label: 'Customers', href: '/admin/customers', allowed: isAdmin },
  { label: 'Inventory', href: '/admin/inventory', allowed: canManage },
  { label: 'Attendance', href: '/admin/attendance', allowed: canManage },
  { label: 'Schedule', href: '/admin/schedule', allowed: canManage },
  { label: 'Expenses', href: '/admin/expenses', allowed: canManage },
  { label: 'Device', href: '/admin/device', allowed: canManage },
];
