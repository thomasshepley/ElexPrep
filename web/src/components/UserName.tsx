import type { Role } from '../api/client';
import { isAdminRole } from '../auth/roles';

/**
 * A person's name, coloured by who they are so staff stand out: admins (and the webmaster)
 * in the brand blue, anyone with the admin-set "PM" tag in purple with a small PM chip (the
 * PM colour wins over the admin one), everyone else in the normal text colour.
 */
export default function UserName({
  name,
  role,
  isProjectManager = false,
  showPmChip = true,
  as: Tag = 'span',
}: {
  name: string;
  role?: Role | string | null;
  isProjectManager?: boolean;
  showPmChip?: boolean;
  as?: 'span' | 'strong';
}) {
  const className = ['user-name', isAdminRole(role as Role) ? 'is-admin' : '', isProjectManager ? 'is-pm' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <>
      <Tag className={className}>{name}</Tag>
      {isProjectManager && showPmChip && (
        <span className="chip chip-pm" title="Project manager">
          PM
        </span>
      )}
    </>
  );
}
