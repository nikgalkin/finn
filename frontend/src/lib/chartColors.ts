const ALLOCATION_COLORS = ['#5b8def', '#9b7bdb', '#dcb33f', '#42b8ad', '#d66c9c', '#6eae7b', '#d77a72', '#5fa7d8'];

export const allocationColor = (index: number) => ALLOCATION_COLORS[index % ALLOCATION_COLORS.length];
