import { useState } from 'react';
import { api } from '../api/client';

/**
 * A user's profile picture when they've uploaded one, falling back to the existing
 * initial-letter circle (the .avatar CSS class) otherwise - used anywhere a person's identity
 * needs a small visual anchor (sidebars, crew roster, discussion messages).
 */
export default function Avatar({
  userId,
  displayName,
  hasAvatar,
  size,
}: {
  userId: string;
  displayName: string;
  hasAvatar: boolean;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const style = size ? { width: size, height: size, fontSize: size * 0.45 } : undefined;

  if (!hasAvatar || failed) {
    return (
      <span className="avatar" style={style}>
        {initial}
      </span>
    );
  }

  return (
    <img
      src={api.auth.avatarUrl(userId)}
      alt={displayName}
      className="avatar"
      style={{ ...style, objectFit: 'cover' }}
      onError={() => setFailed(true)}
    />
  );
}
