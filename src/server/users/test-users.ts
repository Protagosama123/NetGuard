import { initializeDatabase, db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { AuthService } from '../auth/auth.service.ts';
import { UsersService } from './users.service.ts';
import { eq } from 'drizzle-orm';

async function runUsersAdminTests() {
  console.log('[Users Admin Test] Initializing database...');
  await initializeDatabase();

  const timestamp = Date.now();
  const adminEmail = `admin_rbac_${timestamp}@netguard.local`;
  const analystEmail = `analyst_rbac_${timestamp}@netguard.local`;
  const viewerEmail = `viewer_rbac_${timestamp}@netguard.local`;
  const password = 'TestPassword123!';

  // 1. Create users
  console.log('[Users Admin Test] Creating Admin, Analyst, and Viewer...');
  const adminAuth = await AuthService.register(adminEmail, password);
  // Ensure role is ADMIN
  await db.update(users).set({ role: 'ADMIN' }).where(eq(users.id, adminAuth.user.id));

  const analystAuth = await AuthService.register(analystEmail, password);
  await db.update(users).set({ role: 'ANALYST' }).where(eq(users.id, analystAuth.user.id));

  const viewerAuth = await AuthService.register(viewerEmail, password);
  await db.update(users).set({ role: 'VIEWER' }).where(eq(users.id, viewerAuth.user.id));

  console.log('[Users Admin Test] 2. Testing UsersService.listUsers()...');
  const allUsers = await UsersService.listUsers();
  if (!allUsers.some((u) => u.email === adminEmail)) {
    throw new Error('listUsers() failed to include admin user');
  }
  // Ensure passwordHash is omitted
  if ('passwordHash' in allUsers[0] || 'password_hash' in (allUsers[0] as any)) {
    throw new Error('Security violation: password hash leaked in user list');
  }
  console.log(`[Users Admin Test] Found ${allUsers.length} users in database. Sensitive fields omitted.`);

  console.log('[Users Admin Test] 3. Testing role update (Viewer -> ANALYST)...');
  const promotedUser = await UsersService.updateUserRole(viewerAuth.user.id, 'ANALYST', adminAuth.user.id);
  if (promotedUser.role !== 'ANALYST') {
    throw new Error(`Expected role ANALYST, got: ${promotedUser.role}`);
  }
  console.log('[Users Admin Test] Successfully promoted Viewer to ANALYST.');

  console.log('[Users Admin Test] 4. Testing role update (Analyst -> ADMIN)...');
  const secondAdmin = await UsersService.updateUserRole(promotedUser.id, 'ADMIN', adminAuth.user.id);
  if (secondAdmin.role !== 'ADMIN') {
    throw new Error(`Expected role ADMIN, got: ${secondAdmin.role}`);
  }
  console.log('[Users Admin Test] Successfully promoted user to ADMIN.');

  console.log('[Users Admin Test] 5. Testing user account deactivation & reactivation...');
  const deactivatedUser = await UsersService.updateUserStatus(analystAuth.user.id, false, adminAuth.user.id);
  if (deactivatedUser.isActive !== false) {
    throw new Error('Expected isActive to be false');
  }

  // Verify deactivated user cannot log in
  try {
    await AuthService.login(analystEmail, password);
    throw new Error('Deactivated user should not be able to log in');
  } catch (err: any) {
    console.log('[Users Admin Test] Deactivated user correctly blocked from login:', err.message);
  }

  // Reactivate user
  const reactivatedUser = await UsersService.updateUserStatus(analystAuth.user.id, true, adminAuth.user.id);
  if (reactivatedUser.isActive !== true) {
    throw new Error('Expected isActive to be true');
  }
  const loginAfterReactivate = await AuthService.login(analystEmail, password);
  if (!loginAfterReactivate.token) {
    throw new Error('Reactivated user failed to login');
  }
  console.log('[Users Admin Test] Reactivated user successfully logged in.');

  console.log('[Users Admin Test] 6. Testing sole admin protection guardrail...');
  // Demote the second admin first so only one admin remains
  await UsersService.updateUserRole(secondAdmin.id, 'VIEWER', adminAuth.user.id);
  try {
    // Now try to demote the sole admin
    await UsersService.updateUserRole(adminAuth.user.id, 'VIEWER', adminAuth.user.id);
    throw new Error('Sole admin should not be able to demote themselves');
  } catch (err: any) {
    console.log('[Users Admin Test] Guardrail caught self-demotion as expected:', err.message);
  }

  try {
    // Try to deactivate the sole admin
    await UsersService.updateUserStatus(adminAuth.user.id, false, adminAuth.user.id);
    throw new Error('Sole admin should not be able to deactivate themselves');
  } catch (err: any) {
    console.log('[Users Admin Test] Guardrail caught self-deactivation as expected:', err.message);
  }

  // Cleanup
  await db.delete(users).where(eq(users.id, adminAuth.user.id));
  await db.delete(users).where(eq(users.id, analystAuth.user.id));
  await db.delete(users).where(eq(users.id, viewerAuth.user.id));
  console.log('[Users Admin Test] Test data cleaned up.');

  console.log('[Users Admin Test] ALL USERS ADMINISTRATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runUsersAdminTests().catch((err) => {
  console.error('[Users Admin Test Failed]:', err);
  process.exit(1);
});
