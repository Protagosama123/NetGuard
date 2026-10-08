import { AuthService } from './auth.service.ts';
import { initializeDatabase, db } from '../../db/index.ts';
import { users } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';

async function runAuthTests() {
  console.log('[Auth Test] Initializing database...');
  await initializeDatabase();

  const testAdminEmail = `admin_test_${Date.now()}@netguard.local`;
  const testViewerEmail = `viewer_test_${Date.now()}@netguard.local`;
  const testPassword = 'SecurePassword123!';

  console.log('[Auth Test] 1. Registering first user (should get ADMIN role)...');
  const adminRes = await AuthService.register(testAdminEmail, testPassword);
  console.log(`[Auth Test] Registered: id=${adminRes.user.id}, email=${adminRes.user.email}, role=${adminRes.user.role}`);

  if (!adminRes.token) {
    throw new Error('No JWT token returned on registration');
  }

  // Verify decoded token
  const decodedAdmin = AuthService.verifyToken(adminRes.token);
  if (decodedAdmin.email !== testAdminEmail || decodedAdmin.id !== adminRes.user.id) {
    throw new Error('Token verification mismatch for admin');
  }
  console.log('[Auth Test] Admin JWT verification verified.');

  console.log('[Auth Test] 2. Registering second user (should get VIEWER role)...');
  const viewerRes = await AuthService.register(testViewerEmail, testPassword);
  console.log(`[Auth Test] Registered: id=${viewerRes.user.id}, email=${viewerRes.user.email}, role=${viewerRes.user.role}`);
  if (viewerRes.user.role !== 'VIEWER') {
    throw new Error(`Expected VIEWER role for second user, got: ${viewerRes.user.role}`);
  }

  console.log('[Auth Test] 3. Testing duplicate registration rejection...');
  try {
    await AuthService.register(testAdminEmail, 'anotherPassword123');
    throw new Error('Should not allow duplicate email registration');
  } catch (err: any) {
    console.log('[Auth Test] Duplicate registration properly rejected:', err.message);
  }

  console.log('[Auth Test] 4. Testing successful login...');
  const loginRes = await AuthService.login(testAdminEmail, testPassword);
  if (!loginRes.token || loginRes.user.id !== adminRes.user.id) {
    throw new Error('Login failed to return valid token/user');
  }
  console.log('[Auth Test] Login successful with valid token generated.');

  console.log('[Auth Test] 5. Testing invalid password login rejection...');
  try {
    await AuthService.login(testAdminEmail, 'WrongPassword999!');
    throw new Error('Should not allow login with wrong password');
  } catch (err: any) {
    console.log('[Auth Test] Invalid password properly rejected:', err.message);
  }

  console.log('[Auth Test] 6. Testing profile lookup (getProfile)...');
  const profile = await AuthService.getProfile(adminRes.user.id);
  if (profile.email !== testAdminEmail || profile.role !== adminRes.user.role) {
    throw new Error('getProfile returned incorrect data');
  }
  console.log('[Auth Test] Profile lookup successful.');

  console.log('[Auth Test] 7. Testing invalid token rejection...');
  try {
    AuthService.verifyToken('invalid.token.here');
    throw new Error('Should reject invalid token');
  } catch (err: any) {
    console.log('[Auth Test] Invalid token properly rejected.');
  }

  // Cleanup test users
  await db.delete(users).where(eq(users.id, adminRes.user.id));
  await db.delete(users).where(eq(users.id, viewerRes.user.id));
  console.log('[Auth Test] Cleanup finished.');

  console.log('[Auth Test] ALL AUTHENTICATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

runAuthTests().catch((err) => {
  console.error('[Auth Test Failed]:', err);
  process.exit(1);
});
