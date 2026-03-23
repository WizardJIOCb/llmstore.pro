import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { RadioCardGroup } from '../RadioCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import { budgetSensitivityLabels } from '../../../lib/label-maps';
import type { BudgetSensitivity } from '@llmstore/shared';

const options = (Object.entries(budgetSensitivityLabels) as [BudgetSensitivity, string][]).map(
  ([value, label]) => ({ value, label }),
);

export function BudgetStep() {
  const { answers, setBudget, goNext, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Какой у вас бюджет?"
      subtitle="Учитываем стоимость API-вызовов, хостинга и лицензий"
      canGoBack={currentStep > 0}
      canGoNext={!!answers.budget_sensitivity}
      onBack={goBack}
      onNext={goNext}
    >
      <RadioCardGroup
        options={options}
        value={answers.budget_sensitivity}
        onChange={setBudget}
      />
    </WizardStepLayout>
  );
}
