export const ALLOCATION_COLORS = ['#eab308', '#3b82f6', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#ef4444', '#10b981'];

export const allocationColor = (index: number) => ALLOCATION_COLORS[index % ALLOCATION_COLORS.length];
