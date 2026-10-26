export function homePathForRole(role: string | null | undefined): string {
  const normalized = (role || '').toLowerCase();
  if (normalized === 'super_admin' || normalized === 'admin') return '/';
  return '/leads';
}
