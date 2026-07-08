'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { authClient } from '@/core/auth/client';
import { Link, useRouter } from '@/core/i18n/navigation';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

export function ResetPassword({
  token,
  error,
}: {
  token?: string;
  error?: string;
}) {
  const router = useRouter();
  const t = useTranslations('common.sign');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const invalidToken = !token || error === 'INVALID_TOKEN';

  const handleSubmit = async () => {
    if (loading || !token) return;

    if (password.length < 8) {
      toast.error(t('password_too_short'));
      return;
    }
    if (password !== confirmPassword) {
      toast.error(t('password_mismatch'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (error) {
        toast.error(error.message || t('reset_password_failed'));
        setLoading(false);
        return;
      }

      toast.success(t('reset_password_success'));
      router.push('/sign-in');
    } catch (e: any) {
      toast.error(e?.message || t('reset_password_failed'));
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full md:max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">
          <h1>{t('reset_password_title')}</h1>
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          <h2>
            {invalidToken
              ? t('reset_password_invalid_token')
              : t('reset_password_description')}
          </h2>
        </CardDescription>
      </CardHeader>
      {!invalidToken && (
        <CardContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="new-password">{t('new_password_title')}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder={t('new_password_placeholder')}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">
                {t('confirm_password_title')}
              </Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder={t('confirm_password_placeholder')}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <p>{t('reset_password_submit')}</p>
              )}
            </Button>
          </form>
        </CardContent>
      )}
      <CardFooter>
        <div className="flex w-full justify-center border-t py-4">
          <p className="text-center text-xs text-neutral-500">
            {invalidToken ? (
              <Link href="/forgot-password" className="underline">
                <span className="cursor-pointer dark:text-white/70">
                  {t('forgot_password_title')}
                </span>
              </Link>
            ) : (
              <Link href="/sign-in" className="underline">
                <span className="cursor-pointer dark:text-white/70">
                  {t('back_to_sign_in')}
                </span>
              </Link>
            )}
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}
