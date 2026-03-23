import { useCallback } from 'react';
import { useStackBuilderStore, WIZARD_STEPS } from '../../stores/stack-builder-store';
import { useRecommend } from '../../hooks/useStackBuilder';
import { WizardStepper } from '../../components/builder/WizardStepper';
import { ResultPanel } from '../../components/builder/ResultPanel';
import { UseCaseStep } from '../../components/builder/steps/UseCaseStep';
import { DeploymentStep } from '../../components/builder/steps/DeploymentStep';
import { BudgetStep } from '../../components/builder/steps/BudgetStep';
import { PrivacyStep } from '../../components/builder/steps/PrivacyStep';
import { LanguageStep } from '../../components/builder/steps/LanguageStep';
import { CapabilitiesStep } from '../../components/builder/steps/CapabilitiesStep';
import { HardwareStep } from '../../components/builder/steps/HardwareStep';
import { SkillLevelStep } from '../../components/builder/steps/SkillLevelStep';
import { UsageScaleStep } from '../../components/builder/steps/UsageScaleStep';
import type { StackBuilderInput } from '@llmstore/shared';

const stepComponents = [
  UseCaseStep,
  DeploymentStep,
  BudgetStep,
  PrivacyStep,
  LanguageStep,
  CapabilitiesStep,
  HardwareStep,
  SkillLevelStep,
] as const;

export function StackBuilderPage() {
  const { currentStep, answers, result, error, goToStep, setResult, setError, reset } =
    useStackBuilderStore();
  const recommend = useRecommend();

  // Calculate how many steps are "completed" (have an answer)
  const completedSteps = (() => {
    const required: (keyof StackBuilderInput)[] = [
      'use_case',
      'deployment_preference',
      'budget_sensitivity',
      'privacy_requirement',
      'language_requirement',
    ];
    // Steps 0-4 require an answer, steps 5-8 are optional
    let count = 0;
    for (let i = 0; i < WIZARD_STEPS.length; i++) {
      const key = WIZARD_STEPS[i];
      const fieldKey = stepFieldMap[key];
      if (i < required.length) {
        if (answers[fieldKey] !== undefined) count++;
        else break;
      } else {
        // Optional steps are "completed" if we've passed them
        if (currentStep > i) count++;
        else if (currentStep === i) break;
        else break;
      }
    }
    return count;
  })();

  const handleSubmit = useCallback(async () => {
    // Ensure required fields are present
    if (
      !answers.use_case ||
      !answers.deployment_preference ||
      !answers.budget_sensitivity ||
      !answers.privacy_requirement ||
      !answers.language_requirement
    ) {
      setError('Заполните все обязательные шаги');
      return;
    }

    setError(null);
    try {
      const input: StackBuilderInput = {
        use_case: answers.use_case,
        deployment_preference: answers.deployment_preference,
        budget_sensitivity: answers.budget_sensitivity,
        privacy_requirement: answers.privacy_requirement,
        language_requirement: answers.language_requirement,
        capabilities_needed: answers.capabilities_needed ?? [],
        hardware_tier: answers.hardware_tier,
        skill_level: answers.skill_level,
        usage_scale: answers.usage_scale,
      };

      const res = await recommend.mutateAsync(input);
      setResult(res);
    } catch (err: any) {
      setError(err.response?.data?.error?.message ?? 'Произошла ошибка');
    }
  }, [answers, recommend, setResult, setError]);

  // Show results if we have them
  if (result) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <ResultPanel
          result={result}
          answers={answers as StackBuilderInput}
          onReset={reset}
        />
      </div>
    );
  }

  const StepComponent = stepComponents[currentStep];

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold">Конструктор стека</h1>
      <p className="mb-8 text-muted-foreground">
        Ответьте на вопросы и получите персональную рекомендацию AI-стека
      </p>

      <WizardStepper
        currentStep={currentStep}
        completedSteps={completedSteps}
        onStepClick={goToStep}
      />

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {currentStep === WIZARD_STEPS.length - 1 ? (
        <UsageScaleStep isSubmitting={recommend.isPending} onSubmit={handleSubmit} />
      ) : (
        <StepComponent />
      )}
    </div>
  );
}

// Map wizard step key to StackBuilderInput field
const stepFieldMap: Record<string, keyof StackBuilderInput> = {
  use_case: 'use_case',
  deployment: 'deployment_preference',
  budget: 'budget_sensitivity',
  privacy: 'privacy_requirement',
  language: 'language_requirement',
  capabilities: 'capabilities_needed',
  hardware: 'hardware_tier',
  skill_level: 'skill_level',
  usage_scale: 'usage_scale',
};
