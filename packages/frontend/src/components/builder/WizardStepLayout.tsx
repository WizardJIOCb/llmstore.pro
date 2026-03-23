import { Button } from '../ui';

interface WizardStepLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  canGoBack: boolean;
  canGoNext: boolean;
  isLastStep?: boolean;
  isSubmitting?: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function WizardStepLayout({
  title,
  subtitle,
  children,
  canGoBack,
  canGoNext,
  isLastStep = false,
  isSubmitting = false,
  onBack,
  onNext,
}: WizardStepLayoutProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="mb-8">{children}</div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={!canGoBack}
        >
          Назад
        </Button>
        <Button
          onClick={onNext}
          disabled={!canGoNext || isSubmitting}
        >
          {isSubmitting ? 'Обработка...' : isLastStep ? 'Получить рекомендации' : 'Далее'}
        </Button>
      </div>
    </div>
  );
}
