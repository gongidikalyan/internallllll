import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  generateRandomNumberPassword,
  generateSaltHex,
  hashPassword,
  verifyPasswordHash,
} from '../lib/authCredentials';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { loadPreviewState, savePreviewState, type PreviewDatabaseState } from '../services/previewStore';
import type { InitialCredentialNotice, Profile, Role } from '../types/erp';

interface AuthSessionData {
  profile: Profile;
  roles: Role[];
  permissions: Set<string>;
  minRoleTier: number;
  mustChangePassword: boolean;
}

export interface BootstrapAdminInput {
  companyName?: string;
  fullName: string;
  email: string;
  employeeCode: string;
  jobTitle: string;
  roleSlug: 'ceo' | 'administrator';
  password: string;
}

interface AuthContextValue {
  isLoading: boolean;
  isPreviewMode: boolean;
  isAuthenticated: boolean;
  hasAnyUsers: boolean;
  mustChangePassword: boolean;
  initialExecutiveCredentials: InitialCredentialNotice[];
  profile: Profile | null;
  companyId: string | null;
  roles: Role[];
  permissions: Set<string>;
  minRoleTier: number;
  authError: string | null;
  hasPermission: (permissionCode: string) => boolean;
  hasAnyPermission: (permissionCodes: string[]) => boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  bootstrapFirstAdmin: (input: BootstrapAdminInput) => Promise<void>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  dismissExecutiveCredentialsNotice: () => void;
  refreshSessionProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const INITIAL_EXECUTIVE_PASSWORDS: Record<string, string> = {
  'user-ceo': 'CEO@07333358',
  'user-cto': 'CTO@4927',
  'user-cbo': 'CBO@7354',
  'user-cpo': 'CPO@6182',
};

async function ensureExecutiveBootstrapCredentials(state: PreviewDatabaseState): Promise<PreviewDatabaseState> {
  if (state.profiles.length === 0) {
    return state;
  }

  const now = new Date().toISOString();
  const roleMap = new Map(state.roles.map((r) => [r.id, r]));
  const existingUserIds = new Set(state.user_credentials.map((c) => c.user_id));
  let mutated = false;

  for (const prof of state.profiles) {
    if (existingUserIds.has(prof.id)) continue;
    const presetPassword = INITIAL_EXECUTIVE_PASSWORDS[prof.id];
    const ur = state.user_roles.find((u) => u.user_id === prof.id);
    const role = ur ? roleMap.get(ur.role_id) : undefined;
    const rawPassword = presetPassword ?? generateRandomNumberPassword(role?.slug ?? prof.job_title);
    const salt = generateSaltHex();
    const passwordHash = await hashPassword(rawPassword, salt);

    state.user_credentials.push({
      id: crypto.randomUUID(),
      user_id: prof.id,
      email: prof.email.toLowerCase(),
      password_hash: passwordHash,
      password_salt: salt,
      must_change_password: false,
      password_updated_at: now,
      failed_attempts: 0,
      last_login_at: null,
    });
    mutated = true;
  }

  if (state.initial_credentials_notice.length > 0) {
    state.initial_credentials_notice = [];
    mutated = true;
  }

  if (mutated) {
    savePreviewState(state);
  }
  return state;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveSupabaseAuthData(userId: string): Promise<AuthSessionData> {
  if (!supabase) throw new Error('Supabase client is not initialized.');

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profileError || !profileData) {
    throw new Error(profileError?.message ?? 'Authenticated user has no company profile record.');
  }

  const profile = profileData as Profile;

  if (profile.status === 'suspended' || profile.status === 'offboarded') {
    throw new Error(`Account is ${profile.status} and cannot access Company ERP.`);
  }

  const { data: userRolesData, error: urError } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)
    .eq('company_id', profile.company_id);

  if (urError) throw new Error(urError.message);
  const roleIds = (userRolesData ?? []).map((r: { role_id: string }) => r.role_id);

  if (roleIds.length === 0) {
    return {
      profile,
      roles: [],
      permissions: new Set<string>(),
      minRoleTier: 100,
      mustChangePassword: false,
    };
  }

  const [rolesRes, rpRes] = await Promise.all([
    supabase.from('roles').select('*').in('id', roleIds),
    supabase.from('role_permissions').select('permission:permissions(code)').in('role_id', roleIds),
  ]);

  if (rolesRes.error) throw new Error(rolesRes.error.message);
  if (rpRes.error) throw new Error(rpRes.error.message);

  const roles = (rolesRes.data ?? []) as Role[];
  const permCodes = new Set<string>();

  for (const row of (rpRes.data ?? []) as Array<{ permission: { code: string } | { code: string }[] | null }>) {
    if (Array.isArray(row.permission)) {
      for (const p of row.permission) {
        if (p?.code) permCodes.add(p.code);
      }
    } else if (row.permission?.code) {
      permCodes.add(row.permission.code);
    }
  }

  const minRoleTier = roles.length > 0 ? Math.min(...roles.map((r) => r.role_tier)) : 100;

  return { profile, roles, permissions: permCodes, minRoleTier, mustChangePassword: false };
}

