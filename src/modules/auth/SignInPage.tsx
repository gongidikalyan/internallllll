import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, Copy, Eye, EyeOff, KeyRound, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { generateRandomNumberPassword } from '../../lib/authCredentials';

const signInSchema = z.object({
  email: z.string().email('Enter a valid work email address.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

type SignInFormValues = z.infer<typeof signInSchema>;

const bootstrapSchema = z.object({
  companyName: z.string().min(2, 'Company name is required.'),
  roleSlug: z.enum(['ceo', 'administrator']),
  fullName: z.string().min(2, 'Full name is required.'),
  email: z.string().email('Enter a valid work email address.'),
  employeeCode: z.string().min(2, 'Employee code is required.'),
  jobTitle: z.string().min(2, 'Job title is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters.'),
});

type BootstrapFormValues = z.infer<typeof bootstrapSchema>;

export function SignInPage() {
  const {
    isPreviewMode,
    hasAnyUsers,
    signInWithEmail,
    bootstrapFirstAdmin,
    authError,
  } = useAuth();
  const navigate = useNavigate();

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showBootstrapPassword, setShowBootstrapPassword] = useState(true);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [passwordEditedManually, setPasswordEditedManually] = useState(false);

  const needsInitialSetup = isPreviewMode && !hasAnyUsers;

  const signInForm = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });

  const bootstrapForm = useForm<BootstrapFormValues>({
    resolver: zodResolver(bootstrapSchema),
    defaultValues: {
      companyName: 'Company ERP',
      roleSlug: 'ceo',
      fullName: '',
      email: '',
      employeeCode: 'EMP-001',
      jobTitle: 'Chief Executive Officer',
      password: generateRandomNumberPassword('ceo'),
    },
  });

  const onSignInSubmit = async (values: SignInFormValues) => {
    setSubmitError(null);
    try {
      await signInWithEmail(values.email, values.password);
      navigate('/');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Authentication failed.');
    }
  };

  const onBootstrapSubmit = async (values: BootstrapFormValues) => {
    setSubmitError(null);
    try {
      await bootstrapFirstAdmin(values);
      navigate('/overview');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to initialize organization.');
    }
  };

  const handleRegenerateBootstrapPassword = (roleSlug?: 'ceo' | 'administrator') => {
    const slug = roleSlug ?? bootstrapForm.getValues('roleSlug');
    const nextPassword = generateRandomNumberPassword(slug);
    bootstrapForm.setValue('password', nextPassword, { shouldValidate: true });
    setPasswordCopied(false);
  };

  const handleCopyBootstrapPassword = async () => {
    const val = bootstrapForm.getValues('password');
    if (!val || !navigator.clipboard) return;
    await navigator.clipboard.writeText(val);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-[#060D1A] dark:text-slate-100">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-[#1E3252] dark:bg-[#0C1729]">
        <div className="flex items-center gap-2.5">
          <svg className="h-6 w-6 text-[#0B3B66] dark:text-sky-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2.5L20 7V17L12 21.5L4 17V7L12 2.5Z"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinejoin="round"
            />
            <path
              d="M12 2.5V12M12 12L20 7M12 12L4 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </svg>
          <span className="font-display text-base font-semibold tracking-tight">Company ERP</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-12">
        <div className={`w-full ${needsInitialSetup ? 'max-w-xl' : 'max-w-md'}`}>
          {/* Auth Form Panel */}
          <div className="rounded-lg border border-slate-200 bg-white p-8 dark:border-[#1E3252] dark:bg-[#0C1729]">
            <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-white">
              {needsInitialSetup ? 'Initialize Primary Executive Account' : 'Sign in to Company ERP'}
            </h2>
            {needsInitialSetup ? (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Create the founding executive credentials to unlock your workspace.
              </p>
            ) : null}

            {(submitError || authError) ? (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submitError || authError}</span>
              </div>
            ) : null}

            {needsInitialSetup ? (
              <form onSubmit={bootstrapForm.handleSubmit(onBootstrapSubmit)} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="companyName" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Company Name *
                  </label>
                  <input
                    id="companyName"
                    {...bootstrapForm.register('companyName')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                  {bootstrapForm.formState.errors.companyName ? (
                    <p className="mt-1 text-[11px] text-red-600">{bootstrapForm.formState.errors.companyName.message}</p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="roleSlug" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Executive Role *
                  </label>
                  <select
                    id="roleSlug"
                    {...bootstrapForm.register('roleSlug')}
                    onChange={(e) => {
                      const nextRole = e.target.value as 'ceo' | 'administrator';
                      bootstrapForm.setValue('roleSlug', nextRole);
                      bootstrapForm.setValue(
                        'jobTitle',
                        nextRole === 'ceo' ? 'Chief Executive Officer' : 'System Administrator'
                      );
                      if (!passwordEditedManually) {
                        handleRegenerateBootstrapPassword(nextRole);
                      }
                    }}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-xs text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  >
                    <option value="ceo">CEO (Chief Executive Officer)</option>
                    <option value="administrator">Administrator</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="fullName" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Full Name *
                  </label>
                  <input
                    id="fullName"
                    placeholder="Your full name"
                    {...bootstrapForm.register('fullName')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                  {bootstrapForm.formState.errors.fullName ? (
                    <p className="mt-1 text-[11px] text-red-600">{bootstrapForm.formState.errors.fullName.message}</p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="bootstrap-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Work Email *
                  </label>
                  <input
                    id="bootstrap-email"
                    type="email"
                    placeholder="founder@yourcompany.com"
                    {...bootstrapForm.register('email')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                  {bootstrapForm.formState.errors.email ? (
                    <p className="mt-1 text-[11px] text-red-600">{bootstrapForm.formState.errors.email.message}</p>
                  ) : null}
                </div>

                <div>
                  <label htmlFor="employeeCode" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Employee Code *
                  </label>
                  <input
                    id="employeeCode"
                    {...bootstrapForm.register('employeeCode')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 font-mono text-xs uppercase text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                </div>

                <div>
                  <label htmlFor="jobTitle" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Job Title *
                  </label>
                  <input
                    id="jobTitle"
                    {...bootstrapForm.register('jobTitle')}
                    className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="bootstrap-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setPasswordEditedManually(false);
                        handleRegenerateBootstrapPassword();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0B3B66] hover:underline dark:text-sky-400"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Generate Random
                    </button>
                  </div>
                  <div className="mt-1 flex gap-2">
                    <div className="relative flex-1">
                      <input
                        id="bootstrap-password"
                        type={showBootstrapPassword ? 'text' : 'password'}
                        {...bootstrapForm.register('password', {
                          onChange: () => setPasswordEditedManually(true),
                        })}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white pr-9 pl-3 font-mono text-sm text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() => setShowBootstrapPassword((prev) => !prev)}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        aria-label={showBootstrapPassword ? 'Hide password' : 'Show password'}
                      >
                        {showBootstrapPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyBootstrapPassword}
                      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-[#1E3252] dark:text-slate-200 dark:hover:bg-[#13233C]"
                    >
                      {passwordCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {passwordCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {bootstrapForm.formState.errors.password ? (
                    <p className="mt-1 text-[11px] text-red-600">{bootstrapForm.formState.errors.password.message}</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Save this password before entering. It is stored as a salted SHA-256 hash.
                    </p>
                  )}
                </div>

                <div className="pt-1 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={bootstrapForm.formState.isSubmitting}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#0B3B66] px-4 text-sm font-medium text-white transition-colors hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                  >
                    <KeyRound className="h-4 w-4" />
                    {bootstrapForm.formState.isSubmitting ? 'Initializing Workspace...' : 'Create Account & Enter Workspace'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-6 space-y-6">
                <form onSubmit={signInForm.handleSubmit(onSignInSubmit)} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Work Email
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      {...signInForm.register('email')}
                      className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                      placeholder="name@company.com"
                    />
                    {signInForm.formState.errors.email ? (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{signInForm.formState.errors.email.message}</p>
                    ) : null}
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        {...signInForm.register('password')}
                        className="h-10 w-full rounded-md border border-slate-300 bg-white pr-10 pl-3 font-mono text-sm text-slate-900 focus:border-[#0B3B66] focus:outline-none dark:border-[#1E3252] dark:bg-[#060D1A] dark:text-slate-100"
                        placeholder="Enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {signInForm.formState.errors.password ? (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400">{signInForm.formState.errors.password.message}</p>
                    ) : null}
                  </div>

                  <button
                    type="submit"
                    disabled={signInForm.formState.isSubmitting}
                    className="h-10 w-full rounded-md bg-[#0B3B66] px-4 text-sm font-medium text-white transition-colors hover:bg-[#082B4C] disabled:opacity-50 dark:bg-sky-600 dark:hover:bg-sky-500"
                  >
                    {signInForm.formState.isSubmitting ? 'Signing in...' : 'Sign In'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
