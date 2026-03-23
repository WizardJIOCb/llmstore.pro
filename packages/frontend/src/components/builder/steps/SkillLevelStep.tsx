import { useStackBuilderStore } from '../../../stores/stack-builder-store';
import { RadioCardGroup } from '../RadioCardGroup';
import { WizardStepLayout } from '../WizardStepLayout';
import { skillLevelLabels, skillLevelDescriptions } from '../../../lib/label-maps';
import type { SkillLevel } from '@llmstore/shared';

const options = (Object.entries(skillLevelLabels) as [SkillLevel, string][]).map(
  ([value, label]) => ({
    value,
    label,
    description: skillLevelDescriptions[value],
  }),
);

export function SkillLevelStep() {
  const { answers, setSkillLevel, goNext, goBack, currentStep } = useStackBuilderStore();

  return (
    <WizardStepLayout
      title="Ваш уровень"
      subtitle="Поможет подобрать решения нужной сложности (можно пропустить)"
      canGoBack={currentStep > 0}
      canGoNext
      onBack={goBack}
      onNext={goNext}
    >
      <RadioCardGroup
        options={options}
        value={answers.skill_level}
        onChange={setSkillLevel}
        columns={1}
      />
    </WizardStepLayout>
  );
}
