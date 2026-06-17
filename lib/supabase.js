/**
 * Client-side DB access is blocked by RLS. Use createStaffDb() for staff UI
 * or /api/public/portal for public booking.
 */
import { createStaffDb } from './staffDbClient.js';

export { createStaffDb };

/** @deprecated Direct Supabase client removed for security. Use createStaffDb(). */
export const supabaseGdl = null;
/** @deprecated Direct Supabase client removed for security. Use createStaffDb(). */
export const supabaseShenandoah = null;
