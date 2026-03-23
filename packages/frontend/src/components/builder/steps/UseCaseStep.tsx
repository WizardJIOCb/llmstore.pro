import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { RadioCardGroup } from '../RadioCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import { wizardUseCaseLabels, wizardUseCaseDescriptions } from '../../../lib/label-maps';
import type { WizardUseCase } from '@llmstore/shared';

const options = (Object.entries(wizardUseCaseLabels) as [WizardUseCase, string][]).map(
  ([value, label]) => ({
    value,
    label,
    description: wizardUseCaseDescriptions[value],
  }),
);

export function UseCaseStep() {
  const { answers, setUseCase, goNext, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Какую задачу вы хотите решить?"
      subtitle="Выберите основной сценарий использования AI-стека"
      canGoBack={currentStep > 0}
      canGoNext={!!answers.use_case}
      onBack={goBack}
      onNext={goNext}
    >
      <RadioCardGroup
        options={options}
        value={answers.use_case}
        onChange={setUseCase}
        columns={2}
      />
    </WizardStepLayout>
  );
}
