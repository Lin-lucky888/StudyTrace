'use client';

import { useState } from 'react';
import { Loader2, MailCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { authClient } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { defaultLocale } from '@/config/locale';
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

export function ForgotPassword({ defaultEmail = '' }: { defaultEmail?: string }) {
  const locale = useLocale();
  const t = useTranslations('common.sign');
  const [email, setEmail] = useState(defaultEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const base = locale !== defaultLocale ? `/${locale}` : '';

  const handleSubmit = async () => {
    if (loading) return;
    if (!email) {
      toast.error(t('email_placeholder'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: `${base}/reset-password`,
      });
      if (error) {
        toast.error(error.message || t('reset_link_failed'));
      } else {
        setSent(true);
      }
    } catch (e: any) {
      toast.error(e?.message || t('reset_link_failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full md:max-w-md">
      <CardHeader>
        <CardTitle className="text-lg md:text-xl">
          <h1>{t('forgot_password_title')}</h1>
        </CardTitle>
        <CardDescription className="text-xs md:text-sm">
          <h2>{t('forgot_password_description')}</h2>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <MailCheck className="text-primary size-10" />
            <p className="text-sm">{t('reset_link_sent', { email })}</p>
            <p className="text-muted-foreground text-xs">
              {t('reset_link_sent_tip')}
            </p>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="email">{t('email_title')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('email_placeholder')}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <p>{t('send_reset_link')}</p>
              )}
            </Button>
          </form>
        )}
      </CardContent>
      <CardFooter>
        <div className="flex w-full justify-center border-t py-4">
          <p className="text-center text-xs text-neutral-500">
            <Link href="/sign-in" className="underline">
              <span className="cursor-pointer dark:text-white/70">
                {t('back_to_sign_in')}
              </span>
            </Link>
          </p>
        </div>
      </CardFooter>
    </Card>
  );
}
