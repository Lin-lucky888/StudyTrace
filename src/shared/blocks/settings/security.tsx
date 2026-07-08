'use client';

import { useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { authClient } from '@/core/auth/client';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

export function SecuritySettings({ email }: { email: string }) {
  return (
    <div className="max-w-md space-y-8">
      <ChangePasswordCard email={email} />
      <DeleteAccountCard />
    </div>
  );
}

function ChangePasswordCard({ email }: { email: string }) {
  const t = useTranslations('settings.security');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;

    if (newPassword.length < 8) {
      toast.error(t('change_password.too_short'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('change_password.mismatch'));
      return;
    }

    setLoading(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        toast.error(error.message || t('change_password.failed'));
        return;
      }

      toast.success(t('change_password.success'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      toast.error(e?.message || t('change_password.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('change_password.title')}</CardTitle>
        <CardDescription>{t('change_password.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          {/* Helps password managers associate the change with the account. */}
          <input
            type="email"
            value={email}
            autoComplete="username"
            hidden
            readOnly
          />
          <div className="grid gap-2">
            <Label htmlFor="current-password">
              {t('change_password.current')}
            </Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-password">{t('change_password.new')}</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder={t('change_password.new_placeholder')}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirm-new-password">
              {t('change_password.confirm')}
            </Label>
            <Input
              id="confirm-new-password"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              t('change_password.submit')
            )}
          </Button>
          <p className="text-muted-foreground text-xs">
            {t('change_password.tip')}
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function DeleteAccountCard() {
  const t = useTranslations('settings.security');
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const { error } = await authClient.deleteUser(
        password ? { password } : {}
      );
      if (error) {
        toast.error(error.message || t('delete_account.failed'));
        return;
      }

      toast.success(t('delete_account.success'));
      window.location.href = '/';
    } catch (e: any) {
      toast.error(e?.message || t('delete_account.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="text-destructive size-4" />
          {t('delete_account.title')}
        </CardTitle>
        <CardDescription>{t('delete_account.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
        >
          {t('delete_account.submit')}
        </Button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('delete_account.confirm_title')}</DialogTitle>
              <DialogDescription>
                {t('delete_account.confirm_description')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="delete-password">
                {t('delete_account.password')}
              </Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                placeholder={t('delete_account.password_placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                {t('delete_account.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  t('delete_account.confirm')
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
