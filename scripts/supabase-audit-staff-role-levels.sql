-- Audit GDL/TX: staff whose role name does not match user_roles
-- (these used to get accessLevel 99 and broke after staff DB gates).
-- Run in Supabase SQL editor for each clinic.

SELECT
  u.name AS staff_name,
  u.email,
  u.role AS staff_role,
  r.name AS matched_role,
  r.level AS role_level,
  CASE
    WHEN u.role IS NULL OR trim(u.role) = '' THEN 'EMPTY_ROLE'
    WHEN r.name IS NULL THEN 'NO_MATCH → was level 99'
    ELSE 'OK'
  END AS status
FROM users_staff u
LEFT JOIN user_roles r
  ON lower(trim(r.name)) = lower(trim(u.role))
WHERE u.is_active IS DISTINCT FROM false
ORDER BY status DESC, u.name;