function resolveLocalAuthData(userId: string | null): AuthSessionData | null {
  if (!userId) return null;
  const state = loadPreviewState();
  const profile = state.profiles.find(
    (p) => p.id === userId && p.status !== 'suspended' && p.status !== 'offboarded'
  );
  if (!profile) return null;

  const cred = state.user_credentials.find((c) => c.user_id === profile.id);
  if (!cred) return null;

  const roleIds = new Set(state.user_roles.filter((ur) => ur.user_id === profile.id).map((ur) => ur.role_id));
  const roles = state.roles.filter((r) => roleIds.has(r.id));
  const permIds = new Set(
    state.role_permissions.filter((rp) => roleIds.has(rp.role_id)).map((rp) => rp.permission_id)
  );
  const permissions = new Set<string>();
  for (const p of state.permissions) {
    if (permIds.has(p.id)) {
      permissions.add(p.code);
    }
  }
  const minRoleTier = roles.length > 0 ? Math.min(...roles.map((r) => r.role_tier)) : 100;
  return {
    profile,
    roles,
    permissions,
    minRoleTier,
    mustChangePassword: cred.must_change_password,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [sessionData, setSessionData] = useState<AuthSessionData | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [initialExecutiveCredentials, setInitialExecutiveCredentials] = useState<InitialCredentialNotice[]>([]);
  const [hasAnyUsers, setHasAnyUsers] = useState<boolean>(() => {
    if (isSupabaseConfigured) return true;
    return loadPreviewState().profiles.length > 0;
  });

  const refreshSessionProfile = useCallback(async () => {
    setAuthError(null);
    if (isSupabaseConfigured && supabase) {
      setHasAnyUsers(true);
      setInitialExecutiveCredentials([]);
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setAuthError(error.message);
        setSessionData(null);
        setIsLoading(false);
        return;
      }
      if (!data.session?.user) {
        setSessionData(null);
        setIsLoading(false);
        return;
      }
      try {
        const resolved = await resolveSupabaseAuthData(data.session.user.id);
        setSessionData(resolved);
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Unable to load company profile.');
        setSessionData(null);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    const loaded = loadPreviewState();
    const localState = await ensureExecutiveBootstrapCredentials(loaded);
    setHasAnyUsers(localState.profiles.length > 0);
    setInitialExecutiveCredentials([]);
    const resolved = resolveLocalAuthData(localState.activeUserId);
    setSessionData(resolved);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refreshSessionProfile();

    if (isSupabaseConfigured && supabase) {
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (!session?.user) {
          setSessionData(null);
          setIsLoading(false);
          return;
        }
        void resolveSupabaseAuthData(session.user.id)
          .then((resolved) => {
            setSessionData(resolved);
            setAuthError(null);
          })
          .catch((err) => {
            setAuthError(err instanceof Error ? err.message : 'Unable to load company profile.');
            setSessionData(null);
          })
          .finally(() => setIsLoading(false));
      });
      return () => listener.subscription.unsubscribe();
    }
  }, [refreshSessionProfile]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    setAuthError(null);

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw new Error(error.message);
      if (data.user) {
        const resolved = await resolveSupabaseAuthData(data.user.id);
        setSessionData(resolved);
      }
      return;
    }

    const state = loadPreviewState();
    const cred = state.user_credentials.find((c) => c.email.toLowerCase() === normalizedEmail);
    const profile = cred
      ? state.profiles.find((p) => p.id === cred.user_id)
      : state.profiles.find((p) => p.email.toLowerCase() === normalizedEmail);

    if (!cred || !profile) {
      throw new Error('Invalid email or password.');
    }

    if (profile.status === 'suspended' || profile.status === 'offboarded') {
      throw new Error(`Account is ${profile.status} and cannot access Company ERP.`);
    }

    const isValid = await verifyPasswordHash(password, cred.password_salt, cred.password_hash);
    if (!isValid) {
      cred.failed_attempts += 1;
      savePreviewState(state);
      throw new Error('Invalid email or password.');
    }

    const now = new Date().toISOString();
    cred.failed_attempts = 0;
    cred.last_login_at = now;
    state.activeUserId = profile.id;
    state.audit_logs.unshift({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      actor_id: profile.id,
      actor_name: profile.full_name,
      action: 'auth.sign_in',
      entity_type: 'profile',
      entity_id: profile.id,
      after_state: { email: profile.email },
      created_at: now,
    });
    savePreviewState(state);

    const resolved = resolveLocalAuthData(profile.id);
    setHasAnyUsers(state.profiles.length > 0);
    setSessionData(resolved);
  }, []);

  const bootstrapFirstAdmin = useCallback(async (input: BootstrapAdminInput) => {
    if (isSupabaseConfigured) {
      throw new Error('First-user local setup is disabled when Supabase Auth is connected.');
    }

    const state = loadPreviewState();
    if (state.profiles.length > 0) {
      throw new Error('Organization already initialized. Please sign in with your email and password.');
    }

    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    const targetRole = state.roles.find((r) => r.slug === input.roleSlug);
    if (!targetRole) {
      throw new Error('Initial organizational role definition not found.');
    }

    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const salt = generateSaltHex();
    const passwordHash = await hashPassword(password, salt);

    if (input.companyName && input.companyName.trim().length >= 2) {
      state.company.name = input.companyName.trim();
      state.company.legal_name = input.companyName.trim();
      state.company.updated_at = now;
    }
    state.company.primary_contact_email = email;

    const newProfile: Profile = {
      id: userId,
      company_id: state.company.id,
      department_id: null,
      primary_business_unit_id: null,
      manager_id: null,
      employee_code: input.employeeCode.trim().toUpperCase() || 'EMP-001',
      full_name: input.fullName.trim(),
      email,
      job_title: input.jobTitle.trim(),
      employment_type: input.roleSlug === 'ceo' ? 'executive' : 'full_time',
      status: 'active',
      availability: 'available',
      phone: null,
      location: null,
      timezone: state.company.timezone || 'UTC',
      avatar_url: null,
      joined_at: now.slice(0, 10),
      created_at: now,
      updated_at: now,
    };

    state.profiles.push(newProfile);
    state.user_credentials.push({
      id: crypto.randomUUID(),
      user_id: userId,
      email,
      password_hash: passwordHash,
      password_salt: salt,
      must_change_password: false,
      password_updated_at: now,
      failed_attempts: 0,
      last_login_at: now,
    });
    state.user_roles.push({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      user_id: userId,
      role_id: targetRole.id,
      business_unit_id: null,
      assigned_by: userId,
      assigned_at: now,
    });
    state.activeUserId = userId;
    state.audit_logs.unshift({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      actor_id: userId,
      actor_name: newProfile.full_name,
      action: 'company.initialized',
      entity_type: 'profile',
      entity_id: userId,
      after_state: { role: targetRole.slug, email },
      created_at: now,
    });

    savePreviewState(state);
    setHasAnyUsers(true);
    setAuthError(null);
    setSessionData(resolveLocalAuthData(userId));
  }, []);

  const changeOwnPassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const trimmedNew = newPassword.trim();
    if (trimmedNew.length < 6) {
      throw new Error('New password must be at least 6 characters.');
    }

    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.updateUser({ password: trimmedNew });
      if (error) throw new Error(error.message);
      return;
    }

    const state = loadPreviewState();
    const userId = state.activeUserId;
    if (!userId) throw new Error('No authenticated user session.');
    const cred = state.user_credentials.find((c) => c.user_id === userId);
    const profile = state.profiles.find((p) => p.id === userId);
    if (!cred || !profile) throw new Error('User credentials not found.');

    const currentValid = await verifyPasswordHash(
      currentPassword,
      cred.password_salt,
      cred.password_hash
    );
    if (!currentValid) {
      throw new Error('Current password is incorrect.');
    }

    const newSalt = generateSaltHex();
    const newHash = await hashPassword(trimmedNew, newSalt);
    const now = new Date().toISOString();

    cred.password_salt = newSalt;
    cred.password_hash = newHash;
    cred.must_change_password = false;
    cred.password_updated_at = now;
    state.initial_credentials_notice = state.initial_credentials_notice.filter(
      (n) => n.user_id !== profile.id
    );

    state.audit_logs.unshift({
      id: crypto.randomUUID(),
      company_id: state.company.id,
      actor_id: profile.id,
      actor_name: profile.full_name,
      action: 'auth.password_changed',
      entity_type: 'profile',
      entity_id: profile.id,
      after_state: { password_updated_at: now },
      created_at: now,
    });
    savePreviewState(state);
    setInitialExecutiveCredentials(state.initial_credentials_notice);
    setSessionData(resolveLocalAuthData(userId));
  }, []);

  const dismissExecutiveCredentialsNotice = useCallback(() => {
    if (isSupabaseConfigured) return;
    const state = loadPreviewState();
    state.initial_credentials_notice = [];
    savePreviewState(state);
    setInitialExecutiveCredentials([]);
  }, []);

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
      setSessionData(null);
      return;
    }
    const state = loadPreviewState();
    state.activeUserId = null;
    savePreviewState(state);
    setSessionData(null);
  }, []);

  const permissions = useMemo(() => sessionData?.permissions ?? new Set<string>(), [sessionData]);

  const hasPermission = useCallback(
    (code: string) => permissions.has(code),
    [permissions]
  );

  const hasAnyPermission = useCallback(
    (codes: string[]) => codes.some((c) => permissions.has(c)),
    [permissions]
  );

  return (
    <AuthContext.Provider
      value={{
        isLoading,
        isPreviewMode: !isSupabaseConfigured,
        isAuthenticated: Boolean(sessionData),
        hasAnyUsers,
        mustChangePassword: sessionData?.mustChangePassword ?? false,
        initialExecutiveCredentials,
        profile: sessionData?.profile ?? null,
        companyId: sessionData?.profile.company_id ?? null,
        roles: sessionData?.roles ?? [],
        permissions,
        minRoleTier: sessionData?.minRoleTier ?? 100,
        authError,
        hasPermission,
        hasAnyPermission,
        signInWithEmail,
        bootstrapFirstAdmin,
        changeOwnPassword,
        dismissExecutiveCredentialsNotice,
        refreshSessionProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
