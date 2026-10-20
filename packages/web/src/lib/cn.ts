import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Join class names, letting later Tailwind utilities win over earlier ones (the shadcn helper). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
