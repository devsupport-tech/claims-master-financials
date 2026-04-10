import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const BRANDING_LABEL = import.meta.env.VITE_BRANDING_LABEL || '';
const COMPANY_LOGO = import.meta.env.VITE_COMPANY_LOGO || '';
const logoSrc = COMPANY_LOGO
  ? COMPANY_LOGO.startsWith('http://') || COMPANY_LOGO.startsWith('https://')
    ? COMPANY_LOGO
    : `/logos/${COMPANY_LOGO}`
  : BRANDING_LABEL
    ? `/logos/${BRANDING_LABEL.toLowerCase()}.png`
    : null;

interface LoginProps {
  onLogin: (password: string) => boolean;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const titleText = `Claims Financials${BRANDING_LABEL ? ` ${BRANDING_LABEL}` : ''} Dashboard`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const success = onLogin(password);
    if (!success) {
      setError('Invalid password');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-4">
      <style>
        {`
          @keyframes loginWelcomeFadeIn {
            from {
              opacity: 0;
              transform: translateY(-12px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
      <div className="w-full max-w-md space-y-4">
        <div
          className="text-center"
          style={{ animation: 'loginWelcomeFadeIn 700ms ease-out both' }}
        >
          <p className="text-4xl font-bold tracking-tight text-primary-foreground md:text-5xl">
            Welcome Admin
          </p>
        </div>

        <Card className="w-full shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-4">
              {logoSrc ? (
                <img src={logoSrc} alt="Company logo" className="h-16 w-16 rounded-full object-contain" />
              ) : (
                <div className="rounded-full bg-primary/10 p-4">
                  <Lock className="w-8 h-8 text-primary" />
                </div>
              )}
            </div>
            <CardTitle className="text-2xl">{titleText}</CardTitle>
            <CardDescription>Enter password to access</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  placeholder="Enter password"
                  autoFocus
                />
                {error && (
                  <p className="text-destructive text-sm">{error}</p>
                )}
              </div>

              <Button type="submit" className="w-full">
                Login
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              Internal team access only
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
