import { trpc } from '@/shared/api';

export function useApiHealth() {
  return trpc.health.useQuery(undefined, { retry: false });
}
