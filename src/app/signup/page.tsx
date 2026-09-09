import Link from 'next/link';
import { AuthForm } from '../auth/auth-form';
import { AuthShell } from '../auth/auth-shell';

export default function SignupPage() {
  return <AuthShell title="Create your account">
    <AuthForm mode="signup" />
    <p>Already have an account? <Link href="/login" className="text-clay underline">Log in</Link></p>
  </AuthShell>;
}
