import { cn } from '../../lib/utils';
import { WIZARD_STEPS } from '../../stores/stack-builder-store';

const stepLabels: Record<string, string> = {
  use_case: 'Задача',
  deployment: 'Деплой',
  budget: 'Бюджет',
  privacy: 'Приватность',
  language: 'Язык',
  capabilities: 'Возможности',
  hardware: 'Железо',
  skill_level: 'Уровень',
  usage_scale: 'Масштаб',
};

interface WizardStepperProps {
  currentStep: number;
  completedSteps: number;
  onStepClick: (step: number) => void;
}

export function WizardStepper({ currentStep, completedSteps, onStepClick }: WizardStepperProps) {
  return (
    <nav className="mb-8">
      {/* Progress bar */}
      <div className="mb-3 h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${((completedSteps) / WIZARD_STEPS.length) * 100}%` }}
        />
      </div>

      {/* Step indicators */}
      <div className="flex items-center justify-between gap-1">
        {WIZARD_STEPS.map((step, i) => {
          const isActive = i === currentStep;
          const isCompleted = i < completedSteps;
          const isClickable = i <= completedSteps;

          return (
            <button
              key={step}
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onStepClick(i)}
              className={cn(
                'flex flex-col items-center gap-1 text-center transition-colors',
                'disabled:cursor-not-allowed disabled:opacity-40',
                isClickable && !isActive && 'cursor-pointer hover:text-primary',
              )}
            >
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted && !isActive ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6L5 9L10 3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={cn(
                  'hidden text-[10px] leading-tight sm:block',
                  isActive ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {stepLabels[step]}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
