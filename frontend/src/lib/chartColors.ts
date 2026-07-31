// const ALLOCATION_COLORS = ['#1ba9cd', '#9b7bdb', '#d7ae3d', '#42b8ad', '#d66c9c', '#6eae7b', '#d77a72', '#5fa7d8'];
const ALLOCATION_COLORS = ['#5b8def', '#9b7bdb', '#d7ae3d', '#42b8ad', '#d66c9c', '#6eae7b', '#d77a72', '#5fa7d8'];

export const allocationColor = (index: number) => ALLOCATION_COLORS[index % ALLOCATION_COLORS.length];
